/**
 * KaloriAI — Demo hesap üreticisi (SERVER-ONLY).
 *
 * İki hazır persona:
 *  1. "athlete"    — Kaan Demir: sporcu modu, premium, kas yapma hedefi,
 *                    antrenman günü hedefleri + karbon döngüsü, yüksek protein günleri.
 *  2. "weightloss" — Elif Yılmaz: kilo verme (0.5 kg/hafta), ücretsiz plan,
 *                    gerçekçi kaçamak günler, 16:8 oruç geçmişi.
 *
 * Veriler SEED gıdalarından per-100g değerlerle hesaplanır — mock sayı yok.
 * Tarihler Europe/Istanbul takvimine göre üretilir (hedef kitle dilimi ile uyumlu).
 * Deterministik: her demo turu aynı tohumdan üretilir (mulberry32).
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { calcTargets, workoutCalories, localDateStr } from "@/lib/calculations";
import type { Food, User } from "@prisma/client";

export const DEMO_PASSWORD = "demo1234";

export interface DemoAccountMeta {
  id: "athlete" | "weightloss";
  email: string;
  name: string;
}

export const DEMO_ACCOUNTS: DemoAccountMeta[] = [
  { id: "athlete", email: "kaan@demo.kaloriai.app", name: "Kaan Demir" },
  { id: "weightloss", email: "elif@demo.kaloriai.app", name: "Elif Yılmaz" },
];

/* ------------------------------------------------------------------ */
/* Tarih yardımcıları — Europe/Istanbul takvim günü                    */
/* ------------------------------------------------------------------ */

/** Date → YYYY-MM-DD (Istanbul takvim günü) */
const fmtLocal = localDateStr;

