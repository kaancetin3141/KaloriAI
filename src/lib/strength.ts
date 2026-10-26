/**
 * Shared strength-training domain logic (openGym-inspired guided workouts).
 * Pure functions — used by both API routes and client components.
 */

import { EXERCISE_MAP } from "./exercise-catalog";

/** One logged set */
export interface StrengthSet {
  reps: number;
  weightKg: number;
  rir?: number; // reps in reserve (effort, optional)
  pr?: boolean; // was a PR when saved
}

/** One exercise within a session (client shape / API payload) */
export interface SessionExerciseInput {
  exerciseKey: string;
  name: string;
  muscle: string;
  equipment?: string | null;
  sets: StrengthSet[];
}

/** Session exercise as returned by the API (DB shape) */
export interface SessionExerciseDTO {
  id: string;
  exerciseKey: string;
  name: string;
  muscle: string;
  equipment: string | null;
  sets: StrengthSet[];
}

export interface StrengthSessionDTO {
  id: string;
  date: string;
  name: string | null;
  durationMin: number;
  intensity: string;
  calories: number;
  addedToTarget: boolean;
  createdAt: string;
  exercises: SessionExerciseDTO[];
}

/** Routine day/item shapes (shared API + client) */
export interface RoutineItem {
  exerciseKey: string;
  sets: number;
  reps: string;
  restSec: number;
}
export interface RoutineDay {
  day: number; // 1=Mon ... 7=Sun
  title: string;
  items: RoutineItem[];
}
export interface RoutineDTO {
  id: string;
  name: string;
  notes: string | null;
  days: RoutineDay[];
  updatedAt: string;
}

/** Estimated 1RM (Epley). weight 0 or reps 0 → 0. */
export function estimate1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  // Epley: w * (1 + r/30); cap at 12 reps (formula validity)
  const r = Math.min(reps, 12);
  return Math.round(weightKg * (1 + r / 30) * 10) / 10;
}

/** Best estimated 1RM across sets of one exercise */
export function best1RMOfSets(sets: StrengthSet[]): number {
  return sets.reduce((best, s) => Math.max(best, estimate1RM(s.weightKg, s.reps)), 0);
}

/** PR metric for a single set: e1RM when loaded, best-reps when bodyweight (weight 0). */
export function prMetricOfSet(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  return weightKg > 0 ? estimate1RM(weightKg, reps) : reps;
}

/* ------------------------------------------------------------------ */
/* Progression suggestion (openGym-inspired: "each target explains
 * why it is that number"). Pure heuristic on last logged sets. */

export interface ProgressionSuggestion {
  weightKg: number;
  reps: number;
  reason: "up" | "reps" | "hold" | "new";
}

/** Suggest the next working target from the last session's sets.
 *  - loaded & ≥8 reps → +2.5 kg (double-progression step up)
 *  - loaded & 5-7 reps → same weight, +1 rep (rep range climb)
 *  - loaded & <5 reps → hold (fatigue signal)
 *  - bodyweight → best reps + 1
 */
export function suggestNext(sets: { reps: number; weightKg: number }[]): ProgressionSuggestion | null {
  if (!sets || sets.length === 0) return { weightKg: 0, reps: 0, reason: "new" };
  const top = sets.reduce((b, s) =>
    s.weightKg > b.weightKg || (s.weightKg === b.weightKg && s.reps > b.reps) ? s : b,
  );
  if (top.weightKg > 0) {
    if (top.reps >= 8) {
      return {
        weightKg: Math.round((top.weightKg + 2.5) * 10) / 10,
        reps: Math.max(6, Math.round(top.reps * 0.75)),
        reason: "up",
      };
    }
    if (top.reps >= 5) return { weightKg: top.weightKg, reps: top.reps + 1, reason: "reps" };
    return { weightKg: top.weightKg, reps: top.reps, reason: "hold" };
  }
  const best = sets.reduce((m, s) => Math.max(m, s.reps), 0);
  return best > 0 ? { weightKg: 0, reps: best + 1, reason: "reps" } : null;
}

/* ------------------------------------------------------------------ */
/* Plate math (openGym-inspired): greedy per-side loading
 * from standard olympic plates for a target total weight. */

const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export interface PlateLoadResult {
  /** per-side plates, big → small, only non-zero counts */
  plates: { kg: number; count: number }[];
  perSideTotal: number;
  /** leftover kg per side that the plate inventory can't build */
  remainder: number;
  /** nearest loadable totals around the target */
  nearestBelow: number;
  nearestAbove: number;
}

