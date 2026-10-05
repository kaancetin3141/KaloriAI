/**
 * KaloriAI — Pure calculation functions.
 * No DB, no side effects — unit-testable. (Spec §4: "Keep calculation logic in pure functions")
 */

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain" | "muscle" | "performance";
export type UserType = "general" | "athlete";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Safe calorie floor (disordered-eating protection, spec §7) */
export const CALORIE_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };
/** 1 kg body fat ≈ 7700 kcal */
export const KCAL_PER_KG = 7700;
/** Athlete protein range g/kg (spec §4) */
export const ATHLETE_PROTEIN_GKG = { min: 1.6, max: 2.2 } as const;

export function calcAge(birthDate: string, now: Date = new Date()): number {
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return 30;
  const m = now.getMonth() - b.getMonth();
  let age = now.getFullYear() - b.getFullYear();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return Math.max(0, age);
}

/** Mifflin-St Jeor */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/** Katch-McArdle (requires body fat %) */
export function bmrKatch(weightKg: number, bodyFatPct: number): number {
  const lbm = weightKg * (1 - Math.min(Math.max(bodyFatPct, 3), 60) / 100);
  return 370 + 21.6 * lbm;
}

export function calcTdee(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity]);
}

/** kcal delta from weekly rate of change */
export function goalDelta(goal: Goal, weeklyRateKg: number): number {
  const safeRate = Math.min(Math.max(weeklyRateKg, 0.1), 1.0);
  switch (goal) {
    case "lose":
      return -Math.round((safeRate * KCAL_PER_KG) / 7);
    case "gain":
      return Math.round((safeRate * KCAL_PER_KG) / 7);
    case "muscle":
      return 250;
    default:
      return 0;
  }
}

export interface MacroSplit {
  protein: number;
  carbs: number;
  fat: number;
}

/** General user split: 25P / 45C / 30F */
export function generalMacros(calories: number): MacroSplit {
  return {
    protein: Math.round((calories * 0.25) / 4),
    carbs: Math.round((calories * 0.45) / 4),
    fat: Math.round((calories * 0.3) / 9),
  };
}

/** Athlete macros: protein g/kg based (1.6-2.2), fat 25%, carbs scale with training load */
export function athleteMacros(
  calories: number,
  weightKg: number,
  goal: Goal,
  trainingDay: boolean
): MacroSplit {
  let gkg = goal === "lose" ? 2.2 : goal === "muscle" || goal === "performance" ? 2.0 : 1.8;
  if (trainingDay && goal === "muscle") gkg = 2.2;
  const protein = Math.round(weightKg * gkg);
  const fat = Math.round((calories * (trainingDay ? 0.22 : 0.25)) / 9);
  const carbs = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}

export interface TargetInput {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  goalWeightKg?: number | null;
  bodyFatPct?: number | null;
  goal: Goal;
  weeklyRateKg: number;
  activityLevel: ActivityLevel;
  userType: UserType;
}

export interface TargetResult {
  formula: "mifflin" | "katch";
  bmr: number;
  tdee: number;
  calories: number;
  macros: MacroSplit;
  floored: boolean;
}

/** Full target calculation pipeline (spec §4) */
export function calcTargets(input: TargetInput, trainingDay: boolean = false): TargetResult {
  const age = calcAge(input.birthDate);
  const useKatch = input.bodyFatPct != null && input.bodyFatPct > 0;
  const bmr = Math.round(
    useKatch
      ? bmrKatch(input.weightKg, input.bodyFatPct as number)
      : bmrMifflin(input.sex, input.weightKg, input.heightCm, age)
  );
  let tdee = calcTdee(bmr, input.activityLevel);
  let calories = Math.max(tdee + goalDelta(input.goal, input.weeklyRateKg), 0);
  let floored = false;
  const floor = CALORIE_FLOOR[input.sex];
  if (calories < floor) {
    calories = floor;
    floored = true;
  }
  const macros =
    input.userType === "athlete"
      ? athleteMacros(calories, input.weightKg, input.goal, trainingDay)
      : generalMacros(calories);
  return { formula: useKatch ? "katch" : "mifflin", bmr, tdee, calories, macros, floored };
}