/** daysAgo gün önce, Istanbul saatiyle hour:minute → Date instant */
function dateAt(daysAgo: number, hour = 12, minute = 0): Date {
  const localToday = fmtLocal(new Date());
  const anchor = new Date(`${localToday}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - daysAgo);
  anchor.setUTCHours(hour - 3, minute, 0, 0); // Istanbul = UTC+3
  return anchor;
}

/** daysAgo gün önceki Istanbul takvim günü (YYYY-MM-DD) */
function localDate(daysAgo: number): string {
  return fmtLocal(dateAt(daysAgo));
}

/** YYYY-MM-DD → haftanın günü (0=Pazar) */
function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/* ------------------------------------------------------------------ */
/* Deterministik RNG + yardımcılar                                     */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pick = <T,>(arr: T[], i: number): T => arr[i % arr.length] as T;
/** Gram miktarına %±8 deterministik oynama (5 g yuvarlamalı) */
const jitter = (grams: number, rnd: () => number): number =>
  Math.max(10, Math.round((grams * (0.92 + rnd() * 0.16)) / 5) * 5);

/* ------------------------------------------------------------------ */
/* Gıdalar                                                             */
/* ------------------------------------------------------------------ */

type FoodMap = Map<string, Food>;

async function loadSeedFoods(): Promise<FoodMap> {
  const foods = await db.food.findMany({ where: { source: "SEED", deletedAt: null } });
  return new Map(foods.map((f) => [f.name.toLowerCase(), f]));
}

interface PrismaItemCreate {
  foodId: string;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  satFat: number;
  source: string;
}

/** SEED gıdasından MealLogItem verisi üretir (per-100g × gram) */
function buildItem(foodMap: FoodMap, name: string, grams: number, source: string): PrismaItemCreate | null {
  const f = foodMap.get(name.toLowerCase());
  if (!f) {
    console.warn(`[demo] SEED gıdası bulunamadı, atlandı: ${name}`);
    return null;
  }
  const k = grams / 100;
  return {
    foodId: f.id,
    name: f.name,
    grams,
    kcal: Math.round(f.kcal100 * k),
    protein: r1(f.protein100 * k),
    carbs: r1(f.carb100 * k),
    fat: r1(f.fat100 * k),
    fiber: r1(f.fiber100 * k),
    sugar: r1(f.sugar100 * k),
    sodium: Math.round(f.sodium100 * k),
    satFat: r1(f.satFat100 * k),
    source,
  };
}

/* ------------------------------------------------------------------ */
/* Gün planı tipleri                                                   */
/* ------------------------------------------------------------------ */

type Tuple = [string, number];

interface WorkoutSpec {
  type: string;
  name: string;
  durationMin: number;
  met: number;
  intensity: "light" | "moderate" | "vigorous";
}

interface DayPlan {
  breakfast: Tuple[];
  lunch: Tuple[];
  /** null → o öğün henüz kaydedilmemiş (bugünkü "gün devam ediyor" hissi) */
  snacks: Tuple[] | null;
  dinner: Tuple[] | null;
  waterMl: number;
  workout?: WorkoutSpec;
  note?: { mood: string; text: string };
}

const MEAL_HOURS: Record<string, { h: number; m: number }> = {
  breakfast: { h: 8, m: 15 },
  lunch: { h: 12, m: 30 },
  snacks: { h: 16, m: 0 },
  dinner: { h: 19, m: 30 },
};

/* ------------------------------------------------------------------ */
/* Persona 1 — Kaan (sporcu, premium)                                  */
/* ------------------------------------------------------------------ */

const KAAN_BREAKFASTS: Tuple[][] = [
  [["Menemen", 300], ["Beyaz Peynir", 60], ["Simit", 150], ["Çay (sade)", 200]],
  [["Yumurta (haşlanmış)", 150], ["Yulaf Ezmesi", 80], ["Süt (yarım yağlı)", 250], ["Muz", 120]],
  [["Çılbır", 250], ["Tam Buğday Ekmek", 100], ["Beyaz Peynir", 50], ["Türk Kahvesi (orta şekerli)", 100]],
  [["Yulaf Ezmesi", 90], ["Whey Protein Tozu", 40], ["Fındık", 25], ["Muz", 120]],
];

const KAAN_LUNCHES: Tuple[][] = [
  [["Izgara Tavuk Göğsü", 280], ["Bulgur Pilavı", 350], ["Cacık", 200]],
  [["Izgara Köfte", 220], ["Beyaz Pilav", 280], ["Cacık", 150]],
  [["Tavuk Döner", 300], ["Beyaz Ekmek", 100], ["Ayran", 250], ["Acılı Ezme", 100]],
  [["Izgara Tavuk But", 280], ["İç Pilav", 250], ["Yoğurt (sade, tam yağlı)", 200]],
];

const KAAN_DINNERS: Tuple[][] = [
  [["Izgara Somon", 250], ["Zeytinyağlı Yaprak Sarma", 200], ["Yoğurt (sade, tam yağlı)", 150]],
  [["Adana Kebap", 250], ["İç Pilav", 250], ["Ayran", 250], ["Acılı Ezme", 80]],
  [["Etli Güveç", 400], ["Pişmiş Bulgur", 250], ["Cacık", 200]],
  [["Izgara Levrek", 300], ["Hummus", 120], ["Tam Buğday Ekmek", 80], ["Salatalık", 100]],
];

const KAAN_NOTES: { mood: string; text: string }[] = [
  { mood: "great", text: "Sabah antrenmanı sonrası whey + muz — protein hedefine iyi başladım." },
  { mood: "good", text: "Öğle sonrası 20 dk yürüyüş yaptım, toparlanma iyi gitti." },
  { mood: "good", text: "Haftalık tartı: +0,3 kg. Kas hedefi için yolunda gidiyor." },
  { mood: "okay", text: "Bacak günü yıkıcıydı, yarın karbonhidratı bir tık artıracağım." },
  { mood: "great", text: "Antrenman günü hedefi 3.500+ — protein 180'i geçti, harika." },
];

function kaanDay(dayIndex: number, weekday: number, rnd: () => number): DayPlan {
  const isToday = dayIndex === 0;
  const rot = dayIndex % 4;
  // Antrenman: Pzt/Per/Cmt güç + Sal koşu (bugün dinlenme)
  let workout: WorkoutSpec | undefined;
  if (!isToday) {
    if (weekday === 1) workout = { type: "strength", name: "İtiş (Göğüs-Triceps)", durationMin: 65, met: 5.0, intensity: "vigorous" };
    else if (weekday === 2) workout = { type: "running", name: "Tempolu koşu", durationMin: 40, met: 8.0, intensity: "moderate" };
    else if (weekday === 4) workout = { type: "strength", name: "Çekiş (Sırt-Biceps)", durationMin: 60, met: 5.0, intensity: "vigorous" };
    else if (weekday === 6) workout = { type: "strength", name: "Bacak günü", durationMin: 65, met: 5.5, intensity: "vigorous" };
  }
  const training = !!workout;
  const note = !isToday && dayIndex % 3 === 1 ? pick(KAAN_NOTES, Math.floor(dayIndex / 3)) : undefined;
  return {
    breakfast: pick(KAAN_BREAKFASTS, rot).map(([n, g], i) => [n, i === 0 ? jitter(g, rnd) : g] as Tuple),
    lunch: pick(KAAN_LUNCHES, rot).map(([n, g], i) => [n, i === 0 ? jitter(g, rnd) : g] as Tuple),
    dinner: isToday ? null : pick(KAAN_DINNERS, rot).map(([n, g], i) => [n, i === 0 ? jitter(g, rnd) : g] as Tuple),
    snacks: isToday
      ? null
      : training
        ? [["Whey Protein Tozu", 40], ["Muz", 120], ["Antep Fıstığı", 25], ["Bal", 20]]
        : [["Badem", 35], ["Elma", 200], ["Bal", 15]],
    waterMl: isToday ? 1800 : training ? 3300 + Math.round(rnd() * 6) * 50 : 2500 + Math.round(rnd() * 8) * 50,
    workout,
    note,
  };
}

/* ------------------------------------------------------------------ */
/* Persona 2 — Elif (kilo verme, ücretsiz)                             */
/* ------------------------------------------------------------------ */

const ELIF_BREAKFASTS: Tuple[][] = [
  [["Menemen", 220], ["Tam Buğday Ekmek", 50], ["Çay (sade)", 200]],
  [["Yoğurt (sade, tam yağlı)", 220], ["Yulaf Ezmesi", 40], ["Muz", 90]],
  [["Beyaz Peynir", 40], ["Domates", 80], ["Salatalık", 70], ["Simit", 80]],
  [["Yumurta (haşlanmış)", 100], ["Tam Buğday Ekmek", 50], ["Çilek Reçeli", 15], ["Çay (sade)", 150]],
];

const ELIF_LUNCHES: Tuple[][] = [
  [["Mercimek Çorbası", 300], ["Tam Buğday Ekmek", 60], ["Salatalık", 100]],
  [["Nohut Yemeği", 280], ["Bulgur Pilavı", 180], ["Yoğurt (sade, tam yağlı)", 120]],
  [["Ton Balığı Konserve (suda)", 100], ["Zeytinyağlı Yaprak Sarma", 180], ["Limonata", 150]],
  [["Kuru Fasulye", 280], ["Beyaz Pilav", 150], ["Salatalık", 80]],
];

const ELIF_DINNERS: Tuple[][] = [
  [["Izgara Levrek", 220], ["Zeytinyağlı Yaprak Sarma", 150], ["Tam Buğday Ekmek", 40]],
  [["Etli Biber Dolması", 300], ["Yoğurt (sade, tam yağlı)", 150], ["Tam Buğday Ekmek", 40]],
  [["Izgara Tavuk Göğsü", 160], ["Hummus", 80], ["Domates", 80], ["Tam Buğday Ekmek", 40]],
  [["Karnıyarık", 280], ["Cacık", 180], ["Tam Buğday Ekmek", 40]],
];

const ELIF_NOTES: { mood: string; text: string }[] = [
  { mood: "okay", text: "Bugün akşamı hafif tutmayı planlıyorum." },
  { mood: "good", text: "16 saat oruç tamamlandı, kahvaltıda çok aç olmadım." },
  { mood: "okay", text: "Hafta sonu pide kaçamağı yaptım ama hafta içinde dengeledim." },
  { mood: "great", text: "Su hedefini ilk kez tamamladım!" },
  { mood: "good", text: "Tartı −0,4 kg. Yavaş ama kalıcı gidiyor." },
];

function elifDay(dayIndex: number, weekday: number, rnd: () => number): DayPlan {
  const isToday = dayIndex === 0;
  const rot = dayIndex % 4;
  // "Kaçamak" gün: 6 gün önce (hafta sonu) pide + baklava
  const feast = dayIndex === 6;
  let workout: WorkoutSpec | undefined;
  if (!isToday) {
    if ([1, 3, 5, 0].includes(weekday)) workout = { type: "walking", name: "Tempolu yürüyüş", durationMin: 40, met: 3.5, intensity: "moderate" };
    else if (weekday === 6) workout = { type: "yoga", name: "Akış yoga", durationMin: 30, met: 2.5, intensity: "light" };
  }
  const note = !isToday && dayIndex % 3 === 2 ? pick(ELIF_NOTES, Math.floor(dayIndex / 3)) : undefined;
  return {
    breakfast: pick(ELIF_BREAKFASTS, rot).map(([n, g], i) => [n, i === 0 ? jitter(g, rnd) : g] as Tuple),
    lunch: feast
      ? [["Kaşarlı Pide", 250], ["Ayran", 200]]
      : pick(ELIF_LUNCHES, rot).map(([n, g], i) => [n, i === 0 ? jitter(g, rnd) : g] as Tuple),
    dinner: isToday
      ? null
      : pick(ELIF_DINNERS, rot).map(([n, g], i) => [n, i === 0 ? jitter(g, rnd) : g] as Tuple),
    snacks: isToday
      ? null
      : feast
        ? [["Baklava", 60], ["Türk Kahvesi (orta şekerli)", 100]]
        : pick([ [["Elma", 150]], [["Badem", 12]], [["Ayran", 200]], [["Türk Kahvesi (sade)", 100], ["Lokum", 20]] ], rot),
    waterMl: isToday ? 900 : 1500 + Math.round(rnd() * 14) * 50,
    workout,
    note,
  };
}

/* ------------------------------------------------------------------ */
/* Profil hedefleri (calcTargets ile tutarlı hesap)                    */
/* ------------------------------------------------------------------ */

const KAAN_PROFILE = {
  sex: "male",
  birthDate: "1998-05-14",
  heightCm: 181,
  weightKg: 82.4,
  goalWeightKg: 85,
  bodyFatPct: 15,
  goal: "muscle",
  weeklyRateKg: 0.25,
  activityLevel: "active",
  userType: "athlete",
  dietPreference: "any",
  allergens: "",
  formula: "katch",
  trainingDayTarget: true,
  carbCycling: true,
} as const;

const ELIF_PROFILE = {
  sex: "female",
  birthDate: "1991-09-02",
  heightCm: 165,
  weightKg: 68.3,
  goalWeightKg: 62,
  bodyFatPct: null,
  goal: "lose",
  weeklyRateKg: 0.5,
  activityLevel: "moderate",
  userType: "general",
  dietPreference: "any",
  allergens: "",
  formula: "mifflin",
  trainingDayTarget: false,
  carbCycling: false,
} as const;

const DAYS = 14; // kayıtlı gün sayısı (bugün dahil)

/* ------------------------------------------------------------------ */
/* Ortak tohum parçaları                                               */
/* ------------------------------------------------------------------ */

async function seedMeals(
  userId: string,
  foodMap: FoodMap,
  dayFn: (dayIndex: number, weekday: number, rnd: () => number) => DayPlan
): Promise<void> {
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = localDate(i);
    const rnd = mulberry32(0x5eed + i * 97);
    const plan = dayFn(i, weekdayOf(date), rnd);
    const entries: [string, Tuple[] | null][] = [
      ["breakfast", plan.breakfast],
      ["lunch", plan.lunch],
      ["snacks", plan.snacks],
      ["dinner", plan.dinner],
    ];
    for (const [mealType, tuples] of entries) {
      if (!tuples || tuples.length === 0) continue;
      const items = tuples
        .map(([n, g]) => buildItem(foodMap, n, g, i === 0 ? "ai" : "manual"))
        .filter((x): x is PrismaItemCreate => x !== null);
      if (items.length === 0) continue;
      const hh = MEAL_HOURS[mealType] ?? { h: 12, m: 0 };
      await db.mealLog.create({
        data: {
          userId,
          date,
          mealType,
          createdAt: dateAt(i, hh.h, hh.m),
          items: { create: items },
        },
      });
    }
  }
}

async function seedMeasurements(
  userId: string,
  start: number,
  end: number,
  extra: { bodyFat?: number[]; waist?: number[] } = {}
): Promise<void> {
  const points = 11; // 20 gün boyunca 2 günde bir
  const rnd = mulberry32(0xa71f);
  const rows = Array.from({ length: points }, (_, i) => {
    const daysAgo = (points - 1 - i) * 2;
    const isLast = i === points - 1;
    const t = i / (points - 1);
    const noise = isLast ? 0 : (rnd() - 0.5) * 0.16;
    const weightKg = Math.round((start + (end - start) * t + noise) * 10) / 10;
    const row: {
      userId: string;
      date: string;
      weightKg: number;
      bodyFatPct?: number;
      waistCm?: number;
    } = { userId, date: localDate(daysAgo), weightKg };
    if (extra.bodyFat) row.bodyFatPct = Math.round((extra.bodyFat[i] ?? extra.bodyFat[extra.bodyFat.length - 1]!) * 10) / 10;
    if (extra.waist) row.waistCm = Math.round((extra.waist[i] ?? extra.waist[extra.waist.length - 1]!) * 10) / 10;
    return row;
  });
  await db.bodyMeasurement.createMany({ data: rows });
}

async function seedWorkouts(userId: string, dayFn: (dayIndex: number, weekday: number) => WorkoutSpec | undefined, weightKg: number): Promise<void> {
  const rows: { userId: string; date: string; type: string; name: string; durationMin: number; met: number; intensity: string; calories: number }[] = [];
  for (let i = DAYS - 1; i >= 1; i--) {
    const date = localDate(i);
    const w = dayFn(i, weekdayOf(date));
    if (!w) continue;
    rows.push({
      userId,
      date,
      type: w.type,
      name: w.name,
      durationMin: w.durationMin,
      met: w.met,
      intensity: w.intensity,
      calories: workoutCalories(w.met, weightKg, w.durationMin),
    });
  }
  await db.workout.createMany({ data: rows });
}

async function seedWater(userId: string, dayFn: (dayIndex: number, rnd: () => number) => number): Promise<void> {
  const rnd = mulberry32(0x50a7);
  const rows = Array.from({ length: DAYS }, (_, k) => {
    const i = DAYS - 1 - k;
    return { userId, date: localDate(i), ml: dayFn(i, rnd) };
  });
  await db.waterLog.createMany({ data: rows });
}

/** Günlük adım toplamları — Apple Health senkronu simülasyonu (source=apple_health) */
async function seedSteps(userId: string, dayFn: (dayIndex: number, weekday: number, rnd: () => number) => number): Promise<void> {
  const rnd = mulberry32(0x57e9);
  const rows = Array.from({ length: DAYS }, (_, k) => {
    const i = DAYS - 1 - k;
    return { userId, date: localDate(i), count: dayFn(i, weekdayOf(localDate(i)), rnd), source: "apple_health" };
  });
  await db.stepsLog.createMany({ data: rows });
}

async function seedNotes(userId: string, notes: { dayIndex: number; mood: string; text: string }[]): Promise<void> {
  await db.dailyNote.createMany({
    data: notes.map((n) => ({ userId, date: localDate(n.dayIndex), mood: n.mood, text: n.text })),
  });
}

async function seedFavorites(userId: string, names: string[]): Promise<void> {
  const foods = await db.food.findMany({
    where: { source: "SEED", deletedAt: null, name: { in: names } },
    select: { id: true },
  });
  if (foods.length === 0) return;
  await db.favorite.createMany({ data: foods.map((f) => ({ userId, foodId: f.id })) });
  await db.frequentFood.createMany({
    data: foods.map((f, i) => ({ userId, foodId: f.id, count: 12 - i * 2, lastUsed: dateAt(i) })),
  });
}

/* ------------------------------------------------------------------ */
/* Persona tohumlayıcıları                                             */
/* ------------------------------------------------------------------ */

async function seedAthlete(userId: string, foodMap: FoodMap): Promise<void> {
  const base = calcTargets({ ...KAAN_PROFILE }, false);
  const train = calcTargets({ ...KAAN_PROFILE }, true);

  await db.profile.create({
    data: {
      userId,
      ...KAAN_PROFILE,
      onboarded: true,
      consentAt: new Date(),
    },
  });
  await db.targets.create({
    data: {
      userId,
      calories: base.calories,
      protein: base.macros.protein,
      carbs: base.macros.carbs,
      fat: base.macros.fat,
      tdeeEstimate: base.tdee,
      adaptiveEnabled: true,
      trainCalories: train.calories,
      trainProtein: train.macros.protein,
      trainCarbs: train.macros.carbs,
      trainFat: train.macros.fat,
    },
  });
  await db.subscription.create({
    data: { userId, tier: "premium", renewsAt: new Date(Date.now() + 30 * 864e5) },
  });
  await db.reminder.createMany({
    data: [
      { userId, type: "breakfast", time: "07:30" },
      { userId, type: "lunch", time: "12:30" },
      { userId, type: "water", time: "15:30" },
      { userId, type: "workout", time: "18:00" },
    ],
  });

  await seedMeals(userId, foodMap, kaanDay);
  await seedMeasurements(userId, 81.2, 82.4, { bodyFat: [15.6, 15.5, 15.5, 15.4, 15.3, 15.3, 15.2, 15.2, 15.1, 15.1, 15.0] });
  await seedWorkouts(
    userId,
    (i, wd) => {
      if (i === 0) return undefined;
      if (wd === 1) return { type: "strength", name: "İtiş (Göğüs-Triceps)", durationMin: 65, met: 5.0, intensity: "vigorous" };
      if (wd === 2) return { type: "running", name: "Tempolu koşu", durationMin: 40, met: 8.0, intensity: "moderate" };
      if (wd === 4) return { type: "strength", name: "Çekiş (Sırt-Biceps)", durationMin: 60, met: 5.0, intensity: "vigorous" };
      if (wd === 6) return { type: "strength", name: "Bacak günü", durationMin: 65, met: 5.5, intensity: "vigorous" };
      return undefined;
    },
    82.4
  );
  await seedWater(userId, (i, rnd) => {
    if (i === 0) return 1800;
    const wd = weekdayOf(localDate(i));
    const training = wd === 1 || wd === 2 || wd === 4 || wd === 6;
    return (training ? 3300 : 2500) + Math.round(rnd() * 8) * 50;
  });
  await seedSteps(userId, (i, wd, rnd) => {
    if (i === 0) return 5800; // gün devam ediyor
    const training = wd === 1 || wd === 2 || wd === 4 || wd === 6;
    return (training ? 11500 : 7800) + Math.round(rnd() * 12) * 100;
  });
  await seedNotes(
    userId,
    [1, 4, 7, 10, 13].map((dayIndex, k) => ({ dayIndex, ...(KAAN_NOTES[k % KAAN_NOTES.length] as { mood: string; text: string }) }))
  );
  await seedFavorites(userId, ["Whey Protein Tozu", "Izgara Tavuk Göğsü", "Yulaf Ezmesi", "Süzme Yoğurt"]);
  await db.aiChatMessage.createMany({
    data: [
      { userId, role: "user", content: "Kas yapmak için günde ne kadar protein almalıyım?", createdAt: dateAt(1, 9, 5) },
      { userId, role: "assistant", content: "Hedefin 82 kg ağırlıkla günde ~165 g protein (2,0 g/kg). Antrenman günlerinde 2,2 g/kg'a (≈181 g) çıkabilirsin. Bunu 3-4 öğüne yayın, antrenman sonrası whey + muz pratik bir başlangıç.", createdAt: dateAt(1, 9, 6) },
    ],
  });
}

async function seedWeightLoss(userId: string, foodMap: FoodMap): Promise<void> {
  const targets = calcTargets({ ...ELIF_PROFILE }, false);

  await db.profile.create({
    data: {
      userId,
      ...ELIF_PROFILE,
      onboarded: true,
      consentAt: new Date(),
    },
  });
  await db.targets.create({
    data: {
      userId,
      calories: targets.calories,
      protein: targets.macros.protein,
      carbs: targets.macros.carbs,
      fat: targets.macros.fat,
      tdeeEstimate: targets.tdee,
      adaptiveEnabled: true,
    },
  });
  await db.subscription.create({ data: { userId, tier: "free" } });
  await db.reminder.createMany({
    data: [
      { userId, type: "breakfast", time: "08:00" },
      { userId, type: "water", time: "14:00" },
      { userId, type: "dinner", time: "19:30" },
      { userId, type: "weigh_in", time: "09:00" },
    ],
  });

  await seedMeals(userId, foodMap, elifDay);
  await seedMeasurements(userId, 69.8, 68.3, { waist: [82, 81.6, 81.3, 81.1, 80.7, 80.4, 80.2, 79.9, 79.6, 79.4, 79.1] });
  await seedWorkouts(
    userId,
    (i, wd) => {
      if (i === 0) return undefined;
      if ([1, 3, 5, 0].includes(wd)) return { type: "walking", name: "Tempolu yürüyüş", durationMin: 40, met: 3.5, intensity: "moderate" };
      if (wd === 6) return { type: "yoga", name: "Akış yoga", durationMin: 30, met: 2.5, intensity: "light" };
      return undefined;
    },
    68.3
  );
  await seedWater(userId, (i, rnd) => (i === 0 ? 900 : 1500 + Math.round(rnd() * 14) * 50));
  await seedSteps(userId, (i, wd, rnd) => {
    if (i === 0) return 3200;
    const walking = [1, 3, 5, 0].includes(wd);
    return (walking ? 9200 : 5400) + Math.round(rnd() * 15) * 100;
  });
  await seedNotes(
    userId,
    [2, 5, 6, 8, 11].map((dayIndex, k) => ({ dayIndex, ...(ELIF_NOTES[k % ELIF_NOTES.length] as { mood: string; text: string }) }))
  );
  await seedFavorites(userId, ["Mercimek Çorbası", "Izgara Levrek", "Yulaf Ezmesi", "Türk Kahvesi (sade)"]);
  // Tamamlanmış 16:8 oruç (2-3 gün önce)
  await db.fastingLog.create({
    data: {
      userId,
      startAt: dateAt(3, 20, 5),
      endAt: dateAt(2, 12, 10),
      targetHours: 16,
      note: "16:8 — akşam 20:00 son yemek",
    },
  });
}

/* ------------------------------------------------------------------ */
/* Temizlik + idempotent giriş                                         */
/* ------------------------------------------------------------------ */

async function wipeDemoData(userId: string): Promise<void> {
  await db.aiAnalysis.deleteMany({ where: { userId } });
  await db.mealLog.deleteMany({ where: { userId } });
  await db.waterLog.deleteMany({ where: { userId } });
  await db.stepsLog.deleteMany({ where: { userId } });
  await db.workout.deleteMany({ where: { userId } });
  await db.bodyMeasurement.deleteMany({ where: { userId } });
  await db.progressPhoto.deleteMany({ where: { userId } });
  await db.favorite.deleteMany({ where: { userId } });
  await db.reminder.deleteMany({ where: { userId } });
  await db.usageQuota.deleteMany({ where: { userId } });
  await db.frequentFood.deleteMany({ where: { userId } });
  await db.aiChatMessage.deleteMany({ where: { userId } });
  await db.plannerDay.deleteMany({ where: { userId } });
  await db.fastingLog.deleteMany({ where: { userId } });
  await db.dailyNote.deleteMany({ where: { userId } });
  await db.pushEndpoint.deleteMany({ where: { userId } });
  await db.session.deleteMany({ where: { userId } });
  await db.subscription.deleteMany({ where: { userId } });
  await db.targets.deleteMany({ where: { userId } });
  await db.profile.deleteMany({ where: { userId } });
}

async function doEnsureDemoUser(meta: DemoAccountMeta, reset: boolean): Promise<User> {
  let user = await db.user.findUnique({ where: { email: meta.email } });
  if (!user) {
    user = await db.user.create({
      data: {
        email: meta.email,
        passwordHash: hashPassword(DEMO_PASSWORD),
        name: meta.name,
        locale: "tr",
        unitSystem: "metric",
      },
    });
  }

  // Reset istenmediyse ve veri zaten sağlamsa → olduğu gibi kullan (seri/geçmiş korunur)
  if (!reset) {
    const [profile, logCount] = await Promise.all([
      db.profile.findUnique({ where: { userId: user.id }, select: { onboarded: true } }),
      db.mealLog.count({ where: { userId: user.id, isTemplate: false } }),
    ]);
    if (profile?.onboarded && logCount > 0) return user;
  }

  await wipeDemoData(user.id);

  const foodMap = await loadSeedFoods();
  if (meta.id === "athlete") await seedAthlete(user.id, foodMap);
  else await seedWeightLoss(user.id, foodMap);

  return await db.user.findUniqueOrThrow({ where: { id: user.id } });
}

/** Aynı demo için eşzamanlı çağrıları tek tohumlamaya indirger */
const inflight = new Map<string, Promise<User>>();

export function ensureDemoUser(meta: DemoAccountMeta, reset: boolean): Promise<User> {
  const key = `${meta.id}${reset ? ":reset" : ""}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = doEnsureDemoUser(meta, reset).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
