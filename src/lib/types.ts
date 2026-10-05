/** Shared client-side API types */

export interface Serving {
  id: string;
  label: string;
  grams: number;
}

export interface FoodItem {
  id: string;
  name: string;
  nameEn?: string | null;
  brand?: string | null;
  source: string;
  barcode?: string | null;
  category: string;
  kcal100: number;
  protein100: number;
  carb100: number;
  fat100: number;
  fiber100: number;
  sugar100: number;
  sodium100: number;
  satFat100: number;
  servings: Serving[];
  isVerified?: boolean;
  isFavorite?: boolean;
}

export interface LogItem {
  id: string;
  foodId?: string | null;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number;
  sodium?: number;
  satFat?: number;
  source: string;
  food?: FoodItem | null;
}

export interface MealLog {
  id: string;
  date: string;
  mealType: string;
  name?: string | null;
  isTemplate: boolean;
  items: LogItem[];
  createdAt: string;
}

export interface Targets {
  id?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  tdeeEstimate?: number;
  adaptiveEnabled?: boolean;
  trainCalories?: number | null;
  trainProtein?: number | null;
  trainCarbs?: number | null;
  trainFat?: number | null;
  manuallyOverridden?: boolean;
}

export interface Profile {
  sex?: string | null;
  birthDate?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  goalWeightKg?: number | null;
  bodyFatPct?: number | null;
  goal?: string | null;
  weeklyRateKg?: number;
  activityLevel?: string;
  userType?: string;
  dietPreference?: string;
  allergens?: string;
  formula?: string;
  onboarded?: boolean;
  trainingDayTarget?: boolean;
  carbCycling?: boolean;
}

export interface DiaryResponse {
  date: string;
  logs: MealLog[];
  totals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number; satFat: number };
  targets: Targets | null;
  burned: number;
  addedBurned: number;
  waterMl: number;
  workouts: Workout[];
  profile: Profile | null;
  templates: MealLog[];
}

export interface Workout {
  id: string;
  date: string;
  type: string;
  name?: string | null;
  durationMin: number;
  intensity: string;
  met: number;
  calories: number;
  addedToTarget: boolean;
}

export interface AiItem {
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
  confidence: number;
  alternatives: string[];
}

export interface AiAnalyzeResponse {
  ok: boolean;
  analysisId: string;
  imageUrl: string;
  items: AiItem[];
  overallConfidence: number;
  clarifyingQuestion: string | null;
  quotaLeft: number;
}

export interface AiTextResponse {
  ok: boolean;
  items: AiItem[];
  overallConfidence: number;
  clarifyingQuestion: string | null;
}

export interface Measurement {
  id: string;
  date: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  armCm?: number | null;
  chestCm?: number | null;
  hipCm?: number | null;
}

export interface ProgressSummary {
  byDate: { date: string; kcal: number; protein: number; carbs: number; fat: number; fiber: number; burned: number; waterMl: number }[];
  targets: Targets | null;
  summary: {
    loggedDays: number;
    hitDays: number;
    adherencePct: number;
    streak: number;
    avgCalories: number;
    avgProtein: number;
    weightChange: number;
    workoutCount: number;
    totalBurned: number;
  };
  measurements: Measurement[];
  mealTiming: { meal: string; count: number }[];
  adaptiveTdee: { value: number; confidence: string };
}

export interface Reminder {
  id: string;
  type: string;
  time: string;
  enabled: boolean;
}
