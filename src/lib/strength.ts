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