export function calcPlates(targetKg: number, barKg: number): PlateLoadResult {
  const side = Math.round(((targetKg - barKg) / 2) * 100) / 100;
  if (side <= 0) {
    return { plates: [], perSideTotal: 0, remainder: 0, nearestBelow: barKg, nearestAbove: barKg };
  }
  let left = side;
  const plates: { kg: number; count: number }[] = [];
  for (const kg of STANDARD_PLATES) {
    const count = Math.floor(Math.round(left * 100) / (kg * 100));
    if (count > 0) {
      plates.push({ kg, count });
      left = Math.round((left - count * kg) * 100) / 100;
    }
  }
  const perSideTotal = Math.round((side - left) * 100) / 100;
  const smallest = STANDARD_PLATES[STANDARD_PLATES.length - 1];
  const nearestBelow = Math.round((barKg + 2 * perSideTotal) * 10) / 10;
  const nearestAbove =
    left > 0 ? Math.round((nearestBelow + 2 * smallest) * 10) / 10 : nearestBelow;
  return {
    plates,
    perSideTotal,
    remainder: Math.round(left * 100) / 100,
    nearestBelow,
    nearestAbove,
  };
}

/** Volume (tonnage) of one exercise: sum(reps × weight) */
export function volumeOfSets(sets: StrengthSet[]): number {
  return sets.reduce((v, s) => v + s.reps * s.weightKg, 0);
}

/** Total sets across exercises */
export function totalSetsOf(exercises: { sets: StrengthSet[] }[]): number {
  return exercises.reduce((n, e) => n + e.sets.length, 0);
}

/** Parse setsJson safely; invalid → [] */
export function parseSets(json: string): StrengthSet[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (s): s is StrengthSet =>
          s && typeof s === "object" && typeof s.reps === "number" && typeof s.weightKg === "number",
      )
      .map((s) => ({
        reps: Math.max(0, Math.min(1000, Math.round(s.reps))),
        weightKg: Math.max(0, Math.min(1000, Math.round(s.weightKg * 10) / 10)),
        ...(typeof s.rir === "number" ? { rir: Math.max(0, Math.min(10, Math.round(s.rir))) } : {}),
        ...(s.pr === true ? { pr: true } : {}),
      }));
  } catch {
    return [];
  }
}

/** Muscle-group label order for charts (matches i18n dict muscles) */
export const MUSCLE_ORDER = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "core",
  "calves",
  "forearms",
] as const;

/** MET estimate for a strength session from exercise density.
 * Compound share & set tempo raise the base MET toward 6.0. */
export function strengthSessionMet(exercises: SessionExerciseInput[]): number {
  if (exercises.length === 0) return 5;
  let compound = 0;
  let total = 0;
  for (const ex of exercises) {
    const cat = EXERCISE_MAP[ex.exerciseKey];
    const n = ex.sets.length;
    total += n;
    if (cat?.compound) compound += n;
  }
  const compoundShare = total > 0 ? compound / total : 0.5;
  // base 4.6 → up to 6.0 by compound share
  return Math.round((4.6 + compoundShare * 1.4) * 10) / 10;
}

/** PR check: for each exercise, compare best e1RM against previous all-time best.
 * Returns per-exercise result + flags sets that set a new PR. */
export interface PrResult {
  exerciseKey: string;
  name: string;
  prevBest: number;
  newBest: number;
  isPr: boolean;
}

export function detectPRs(
  exercises: SessionExerciseInput[],
  prevBestByKey: Record<string, number>,
): { prs: PrResult[]; flaggedSets: Record<string, boolean[]> } {
  const prs: PrResult[] = [];
  const flaggedSets: Record<string, boolean[]> = {};
  for (const ex of exercises) {
    const prev = prevBestByKey[ex.exerciseKey] ?? 0;
    let newBest = prev;
    const flags = ex.sets.map((s) => {
      const metric = prMetricOfSet(s.weightKg, s.reps);
      const isPr = metric > prev && metric > 0;
      if (metric > newBest) newBest = metric;
      return isPr;
    });
    flaggedSets[ex.exerciseKey] = flags;
    prs.push({
      exerciseKey: ex.exerciseKey,
      name: ex.name,
      prevBest: prev,
      newBest,
      isPr: newBest > prev && newBest > 0,
    });
  }
  return { prs, flaggedSets };
}
