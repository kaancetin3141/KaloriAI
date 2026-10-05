import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { localDateStr, calcTargets, waterTargetMl, type Sex, type Goal, type ActivityLevel, type UserType } from "@/lib/calculations";

const schema = z.object({
  locale: z.enum(["tr", "en"]).optional(),
  unitSystem: z.enum(["metric", "imperial"]).optional(),
  sex: z.enum(["male", "female"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heightCm: z.number().min(80).max(250),
  weightKg: z.number().min(25).max(400),
  goalWeightKg: z.number().min(25).max(400).optional().nullable(),
  bodyFatPct: z.number().min(3).max(60).optional().nullable(),
  goal: z.enum(["lose", "maintain", "gain", "muscle", "performance"]),
  weeklyRateKg: z.number().min(0.1).max(1).default(0.5),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  userType: z.enum(["general", "athlete"]).default("general"),
  dietPreference: z.enum(["any", "vegetarian", "vegan", "gluten_free", "halal"]).default("any"),
  allergens: z.string().max(200).default(""),
  trainingDayTarget: z.boolean().default(false),
  carbCycling: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const d = parsed.data;

    const result = calcTargets({
      sex: d.sex as Sex,
      birthDate: d.birthDate,
      heightCm: d.heightCm,
      weightKg: d.weightKg,
      goalWeightKg: d.goalWeightKg ?? null,
      bodyFatPct: d.bodyFatPct ?? null,
      goal: d.goal as Goal,
      weeklyRateKg: d.weeklyRateKg,
      activityLevel: d.activityLevel as ActivityLevel,
      userType: d.userType as UserType,
    });
    const trainResult = d.userType === "athlete" && d.trainingDayTarget
      ? calcTargets(
          {
            sex: d.sex as Sex,
            birthDate: d.birthDate,
            heightCm: d.heightCm,
            weightKg: d.weightKg,
            goalWeightKg: d.goalWeightKg ?? null,
            bodyFatPct: d.bodyFatPct ?? null,
            goal: d.goal as Goal,
            weeklyRateKg: d.weeklyRateKg,
            activityLevel: d.activityLevel as ActivityLevel,
            userType: "athlete",
          },
          true
        )
      : null;

    const { locale: _locale, unitSystem: _unitSystem, ...profileData } = d;

    const profile = await db.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...profileData,
        formula: result.formula,
        onboarded: true,
      },
      update: { ...profileData, formula: result.formula, onboarded: true },
    });

    const targets = await db.targets.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        calories: result.calories,
        protein: result.macros.protein,
        carbs: result.macros.carbs,
        fat: result.macros.fat,
        tdeeEstimate: result.tdee,
        trainCalories: trainResult?.calories ?? null,
        trainProtein: trainResult?.macros.protein ?? null,
        trainCarbs: trainResult?.macros.carbs ?? null,
        trainFat: trainResult?.macros.fat ?? null,
      },
      update: {
        calories: result.calories,
        protein: result.macros.protein,
        carbs: result.macros.carbs,
        fat: result.macros.fat,
        tdeeEstimate: result.tdee,
        trainCalories: trainResult?.calories ?? null,
        trainProtein: trainResult?.macros.protein ?? null,
        trainCarbs: trainResult?.macros.carbs ?? null,
        trainFat: trainResult?.macros.fat ?? null,
        manuallyOverridden: false,
      },
    });

    // first weight measurement
    await db.bodyMeasurement.create({
      data: { userId: user.id, date: localDateStr(), weightKg: d.weightKg, bodyFatPct: d.bodyFatPct ?? null },
    });
    if (d.locale) {
      await db.user.update({ where: { id: user.id }, data: { locale: d.locale } });
    }
    if (d.unitSystem) {
      await db.user.update({ where: { id: user.id }, data: { unitSystem: d.unitSystem } });
    }

    return Response.json({
      ok: true,
      targets: {
        calories: targets.calories,
        protein: targets.protein,
        carbs: targets.carbs,
        fat: targets.fat,
        bmr: result.bmr,
        tdee: result.tdee,
        floored: result.floored,
        formula: result.formula,
      },
      waterTarget: waterTargetMl(d.weightKg),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
