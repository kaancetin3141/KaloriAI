/** Starter routine templates for KaloriAI guided workouts (openGym-inspired).
 *
 * Every `exerciseKey` MUST exist in EXERCISE_MAP — all keys below were
 * cross-checked at authoring time (see the self-check block at the bottom of
 * this file). Turkish titles/descriptions use real Turkish gym phrasing
 * (Push Günü, Pull Günü, Bacak Günü, Üst/Alt Vücut, Antrenman A).
 */
import { EXERCISE_MAP, type CatalogExercise } from "./exercise-catalog";

export interface RoutineTemplateItem {
  exerciseKey: string; // MUST exist in EXERCISE_MAP — verify every one!
  sets: number;        // 2-5
  reps: string;        // "8-10" | "5" | "12" | "8-12" | "60s" (timed)
  restSec: number;     // 60-180
}

export interface RoutineTemplateDay {
  day: number;         // 1=Monday ... 7=Sunday
  title: string;       // EN
  titleTr: string;     // TR
  items: RoutineTemplateItem[];
}

export interface RoutineTemplate {
  key: string;
  name: string;
  nameTr: string;
  desc: string;
  descTr: string;
  level: "beginner" | "intermediate" | "advanced";
  daysPerWeek: number;
  days: RoutineTemplateDay[];
}

/** Resolve the catalog exercise behind a template item
 *  (undefined ⇒ the key is not in EXERCISE_MAP). */