/** MET-based workout calories: kcal/min = MET × 3.5 × kg / 200 */
export function workoutCalories(met: number, weightKg: number, durationMin: number): number {
  return Math.round(((met * 3.5 * weightKg) / 200) * durationMin);
}

export function metForIntensity(baseMet: number, intensity: "light" | "moderate" | "vigorous"): number {
  const factor = intensity === "light" ? 0.8 : intensity === "vigorous" ? 1.25 : 1;
  return Math.round(baseMet * factor * 10) / 10;
}

/** Simple moving average over series of {date, value} */
export function movingAverage(
  series: { date: string; value: number | null }[],
  window = 7
): { date: string; value: number | null; avg: number | null }[] {
  const vals = series.map((s) => s.value);
  return series.map((s, i) => {
    const slice = vals.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return {
      date: s.date,
      value: s.value,
      avg: slice.length >= Math.min(3, window) ? Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 100) / 100 : null,
    };
  });
}

/** Linear regression slope helper (kg/day) */
function regressionSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export interface AdaptiveInput {
  /** last N days of daily intake kcal (null = not logged) */
  dailyIntake: (number | null)[];
  /** weight measurements chronological */
  weights: { date: string; weightKg: number }[];
  previousTdee: number | null;
}

/**
 * MacroFactor-style adaptive TDEE:
 * TDEE = avg intake − (Δweight_kg/day × 7700), smoothed/clamped.
 */
export function adaptiveTdee(input: AdaptiveInput): { tdee: number; confidence: "low" | "medium" | "high" } {
  const logged = input.dailyIntake.filter((v): v is number => v != null);
  const w = input.weights;
  if (logged.length < 4 || w.length < 4) {
    return { tdee: input.previousTdee ?? 0, confidence: "low" };
  }
  const avgIntake = logged.reduce((a, b) => a + b, 0) / logged.length;
  const kgPerDay = regressionSlope(w.map((x) => x.weightKg));
  const raw = avgIntake - kgPerDay * KCAL_PER_KG;
  const smoothed = input.previousTdee ? raw * 0.7 + input.previousTdee * 0.3 : raw;
  const clamped = Math.min(Math.max(Math.round(smoothed), 1000), 6000);
  const confidence = logged.length >= 10 && w.length >= 7 ? "high" : "medium";
  return { tdee: clamped, confidence };
}

/** Suggest new calorie target from real weight-change rate vs desired rate (spec 5.3) */
export function suggestTargetAdjustment(
  currentTarget: number,
  actualKgPerWeek: number,
  desiredKgPerWeek: number,
  goal: Goal,
  sex: Sex
): number {
  if (goal === "maintain" || goal === "performance") return currentTarget;
  const diff = (actualKgPerWeek - desiredKgPerWeek) * (KCAL_PER_KG / 7);
  const isLosingGoal = goal === "lose";
  const delta = isLosingGoal ? diff : -diff;
  const clamped = Math.min(Math.max(delta, -300), 300);
  const next = Math.round((currentTarget + clamped) / 10) * 10;
  return Math.max(next, CALORIE_FLOOR[sex]);
}

