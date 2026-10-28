import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { appToday } from "@/lib/tz";
import { waterTargetMl } from "@/lib/calculations";
import { excludedByDiet } from "@/lib/diet";

export const runtime = "nodejs";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/gaps?date=&locale= — günün gerçek defter verisinden eksik analizi.
 *
 * Kural tabanlı ve ANINDA (AI yok): kalan protein/lif/su boşluğu hesaplanır,
 * tohum kataloğundaki (101 gerçek yemek) yiyeceklerden boşluğu tek porsiyonda
 * en iyi kapatan 2-3 öneri seçilir. Diyet tercihi (vejetaryen/vegan) filtresi
 * uygulanır. Tek dokunuşla ekleme istemcide POST /api/diary ile yapılır.
 *
 * Neden sunucuda: katalog + porsiyon verisi tek doğruluk kaynağı olarak
 * burada yaşar; istemci yalnızca sayıları çizer.
 */

interface Suggestion {
  kind: "protein" | "fiber" | "water";
  foodId?: string;
  name: string;
  grams?: number;
  ml?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  satFat: number;
}

const round = (n: number) => Math.round(n);

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || appToday();
    if (!dateRe.test(date)) throw new ApiError("VALIDATION", 400);
    const locale = url.searchParams.get("locale") === "en" ? "en" : "tr";

    const [logs, targets, water, profile] = await Promise.all([
      db.mealLog.findMany({
        where: { userId: user.id, date, deletedAt: null, isTemplate: false },
        include: { items: true },
      }),
      db.targets.findUnique({ where: { userId: user.id } }),
      db.waterLog.findFirst({ where: { userId: user.id, date } }),
      db.profile.findUnique({ where: { userId: user.id } }),
    ]);

    const totals = logs.reduce(
      (acc, log) => {
        for (const it of log.items) {
          acc.kcal += it.kcal;
          acc.protein += it.protein;
          acc.fiber += it.fiber ?? 0;
        }
        return acc;
      },
      { kcal: 0, protein: 0, fiber: 0 }
    );

    const kcalTarget = targets?.calories ?? 2000;
    const proteinTarget = targets?.protein ?? 100;
    const fiberTarget = profile?.sex === "female" ? 25 : 30;
    const waterTarget = waterTargetMl(profile?.weightKg ?? null);

    const gaps = {
      kcalRemaining: Math.max(0, Math.round(kcalTarget - totals.kcal)),
      proteinRemaining: Math.max(0, Math.round(proteinTarget - totals.protein)),
      fiberRemaining: Math.max(0, Math.round(fiberTarget - totals.fiber)),
      waterRemainingMl: Math.max(0, waterTarget - (water?.ml ?? 0)),
    };

    const suggestions: Suggestion[] = [];

    // --- katalog: tohumlanmış ortak yiyecekler (kullanıcıya özel olmayan) ---
    const diet = profile?.dietPreference ?? "any";
    const foods = await db.food.findMany({
      where: { userId: null, deletedAt: null, source: "SEED" },
    });
    // Diyet filtresi: kategori + isim bazlı tarama (bkz. src/lib/diet.ts)
    const allowed = foods.filter((f) => !excludedByDiet(f, diet));

    // --- PROTEİN boşluğu: en verimli protein kaynakları (g/kcal yoğunluğu) ---
    if (gaps.proteinRemaining >= 20) {
      const proteinFoods = allowed
        .filter((f) => f.protein100 >= 11 && f.kcal100 <= 260)
        .sort(
          (a, b) => b.protein100 / Math.max(1, b.kcal100) - a.protein100 / Math.max(1, a.kcal100)
        )
        .slice(0, 2);
      for (const f of proteinFoods) {
        // boşluğun ~%55'ini tek porsiyonda kapat (düz 10g adım, 60-300g arası)
        const raw = (gaps.proteinRemaining * 0.55) / (f.protein100 / 100);
        const grams = Math.min(300, Math.max(60, Math.round(raw / 10) * 10));
        const k = grams / 100;
        suggestions.push({
          kind: "protein",
          foodId: f.id,
          name: (locale === "en" ? f.nameEn : f.name) || f.name,
          grams,
          kcal: round(f.kcal100 * k),
          protein: round(f.protein100 * k),
          carbs: round(f.carb100 * k),
          fat: round(f.fat100 * k),
          fiber: round(f.fiber100 * k),
          sugar: round(f.sugar100 * k),
          sodium: round(f.sodium100 * k),
          satFat: round(f.satFat100 * k),
        });
      }
    }

    // --- LİF boşluğu: meyve/sebze/kuruyemiş kaynakları ---
    if (gaps.fiberRemaining >= 6) {
      const fiberFoods = allowed
        .filter(
          (f) =>
            f.fiber100 >= 2.5 &&
            ["fruit", "vegetable", "nut", "grain"].includes(f.category)
        )
        .sort((a, b) => b.fiber100 - a.fiber100)
        .slice(0, 1);
      for (const f of fiberFoods) {
        const raw = (gaps.fiberRemaining * 0.6) / (f.fiber100 / 100);
        const grams = Math.min(250, Math.max(50, Math.round(raw / 10) * 10));
        const k = grams / 100;
        suggestions.push({
          kind: "fiber",
          foodId: f.id,
          name: (locale === "en" ? f.nameEn : f.name) || f.name,
          grams,
          kcal: round(f.kcal100 * k),
          protein: round(f.protein100 * k),
          carbs: round(f.carb100 * k),
          fat: round(f.fat100 * k),
          fiber: round(f.fiber100 * k),
          sugar: round(f.sugar100 * k),
          sodium: round(f.sodium100 * k),
          satFat: round(f.satFat100 * k),
        });
      }
    }

    // --- SU boşluğu: bardak cinsinden net öneri (2 bardak) ---
    if (gaps.waterRemainingMl >= 400) {
      suggestions.push({
        kind: "water",
        name: locale === "en" ? "Water" : "Su",
        ml: 500,
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        satFat: 0,
      });
    }

    return Response.json({
      gaps,
      targets: { kcal: kcalTarget, protein: proteinTarget, fiber: fiberTarget, waterMl: waterTarget },
      suggestions,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