export function getTemplateExercise(item: RoutineTemplateItem): CatalogExercise | undefined {
  return EXERCISE_MAP[item.exerciseKey];
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  // ─── 1. Push / Pull / Legs — 6 days (P/P/L/P/P/L), intermediate ─────────────
  {
    key: "push_pull_legs",
    name: "Push / Pull / Legs (6-Day)",
    nameTr: "Push / Pull / Legs (6 Gün)",
    desc: "The classic six-day split: two push, two pull and two leg days, so every muscle group is trained twice a week.",
    descTr: "Klasik 6 günlük split: iki push, iki pull ve iki bacak günü ile her kas grubu haftada iki kez çalışır.",
    level: "intermediate",
    daysPerWeek: 6,
    days: [
      {
        day: 1,
        title: "Push Day (Chest, Shoulders, Triceps)",
        titleTr: "Push Günü (Göğüs, Omuz, Triceps)",
        items: [
          { exerciseKey: "bench_press", sets: 4, reps: "8-10", restSec: 120 },
          { exerciseKey: "seated_db_shoulder_press", sets: 3, reps: "8-12", restSec: 90 },
          { exerciseKey: "incline_db_press", sets: 3, reps: "10-12", restSec: 90 },
          { exerciseKey: "rope_pushdown", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "db_lateral_raise", sets: 3, reps: "12-15", restSec: 60 },
        ],
      },
      {
        day: 2,
        title: "Pull Day (Back, Biceps)",
        titleTr: "Pull Günü (Sırt, Biceps)",
        items: [
          { exerciseKey: "deadlift", sets: 4, reps: "6-8", restSec: 150 },
          { exerciseKey: "lat_pulldown_wide", sets: 4, reps: "8-12", restSec: 90 },
          { exerciseKey: "seated_cable_row", sets: 3, reps: "8-12", restSec: 90 },
          { exerciseKey: "face_pull", sets: 3, reps: "12-15", restSec: 60 },
          { exerciseKey: "db_curl", sets: 3, reps: "10-12", restSec: 60 },
        ],
      },
      {
        day: 3,
        title: "Leg Day (Quads, Hamstrings, Calves)",
        titleTr: "Bacak Günü (Ön Bacak, Arka Bacak, Baldır)",
        items: [
          { exerciseKey: "back_squat", sets: 4, reps: "8-10", restSec: 150 },
          { exerciseKey: "romanian_deadlift", sets: 3, reps: "8-10", restSec: 120 },
          { exerciseKey: "leg_press", sets: 3, reps: "10-12", restSec: 90 },
          { exerciseKey: "lying_leg_curl", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "standing_calf_raise", sets: 4, reps: "12-15", restSec: 60 },
        ],
      },
      {
        day: 4,
        title: "Push Day (Chest, Shoulders, Triceps)",
        titleTr: "Push Günü (Göğüs, Omuz, Triceps)",
        items: [
          { exerciseKey: "incline_bench_press", sets: 4, reps: "8-10", restSec: 120 },
          { exerciseKey: "overhead_press", sets: 3, reps: "8-10", restSec: 90 },
          { exerciseKey: "cable_fly", sets: 3, reps: "12-15", restSec: 60 },
          { exerciseKey: "overhead_cable_extension", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "machine_lateral_raise", sets: 3, reps: "12-15", restSec: 60 },
        ],
      },
      {
        day: 5,
        title: "Pull Day (Back, Biceps)",
        titleTr: "Pull Günü (Sırt, Biceps)",
        items: [
          { exerciseKey: "barbell_row", sets: 4, reps: "8-10", restSec: 120 },
          { exerciseKey: "pull_up", sets: 3, reps: "6-8", restSec: 90 },
          { exerciseKey: "db_row", sets: 3, reps: "10-12", restSec: 90 },
          { exerciseKey: "straight_arm_pulldown", sets: 3, reps: "12-15", restSec: 60 },
          { exerciseKey: "hammer_curl", sets: 3, reps: "10-12", restSec: 60 },
        ],
      },
      {
        day: 6,
        title: "Leg Day (Glutes, Hamstrings, Calves)",
        titleTr: "Bacak Günü (Kalça, Arka Bacak, Baldır)",
        items: [
          { exerciseKey: "front_squat", sets: 4, reps: "8-10", restSec: 150 },
          { exerciseKey: "walking_lunge", sets: 3, reps: "12", restSec: 90 },
          { exerciseKey: "seated_leg_curl", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "hip_thrust", sets: 3, reps: "8-12", restSec: 90 },
          { exerciseKey: "seated_calf_raise", sets: 4, reps: "12-15", restSec: 60 },
        ],
      },
    ],
  },

  // ─── 2. Upper / Lower — 4 days (Upper/Lower ×2), intermediate ───────────────
  {
    key: "upper_lower",
    name: "Upper / Lower Split (4-Day)",
    nameTr: "Üst / Alt Vücut Split (4 Gün)",
    desc: "Four days a week: the body is split into upper and lower halves, each trained twice for a strong volume/recovery balance.",
    descTr: "Haftada 4 gün: vücut üst ve alt olarak ikiye ayrılır, her bölüm haftada iki kez çalışır. Hacim ve toparlanma dengesi güçlü.",
    level: "intermediate",
    daysPerWeek: 4,
    days: [
      {
        day: 1,
        title: "Upper Body A",
        titleTr: "Üst Vücut A",
        items: [
          { exerciseKey: "bench_press", sets: 4, reps: "6-8", restSec: 120 },
          { exerciseKey: "barbell_row", sets: 4, reps: "6-8", restSec: 120 },
          { exerciseKey: "overhead_press", sets: 3, reps: "8-10", restSec: 90 },
          { exerciseKey: "lat_pulldown_wide", sets: 3, reps: "8-12", restSec: 90 },
          { exerciseKey: "skull_crusher", sets: 3, reps: "8-12", restSec: 60 },
          { exerciseKey: "ez_bar_curl", sets: 3, reps: "8-12", restSec: 60 },
        ],
      },
      {
        day: 2,
        title: "Lower Body A",
        titleTr: "Alt Vücut A",
        items: [
          { exerciseKey: "back_squat", sets: 4, reps: "6-8", restSec: 150 },
          { exerciseKey: "romanian_deadlift", sets: 3, reps: "8-10", restSec: 120 },
          { exerciseKey: "leg_press", sets: 3, reps: "10-12", restSec: 90 },
          { exerciseKey: "lying_leg_curl", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "standing_calf_raise", sets: 4, reps: "12-15", restSec: 60 },
          { exerciseKey: "plank", sets: 3, reps: "60s", restSec: 60 },
        ],
      },
      {
        day: 4,
        title: "Upper Body B",
        titleTr: "Üst Vücut B",
        items: [
          { exerciseKey: "incline_bench_press", sets: 4, reps: "8-10", restSec: 120 },
          { exerciseKey: "seated_cable_row", sets: 4, reps: "8-12", restSec: 90 },
          { exerciseKey: "seated_db_shoulder_press", sets: 3, reps: "8-12", restSec: 90 },
          { exerciseKey: "chin_up", sets: 3, reps: "6-8", restSec: 90 },
          { exerciseKey: "bar_pushdown", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "hammer_curl", sets: 3, reps: "10-12", restSec: 60 },
        ],
      },
      {
        day: 5,
        title: "Lower Body B",
        titleTr: "Alt Vücut B",
        items: [
          { exerciseKey: "deadlift", sets: 4, reps: "6-8", restSec: 150 },
          { exerciseKey: "bulgarian_split_squat", sets: 3, reps: "8-10", restSec: 90 },
          { exerciseKey: "seated_leg_curl", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "hip_thrust", sets: 3, reps: "8-12", restSec: 90 },
          { exerciseKey: "seated_calf_raise", sets: 4, reps: "12-15", restSec: 60 },
          { exerciseKey: "side_plank", sets: 3, reps: "45s", restSec: 60 },
        ],
      },
    ],
  },

  // ─── 3. Full Body — 3 days (Mon/Wed/Fri), beginner, compound-focused ────────
  {
    key: "full_body",
    name: "Full Body (3-Day)",
    nameTr: "Full Body (3 Gün)",
    desc: "Three Monday/Wednesday/Friday sessions built around compound lifts — the most efficient starting point for beginners.",
    descTr: "Pazartesi/Çarşamba/Cuma günlerinde, bileşik hareketler merkezli tüm vücut antrenmanı. Yeni başlayanlar için en verimli başlangıç.",
    level: "beginner",
    daysPerWeek: 3,
    days: [
      {
        day: 1,
        title: "Full Body A",
        titleTr: "Full Body A",
        items: [
          { exerciseKey: "goblet_squat", sets: 3, reps: "10-12", restSec: 90 },
          { exerciseKey: "bench_press", sets: 3, reps: "8-10", restSec: 90 },
          { exerciseKey: "db_row", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "seated_db_shoulder_press", sets: 2, reps: "10-12", restSec: 60 },
          { exerciseKey: "romanian_deadlift", sets: 3, reps: "10-12", restSec: 90 },
          { exerciseKey: "plank", sets: 3, reps: "45s", restSec: 60 },
        ],
      },
      {
        day: 3,
        title: "Full Body B",
        titleTr: "Full Body B",
        items: [
          { exerciseKey: "back_squat", sets: 3, reps: "8-10", restSec: 90 },
          { exerciseKey: "incline_db_press", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "lat_pulldown_wide", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "db_lateral_raise", sets: 2, reps: "12-15", restSec: 60 },
          { exerciseKey: "step_up", sets: 2, reps: "10-12", restSec: 60 },
          { exerciseKey: "dead_bug", sets: 2, reps: "12", restSec: 60 },
        ],
      },
      {
        day: 5,
        title: "Full Body C",
        titleTr: "Full Body C",
        items: [
          { exerciseKey: "leg_press", sets: 3, reps: "10-12", restSec: 90 },
          { exerciseKey: "pushup", sets: 3, reps: "8-12", restSec: 60 },
          { exerciseKey: "seated_cable_row", sets: 3, reps: "10-12", restSec: 60 },
          { exerciseKey: "db_curl", sets: 2, reps: "10-12", restSec: 60 },
          { exerciseKey: "glute_bridge", sets: 3, reps: "12-15", restSec: 60 },
          { exerciseKey: "bicycle_crunch", sets: 3, reps: "12-15", restSec: 60 },
        ],
      },
    ],
  },

  // ─── 4. StrongLifts 5×5 — 3 days alternating A/B, beginner ──────────────────
  {
    key: "stronglifts_5x5",
    name: "StrongLifts 5×5",
    nameTr: "StrongLifts 5×5",
    desc: "The classic novice barbell routine: squat every session, alternating bench/row with overhead press/deadlift, all in 5×5 sets.",
    descTr: "Klasik acemi barbell programı: her seansta squat; bench/row ile overhead press/deadlift dönüşümlü, 5×5 set ve lineer progresyon.",
    level: "beginner",
    daysPerWeek: 3,
    days: [
      {
        day: 1,
        title: "Workout A (5×5)",
        titleTr: "Antrenman A (5×5)",
        items: [
          { exerciseKey: "back_squat", sets: 5, reps: "5", restSec: 180 },
          { exerciseKey: "bench_press", sets: 5, reps: "5", restSec: 180 },
          { exerciseKey: "barbell_row", sets: 5, reps: "5", restSec: 180 },
        ],
      },
      {
        day: 3,
        title: "Workout B (5×5)",
        titleTr: "Antrenman B (5×5)",
        items: [
          { exerciseKey: "back_squat", sets: 5, reps: "5", restSec: 180 },
          { exerciseKey: "overhead_press", sets: 5, reps: "5", restSec: 180 },
          { exerciseKey: "deadlift", sets: 5, reps: "5", restSec: 180 },
        ],
      },
      {
        day: 5,
        title: "Workout A (5×5)",
        titleTr: "Antrenman A (5×5)",
        items: [
          { exerciseKey: "back_squat", sets: 5, reps: "5", restSec: 180 },
          { exerciseKey: "bench_press", sets: 5, reps: "5", restSec: 180 },
          { exerciseKey: "barbell_row", sets: 5, reps: "5", restSec: 180 },
        ],
      },
    ],
  },
];

/* ─── Self-check (authoring-time validation, see worklog Task 2-a) ────────────
 * Every exerciseKey in ROUTINE_TEMPLATES was cross-checked against
 * EXERCISE_MAP with a bun validation script (catalog key uniqueness, muscle/
 * equipment enum membership, MET range, sets/restSec ranges, template key
 * existence). Result: 120/120 catalog keys unique; 81/81 template item keys
 * resolved against EXERCISE_MAP; 0 keys had to be adjusted.
 *   push_pull_legs  : 6 days × 5 items = 30 keys ✓
 *   upper_lower     : 4 days × 6 items = 24 keys ✓
 *   full_body       : 3 days × 6 items = 18 keys ✓
 *   stronglifts_5x5 : 3 days × 3 items =  9 keys ✓
 * Note: the original StrongLifts program runs deadlift as 1×5; it is kept at
 * 5×5 here to honor the data spec ("sets: 5", RoutineTemplateItem sets 2-5).
 */