/** Consecutive-day streak given set of logged dates (YYYY-MM-DD), counting back from today */
export function calcStreak(loggedDates: Set<string>, today: Date): number {
  const fmt = (d: Date) => localDateStr(d);
  let streak = 0;
  const d = new Date(today);
  // allow today not yet logged without breaking streak
  if (!loggedDates.has(fmt(d))) d.setDate(d.getDate() - 1);
  while (loggedDates.has(fmt(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Water recommendation: 35 ml/kg (min 1500, max 4000) */
export function waterTargetMl(weightKg: number | null | undefined): number {
  if (!weightKg) return 2500;
  return Math.min(Math.max(Math.round((weightKg * 35) / 50) * 50, 1500), 4000);
}

export const DEFAULT_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snacks"] as const;
export type MealType = (typeof DEFAULT_MEAL_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Goal weight projection (MacroFactor-style trend extrapolation)      */
/* ------------------------------------------------------------------ */

export interface ProjectionInput {
  /** chronological weight measurements (last 14–28 days ideally) */
  weights: { date: string; weightKg: number }[];
  goalWeightKg: number | null | undefined;
  /** user's desired weekly change (kg/week), used as fallback trend */
  weeklyRateKg: number;
  goal: string | null | undefined;
  today?: Date;
}

export interface ProjectionResult {
  status: "reached" | "on_track" | "off_track" | "no_goal" | "no_data";
  /** projected ISO date of reaching goal (undefined for no_goal/no_data) */
  etaDate?: string;
  weeksLeft?: number;
  /** linear-regression trend from real weigh-ins, kg/week (signed) */
  trendKgPerWeek?: number;
  /** true when the trend comes from enough real data (≥3 points) */
  trendFromData: boolean;
}

/**
 * Projects the date the user reaches their goal weight.
 * Trend = least-squares slope over the last 14 weigh-ins (min 3 points),
 * falling back to the desired weeklyRateKg when there is not enough data.
 */
export function projectGoalWeight(input: ProjectionInput): ProjectionResult {
  const { weights, goalWeightKg, weeklyRateKg, goal } = input;
  const today = input.today ?? new Date();

  if (goalWeightKg == null || goalWeightKg <= 0 || goal === "maintain" || goal === "performance") {
    return { status: "no_goal", trendFromData: false };
  }

  const sorted = [...weights]
    .filter((w) => w.weightKg > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  if (sorted.length === 0) return { status: "no_data", trendFromData: false };

  const lastWeight = sorted[sorted.length - 1].weightKg;
  const delta = lastWeight - goalWeightKg;
  if (Math.abs(delta) < 0.25) {
    return { status: "reached", trendFromData: sorted.length >= 3, weeksLeft: 0 };
  }

  // Trend from real weigh-ins: slope per index → convert via day span
  let trendPerWeek: number | null = null;
  if (sorted.length >= 3) {
    const ys = sorted.map((w) => w.weightKg);
    const slopePerIndex = regressionSlope(ys); // kg per measurement index
    const first = new Date(sorted[0].date + "T00:00:00");
    const last = new Date(sorted[sorted.length - 1].date + "T00:00:00");
    const daySpan = Math.max((last.getTime() - first.getTime()) / 86_400_000, 1);
    const perDay = (slopePerIndex * (sorted.length - 1)) / daySpan;
    const perWeek = perDay * 7;
    if (Math.abs(perWeek) > 0.01) trendPerWeek = perWeek; // ignore flat/numerical-zero trends
  }
  const trendFromData = trendPerWeek != null;
  if (trendPerWeek == null) {
    const sign = goal === "lose" ? -1 : 1;
    trendPerWeek = sign * Math.abs(weeklyRateKg || 0.5);
  }

  // Moving toward goal? (sign of trend must oppose sign of delta)
  const movingToward = (delta > 0 && trendPerWeek < 0) || (delta < 0 && trendPerWeek > 0);
  if (!movingToward || Math.abs(trendPerWeek) < 0.005) {
    return { status: "off_track", trendKgPerWeek: trendPerWeek, trendFromData };
  }

  const weeksLeft = Math.abs(delta / trendPerWeek);
  if (weeksLeft > 260) return { status: "off_track", trendKgPerWeek: trendPerWeek, trendFromData };

  const eta = new Date(today.getTime() + weeksLeft * 7 * 86_400_000);
  return {
    status: "on_track",
    etaDate: eta.toISOString().slice(0, 10),
    weeksLeft: Math.round(weeksLeft * 10) / 10,
    trendKgPerWeek: Math.round(trendPerWeek * 100) / 100,
    trendFromData,
  };
}

/* ------------------------------------------------------------------ */
/* App display timezone helpers (Europe/Istanbul — primary market)      */
/* Server-side "today" must match the client's toLocaleDateString      */
/* calendar, otherwise midnight-window bugs appear (00:00–03:00 TR).    */
/* ------------------------------------------------------------------ */

export const APP_TZ = "Europe/Istanbul";

/** YYYY-MM-DD in the app display timezone (default: now) */
export function localDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(d);
}

/** YYYY-MM-DD N days before today's local calendar date (deterministic window) */
export function localDaysAgoStr(days: number, now: Date = new Date()): string {
  const anchor = new Date(`${localDateStr(now)}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - days);
  return anchor.toISOString().slice(0, 10);
}
