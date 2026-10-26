/** Static strength exercise catalog (KaloriAI guided workouts).
 *
 * Names follow what Turkish gym-goers actually say: most barbell/dumbbell/cable
 * lifts keep their English names ("Bench Press", "Squat", "Lat Pulldown"),
 * while bodyweight classics use the common Turkish term (Barfiks, Şınav,
 * Mekik, Kalça Köprüsü, Kelebek, Ters Kelebek). "Hip Thrust" stays English and
 * "İtiş" is never used for bench — that is not gym Turkish.
 *
 * Muscle/equipment data is factual classification. No media assets (openGym's
 * licensed imagery intentionally NOT ported). `key` values are stable snake_case
 * ids persisted in routine/workout data — never rename them.
 *
 * MET values (3.0–6.0) feed the calorie estimator: compound heavy lifts
 * 5.5–6.0, machine isolation 4.0–4.5, bodyweight 4.5–5.5, core ~3.5–4.0.
 */

export const MUSCLE_GROUPS = [
  "chest", "back", "shoulders", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "core", "calves", "forearms",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT_TYPES = [
  "barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band",
] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export interface CatalogExercise {
  key: string;              // unique snake_case id, stable forever (e.g. "bench_press")
  name: string;             // English display name
  nameTr: string;           // Turkish display name
  muscle: MuscleGroup;      // primary muscle
  secondary: MuscleGroup[]; // 0-2 secondary muscles
  equipment: EquipmentType;
  compound: boolean;        // multi-joint?
  met: number;              // MET value 3.0-6.0 for calorie estimation
}

export const EXERCISES: CatalogExercise[] = [

  // ─── Chest (16) ─────────────────────────────────────────────────────────────
  { key: "bench_press", name: "Barbell Bench Press", nameTr: "Bench Press", muscle: "chest", secondary: ["triceps", "shoulders"], equipment: "barbell", compound: true, met: 6.0 },
  { key: "incline_bench_press", name: "Incline Barbell Bench Press", nameTr: "Incline Bench Press", muscle: "chest", secondary: ["shoulders", "triceps"], equipment: "barbell", compound: true, met: 5.5 },
  { key: "decline_bench_press", name: "Decline Barbell Bench Press", nameTr: "Decline Bench Press", muscle: "chest", secondary: ["triceps"], equipment: "barbell", compound: true, met: 5.5 },
  { key: "db_bench_press", name: "Dumbbell Bench Press", nameTr: "Dumbbell Bench Press", muscle: "chest", secondary: ["triceps", "shoulders"], equipment: "dumbbell", compound: true, met: 5.5 },
  { key: "incline_db_press", name: "Incline Dumbbell Press", nameTr: "Incline Dumbbell Press", muscle: "chest", secondary: ["shoulders"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "decline_db_press", name: "Decline Dumbbell Press", nameTr: "Decline Dumbbell Press", muscle: "chest", secondary: ["triceps"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "db_fly", name: "Dumbbell Fly", nameTr: "Dumbbell Fly", muscle: "chest", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "cable_fly", name: "Cable Chest Fly", nameTr: "Cable Fly", muscle: "chest", secondary: [], equipment: "cable", compound: false, met: 4.0 },
  { key: "pec_deck", name: "Pec Deck", nameTr: "Kelebek (Pec Deck)", muscle: "chest", secondary: [], equipment: "machine", compound: false, met: 4.0 },
  { key: "machine_chest_press", name: "Chest Press Machine", nameTr: "Chest Press Makinesi", muscle: "chest", secondary: ["triceps"], equipment: "machine", compound: true, met: 4.5 },
  { key: "chest_dips", name: "Chest Dips", nameTr: "Dips", muscle: "chest", secondary: ["triceps", "shoulders"], equipment: "bodyweight", compound: true, met: 5.0 },
  { key: "pushup", name: "Push-Up", nameTr: "Şınav", muscle: "chest", secondary: ["triceps", "core"], equipment: "bodyweight", compound: true, met: 5.0 },
  { key: "incline_pushup", name: "Incline Push-Up", nameTr: "Eğimli Şınav", muscle: "chest", secondary: ["triceps"], equipment: "bodyweight", compound: true, met: 4.5 },
  { key: "decline_pushup", name: "Decline Push-Up", nameTr: "Ayaklar Yukarıda Şınav", muscle: "chest", secondary: ["triceps", "shoulders"], equipment: "bodyweight", compound: true, met: 5.0 },
  { key: "band_chest_press", name: "Band Chest Press", nameTr: "Band Chest Press", muscle: "chest", secondary: ["triceps"], equipment: "band", compound: true, met: 4.5 },
  { key: "svend_press", name: "Svend Press", nameTr: "Svend Press", muscle: "chest", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },

  // ─── Back (18) ──────────────────────────────────────────────────────────────
  { key: "deadlift", name: "Deadlift", nameTr: "Deadlift", muscle: "back", secondary: ["hamstrings", "glutes"], equipment: "barbell", compound: true, met: 6.0 },
  { key: "romanian_deadlift", name: "Romanian Deadlift", nameTr: "RDL", muscle: "back", secondary: ["hamstrings", "glutes"], equipment: "barbell", compound: true, met: 5.5 },
  { key: "barbell_row", name: "Barbell Row", nameTr: "Barbell Row", muscle: "back", secondary: ["biceps", "core"], equipment: "barbell", compound: true, met: 6.0 },
  { key: "t_bar_row", name: "T-Bar Row", nameTr: "T-Bar Row", muscle: "back", secondary: ["biceps"], equipment: "machine", compound: true, met: 5.5 },
  { key: "db_row", name: "One-Arm Dumbbell Row", nameTr: "Tek Kol Dumbbell Row", muscle: "back", secondary: ["biceps"], equipment: "dumbbell", compound: true, met: 5.5 },
  { key: "chest_supported_db_row", name: "Chest-Supported Dumbbell Row", nameTr: "Chest Supported Row", muscle: "back", secondary: ["biceps"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "seated_cable_row", name: "Seated Cable Row", nameTr: "Seated Cable Row", muscle: "back", secondary: ["biceps"], equipment: "cable", compound: true, met: 5.0 },
  { key: "machine_row", name: "Lever Row Machine", nameTr: "Row Makinesi", muscle: "back", secondary: ["biceps"], equipment: "machine", compound: true, met: 4.5 },
  { key: "lat_pulldown_wide", name: "Wide-Grip Lat Pulldown", nameTr: "Geniş Tutuş Lat Pulldown", muscle: "back", secondary: ["biceps"], equipment: "cable", compound: true, met: 5.0 },
  { key: "lat_pulldown_narrow", name: "Close-Grip Lat Pulldown", nameTr: "Dar Tutuş Lat Pulldown", muscle: "back", secondary: ["biceps"], equipment: "cable", compound: true, met: 5.0 },
  { key: "pull_up", name: "Pull-Up", nameTr: "Barfiks", muscle: "back", secondary: ["biceps", "core"], equipment: "bodyweight", compound: true, met: 5.5 },
  { key: "chin_up", name: "Chin-Up", nameTr: "Chin-Up", muscle: "back", secondary: ["biceps"], equipment: "bodyweight", compound: true, met: 5.5 },
  { key: "inverted_row", name: "Inverted Row", nameTr: "Inverted Row", muscle: "back", secondary: ["biceps", "core"], equipment: "bodyweight", compound: true, met: 5.0 },
  { key: "straight_arm_pulldown", name: "Straight-Arm Pulldown", nameTr: "Straight-Arm Pulldown", muscle: "back", secondary: [], equipment: "cable", compound: false, met: 4.0 },
  { key: "face_pull", name: "Face Pull", nameTr: "Face Pull", muscle: "back", secondary: ["shoulders"], equipment: "cable", compound: false, met: 4.0 },
  { key: "db_pullover", name: "Dumbbell Pullover", nameTr: "Dumbbell Pullover", muscle: "back", secondary: ["chest"], equipment: "dumbbell", compound: false, met: 4.5 },
  { key: "band_row", name: "Band Row", nameTr: "Band Row", muscle: "back", secondary: ["biceps"], equipment: "band", compound: true, met: 4.5 },
  { key: "kb_row", name: "Kettlebell Row", nameTr: "Kettlebell Row", muscle: "back", secondary: ["biceps", "core"], equipment: "kettlebell", compound: true, met: 5.0 },

  // ─── Shoulders (12) ─────────────────────────────────────────────────────────
  { key: "overhead_press", name: "Barbell Overhead Press", nameTr: "Askeri Press", muscle: "shoulders", secondary: ["triceps", "core"], equipment: "barbell", compound: true, met: 6.0 },
  { key: "seated_db_shoulder_press", name: "Seated Dumbbell Shoulder Press", nameTr: "Oturarak Shoulder Press", muscle: "shoulders", secondary: ["triceps"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "arnold_press", name: "Arnold Press", nameTr: "Arnold Press", muscle: "shoulders", secondary: ["triceps"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "db_lateral_raise", name: "Dumbbell Lateral Raise", nameTr: "Yana Açma", muscle: "shoulders", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "cable_lateral_raise", name: "Cable Lateral Raise", nameTr: "Cable Yana Açma", muscle: "shoulders", secondary: [], equipment: "cable", compound: false, met: 4.0 },
  { key: "machine_lateral_raise", name: "Machine Lateral Raise", nameTr: "Machine Yana Açma", muscle: "shoulders", secondary: [], equipment: "machine", compound: false, met: 4.0 },
  { key: "rear_delt_fly_db", name: "Dumbbell Rear Delt Fly", nameTr: "Arka Omuz (Dumbbell)", muscle: "shoulders", secondary: ["back"], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "reverse_pec_deck", name: "Reverse Pec Deck", nameTr: "Ters Kelebek", muscle: "shoulders", secondary: ["back"], equipment: "machine", compound: false, met: 4.0 },
  { key: "upright_row", name: "Barbell Upright Row", nameTr: "Upright Row", muscle: "shoulders", secondary: ["biceps", "back"], equipment: "barbell", compound: true, met: 4.5 },
  { key: "barbell_shrug", name: "Barbell Shrug", nameTr: "Omuz Silkme", muscle: "shoulders", secondary: ["back"], equipment: "barbell", compound: false, met: 4.5 },
  { key: "db_shrug", name: "Dumbbell Shrug", nameTr: "Dumbbell Shrug", muscle: "shoulders", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "kb_press", name: "Kettlebell Shoulder Press", nameTr: "Kettlebell Press", muscle: "shoulders", secondary: ["triceps", "core"], equipment: "kettlebell", compound: true, met: 5.0 },

  // ─── Biceps (10) ────────────────────────────────────────────────────────────
  { key: "barbell_curl", name: "Barbell Curl", nameTr: "Barbell Curl", muscle: "biceps", secondary: ["forearms"], equipment: "barbell", compound: false, met: 4.5 },
  { key: "ez_bar_curl", name: "EZ Bar Curl", nameTr: "EZ Bar Curl", muscle: "biceps", secondary: ["forearms"], equipment: "barbell", compound: false, met: 4.5 },
  { key: "db_curl", name: "Dumbbell Curl", nameTr: "Dumbbell Curl", muscle: "biceps", secondary: ["forearms"], equipment: "dumbbell", compound: false, met: 4.5 },
  { key: "hammer_curl", name: "Hammer Curl", nameTr: "Hammer Curl", muscle: "biceps", secondary: ["forearms"], equipment: "dumbbell", compound: false, met: 4.5 },
  { key: "incline_db_curl", name: "Incline Dumbbell Curl", nameTr: "Incline Dumbbell Curl", muscle: "biceps", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "preacher_curl", name: "Preacher Curl", nameTr: "Preacher Curl", muscle: "biceps", secondary: [], equipment: "barbell", compound: false, met: 4.0 },
  { key: "cable_curl", name: "Cable Curl", nameTr: "Cable Curl", muscle: "biceps", secondary: ["forearms"], equipment: "cable", compound: false, met: 4.0 },
  { key: "concentration_curl", name: "Concentration Curl", nameTr: "Concentration Curl", muscle: "biceps", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "spider_curl", name: "Spider Curl", nameTr: "Spider Curl", muscle: "biceps", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "band_curl", name: "Band Curl", nameTr: "Band Curl", muscle: "biceps", secondary: ["forearms"], equipment: "band", compound: false, met: 3.5 },

  // ─── Triceps (10) ───────────────────────────────────────────────────────────
  { key: "close_grip_bench_press", name: "Close-Grip Bench Press", nameTr: "Close-Grip Bench Press", muscle: "triceps", secondary: ["chest", "shoulders"], equipment: "barbell", compound: true, met: 5.5 },
  { key: "skull_crusher", name: "Skull Crusher", nameTr: "Skull Crusher", muscle: "triceps", secondary: [], equipment: "barbell", compound: false, met: 4.5 },
  { key: "rope_pushdown", name: "Rope Pushdown", nameTr: "Rope Pushdown", muscle: "triceps", secondary: [], equipment: "cable", compound: false, met: 4.0 },
  { key: "bar_pushdown", name: "Straight Bar Pushdown", nameTr: "Bar Pushdown", muscle: "triceps", secondary: [], equipment: "cable", compound: false, met: 4.0 },
  { key: "overhead_db_extension", name: "Overhead Dumbbell Extension", nameTr: "Overhead Dumbbell Extension", muscle: "triceps", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "overhead_cable_extension", name: "Overhead Cable Extension", nameTr: "Overhead Cable Extension", muscle: "triceps", secondary: [], equipment: "cable", compound: false, met: 4.0 },
  { key: "tricep_dips", name: "Triceps Dips", nameTr: "Triceps Dips", muscle: "triceps", secondary: ["chest", "shoulders"], equipment: "bodyweight", compound: true, met: 5.0 },
  { key: "tricep_kickback", name: "Triceps Kickback", nameTr: "Kickback", muscle: "triceps", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "bench_dips", name: "Bench Dips", nameTr: "Bench Dips", muscle: "triceps", secondary: ["chest"], equipment: "bodyweight", compound: true, met: 4.5 },
  { key: "diamond_pushup", name: "Diamond Push-Up", nameTr: "Diamond Şınav", muscle: "triceps", secondary: ["chest", "core"], equipment: "bodyweight", compound: true, met: 5.0 },

  // ─── Quads (12) ─────────────────────────────────────────────────────────────
  { key: "back_squat", name: "Barbell Back Squat", nameTr: "Squat", muscle: "quads", secondary: ["glutes", "core"], equipment: "barbell", compound: true, met: 6.0 },
  { key: "front_squat", name: "Front Squat", nameTr: "Front Squat", muscle: "quads", secondary: ["glutes", "core"], equipment: "barbell", compound: true, met: 5.5 },
  { key: "hack_squat", name: "Hack Squat", nameTr: "Hack Squat", muscle: "quads", secondary: ["glutes"], equipment: "machine", compound: true, met: 5.5 },
  { key: "leg_press", name: "Leg Press", nameTr: "Leg Press", muscle: "quads", secondary: ["glutes"], equipment: "machine", compound: true, met: 5.0 },
  { key: "leg_extension", name: "Leg Extension", nameTr: "Leg Extension", muscle: "quads", secondary: [], equipment: "machine", compound: false, met: 4.0 },
  { key: "bulgarian_split_squat", name: "Bulgarian Split Squat", nameTr: "Bulgarian Split Squat", muscle: "quads", secondary: ["glutes", "hamstrings"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "walking_lunge", name: "Walking Lunge", nameTr: "Walking Lunge", muscle: "quads", secondary: ["glutes", "hamstrings"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "reverse_lunge", name: "Reverse Lunge", nameTr: "Reverse Lunge", muscle: "quads", secondary: ["glutes"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "goblet_squat", name: "Goblet Squat", nameTr: "Goblet Squat", muscle: "quads", secondary: ["glutes", "core"], equipment: "kettlebell", compound: true, met: 5.0 },
  { key: "step_up", name: "Step-Up", nameTr: "Step-Up", muscle: "quads", secondary: ["glutes"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "sissy_squat", name: "Sissy Squat", nameTr: "Sissy Squat", muscle: "quads", secondary: [], equipment: "bodyweight", compound: false, met: 4.5 },
  { key: "smith_squat", name: "Smith Machine Squat", nameTr: "Smith Squat", muscle: "quads", secondary: ["glutes"], equipment: "machine", compound: true, met: 5.5 },

  // ─── Hamstrings (8) ─────────────────────────────────────────────────────────
  { key: "stiff_leg_deadlift", name: "Stiff-Leg Deadlift", nameTr: "Stiff-Leg Deadlift", muscle: "hamstrings", secondary: ["glutes", "back"], equipment: "barbell", compound: true, met: 5.5 },
  { key: "lying_leg_curl", name: "Lying Leg Curl", nameTr: "Lying Leg Curl", muscle: "hamstrings", secondary: ["calves"], equipment: "machine", compound: false, met: 4.0 },
  { key: "seated_leg_curl", name: "Seated Leg Curl", nameTr: "Seated Leg Curl", muscle: "hamstrings", secondary: ["calves"], equipment: "machine", compound: false, met: 4.0 },
  { key: "good_morning", name: "Good Morning", nameTr: "Good Morning", muscle: "hamstrings", secondary: ["back", "glutes"], equipment: "barbell", compound: true, met: 5.0 },
  { key: "nordic_curl", name: "Nordic Curl", nameTr: "Nordic Curl", muscle: "hamstrings", secondary: ["core"], equipment: "bodyweight", compound: false, met: 4.5 },
  { key: "glute_ham_raise", name: "Glute-Ham Raise", nameTr: "Glute-Ham Raise", muscle: "hamstrings", secondary: ["glutes", "core"], equipment: "machine", compound: true, met: 4.5 },
  { key: "kb_swing", name: "Kettlebell Swing", nameTr: "Kettlebell Swing", muscle: "hamstrings", secondary: ["glutes", "core"], equipment: "kettlebell", compound: true, met: 6.0 },
  { key: "single_leg_rdl", name: "Single-Leg Romanian Deadlift", nameTr: "Tek Bacak RDL", muscle: "hamstrings", secondary: ["glutes", "core"], equipment: "dumbbell", compound: true, met: 5.0 },

  // ─── Glutes (9) ─────────────────────────────────────────────────────────────
  { key: "hip_thrust", name: "Barbell Hip Thrust", nameTr: "Hip Thrust", muscle: "glutes", secondary: ["hamstrings"], equipment: "barbell", compound: true, met: 5.5 },
  { key: "glute_bridge", name: "Glute Bridge", nameTr: "Kalça Köprüsü", muscle: "glutes", secondary: ["hamstrings"], equipment: "bodyweight", compound: false, met: 4.5 },
  { key: "single_leg_glute_bridge", name: "Single-Leg Glute Bridge", nameTr: "Tek Bacak Kalça Köprüsü", muscle: "glutes", secondary: ["hamstrings"], equipment: "bodyweight", compound: false, met: 4.0 },
  { key: "cable_kickback", name: "Cable Glute Kickback", nameTr: "Cable Kickback", muscle: "glutes", secondary: ["hamstrings"], equipment: "cable", compound: false, met: 4.0 },
  { key: "cable_pull_through", name: "Cable Pull-Through", nameTr: "Cable Pull-Through", muscle: "glutes", secondary: ["hamstrings"], equipment: "cable", compound: true, met: 4.5 },
  { key: "hip_abduction_machine", name: "Hip Abduction Machine", nameTr: "Kalça Açma Makinesi", muscle: "glutes", secondary: [], equipment: "machine", compound: false, met: 4.0 },
  { key: "sumo_deadlift", name: "Sumo Deadlift", nameTr: "Sumo Deadlift", muscle: "glutes", secondary: ["quads", "back"], equipment: "barbell", compound: true, met: 6.0 },
  { key: "frog_pump", name: "Frog Pump", nameTr: "Frog Pump", muscle: "glutes", secondary: [], equipment: "bodyweight", compound: false, met: 4.0 },
  { key: "lateral_band_walk", name: "Lateral Band Walk", nameTr: "Lateral Band Walk", muscle: "glutes", secondary: [], equipment: "band", compound: false, met: 4.0 },

  // ─── Core (13) ──────────────────────────────────────────────────────────────
  { key: "plank", name: "Plank", nameTr: "Plank", muscle: "core", secondary: ["shoulders"], equipment: "bodyweight", compound: false, met: 3.5 },
  { key: "side_plank", name: "Side Plank", nameTr: "Yan Plank", muscle: "core", secondary: ["glutes"], equipment: "bodyweight", compound: false, met: 3.5 },
  { key: "hanging_leg_raise", name: "Hanging Leg Raise", nameTr: "Hanging Leg Raise", muscle: "core", secondary: ["forearms"], equipment: "bodyweight", compound: false, met: 4.0 },
  { key: "cable_crunch", name: "Cable Crunch", nameTr: "Cable Crunch", muscle: "core", secondary: [], equipment: "cable", compound: false, met: 4.0 },
  { key: "russian_twist", name: "Russian Twist", nameTr: "Russian Twist", muscle: "core", secondary: [], equipment: "bodyweight", compound: false, met: 3.5 },
  { key: "dead_bug", name: "Dead Bug", nameTr: "Dead Bug", muscle: "core", secondary: [], equipment: "bodyweight", compound: false, met: 3.5 },
  { key: "bird_dog", name: "Bird Dog", nameTr: "Bird Dog", muscle: "core", secondary: ["glutes"], equipment: "bodyweight", compound: false, met: 3.5 },
  { key: "ab_wheel", name: "Ab Wheel Rollout", nameTr: "Ab Wheel Rollout", muscle: "core", secondary: ["shoulders", "back"], equipment: "bodyweight", compound: true, met: 4.0 },
  { key: "mountain_climbers", name: "Mountain Climbers", nameTr: "Mountain Climbers", muscle: "core", secondary: ["quads", "shoulders"], equipment: "bodyweight", compound: true, met: 5.0 },
  { key: "bicycle_crunch", name: "Bicycle Crunch", nameTr: "Bisiklet Mekik", muscle: "core", secondary: [], equipment: "bodyweight", compound: false, met: 4.0 },
  { key: "hollow_hold", name: "Hollow Hold", nameTr: "Hollow Hold", muscle: "core", secondary: [], equipment: "bodyweight", compound: false, met: 3.5 },
  { key: "woodchopper", name: "Cable Woodchopper", nameTr: "Woodchopper", muscle: "core", secondary: ["shoulders"], equipment: "cable", compound: true, met: 4.0 },
  { key: "sit_up", name: "Sit-Up", nameTr: "Mekik", muscle: "core", secondary: ["quads"], equipment: "bodyweight", compound: false, met: 4.0 },

  // ─── Calves (6) ─────────────────────────────────────────────────────────────
  { key: "standing_calf_raise", name: "Standing Calf Raise", nameTr: "Standing Calf Raise", muscle: "calves", secondary: [], equipment: "machine", compound: false, met: 4.0 },
  { key: "seated_calf_raise", name: "Seated Calf Raise", nameTr: "Seated Calf Raise", muscle: "calves", secondary: [], equipment: "machine", compound: false, met: 4.0 },
  { key: "barbell_calf_raise", name: "Barbell Calf Raise", nameTr: "Barbell Calf Raise", muscle: "calves", secondary: [], equipment: "barbell", compound: false, met: 4.5 },
  { key: "single_leg_calf_raise", name: "Single-Leg Calf Raise", nameTr: "Tek Bacak Calf Raise", muscle: "calves", secondary: [], equipment: "dumbbell", compound: false, met: 4.0 },
  { key: "donkey_calf_raise", name: "Donkey Calf Raise", nameTr: "Donkey Calf Raise", muscle: "calves", secondary: [], equipment: "machine", compound: false, met: 4.0 },
  { key: "leg_press_calf_raise", name: "Leg Press Calf Raise", nameTr: "Leg Press Calf Raise", muscle: "calves", secondary: [], equipment: "machine", compound: false, met: 4.0 },

  // ─── Forearms (6) ───────────────────────────────────────────────────────────
  { key: "wrist_curl", name: "Dumbbell Wrist Curl", nameTr: "Wrist Curl", muscle: "forearms", secondary: [], equipment: "dumbbell", compound: false, met: 3.5 },
  { key: "reverse_wrist_curl", name: "Reverse Wrist Curl", nameTr: "Reverse Wrist Curl", muscle: "forearms", secondary: [], equipment: "dumbbell", compound: false, met: 3.5 },
  { key: "reverse_curl", name: "Reverse Curl", nameTr: "Reverse Curl", muscle: "forearms", secondary: ["biceps"], equipment: "barbell", compound: false, met: 4.0 },
  { key: "farmers_walk", name: "Farmer's Walk", nameTr: "Farmer's Walk", muscle: "forearms", secondary: ["core", "shoulders"], equipment: "dumbbell", compound: true, met: 5.0 },
  { key: "plate_pinch", name: "Plate Pinch", nameTr: "Plate Pinch", muscle: "forearms", secondary: [], equipment: "bodyweight", compound: false, met: 3.5 },
  { key: "dead_hang", name: "Dead Hang", nameTr: "Dead Hang", muscle: "forearms", secondary: ["back", "core"], equipment: "bodyweight", compound: false, met: 3.5 },
];

/** key → exercise lookup (built from EXERCISES). */
export const EXERCISE_MAP: Record<string, CatalogExercise> = EXERCISES.reduce<Record<string, CatalogExercise>>(
  (map, ex) => {
    map[ex.key] = ex;
    return map;
  },
  {},
);

/** Fold Turkish-specific letters to ASCII so search is accent-insensitive:
 *  ı i İ İ all collapse to "i", plus ş→s, ğ→g, ç→c, ö→o, ü→u. */
const TR_FOLD: Record<string, string> = {
  ç: "c", Ç: "c",
  ğ: "g", Ğ: "g",
  ı: "i", i: "i", I: "i", İ: "i",
  ö: "o", Ö: "o",
  ş: "s", Ş: "s",
  ü: "u", Ü: "u",
  â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

function foldChar(ch: string): string {
  return TR_FOLD[ch] ?? ch;
}

/** Lowercase + Turkish accent fold ("KALÇA" and "kalça" → "kalca"). */
function normalizeSearch(text: string): string {
  return text.replace(/[çÇğĞıIiİöÖşŞüÜâÂîÎûÛ]/g, foldChar).toLowerCase();
}

/** Rank: exact match > prefix > word-start > substring > no match. */
function matchScore(haystack: string, needle: string): number {
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 80;
  if (haystack.split(" ").some((word) => word.startsWith(needle))) return 60;
  if (haystack.includes(needle)) return 40;
  return 0;
}

/** TR/EN case-insensitive, Turkish accent-insensitive exercise search.
 *  Matches against name, nameTr and the plain key; results are ranked
 *  (exact/prefix first) and capped at 40. Empty query returns the filtered
 *  pool (first 40). */
export function searchExercises(
  query: string,
  muscle: MuscleGroup | "all",
  equipment: EquipmentType | "all",
): CatalogExercise[] {
  const pool = EXERCISES.filter(
    (ex) =>
      (muscle === "all" || ex.muscle === muscle) &&
      (equipment === "all" || ex.equipment === equipment),
  );

  const q = normalizeSearch(query.trim());
  if (q.length === 0) return pool.slice(0, 40);

  const scored: Array<{ ex: CatalogExercise; score: number }> = [];
  for (const ex of pool) {
    const score = Math.max(
      matchScore(normalizeSearch(ex.name), q),
      matchScore(normalizeSearch(ex.nameTr), q),
      matchScore(normalizeSearch(ex.key.replace(/_/g, " ")), q),
    );
    if (score > 0) scored.push({ ex, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.ex.name < b.ex.name ? -1 : 1;
  });
  return scored.slice(0, 40).map((s) => s.ex);
}
