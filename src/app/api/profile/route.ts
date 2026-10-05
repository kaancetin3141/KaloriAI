import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { localDateStr, calcTargets, waterTargetMl, type Sex, type Goal, type ActivityLevel, type UserType } from "@/lib/calculations";

export async function GET() {
  try {
    const user = await requireUser();
    const [profile, targets, reminders] = await Promise.all([
      db.profile.findUnique({ where: { userId: user.id } }),
      db.targets.findUnique({ where: { userId: user.id } }),
      db.reminder.findMany({ where: { userId: user.id } }),
    ]);
    return Response.json({
      user: { id: user.id, email: user.email, name: user.name, locale: user.locale, unitSystem: user.unitSystem, createdAt: user.createdAt },
      profile,
      targets,
      reminders,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  name: z.string().min(1).max(60).optional(),
  locale: z.enum(["tr", "en"]).optional(),
  unitSystem: z.enum(["metric", "imperial"]).optional(),
  weightKg: z.number().min(25).max(400).optional(),
  goal: z.enum(["lose", "maintain", "gain", "muscle", "performance"]).optional(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
  weeklyRateKg: z.number().min(0.1).max(1).optional(),
  goalWeightKg: z.number().min(25).max(400).optional().nullable(),
  userType: z.enum(["general", "athlete"]).optional(),
  recalculate: z.boolean().optional(),
  // Custom meal labels as a JSON-encoded object; null resets to defaults.
  mealNames: z.string().max(400).nullable().optional(),
});

const MEAL_KEYS = ["breakfast", "lunch", "dinner", "snacks"] as const;

/** Validate + normalize a mealNames JSON string → canonical JSON (or null when empty) */
function normalizeMealNames(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError("VALIDATION", 400);
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const src = parsed as Record<string, unknown>;
  const cleaned: Record<string, string> = {};
  for (const key of MEAL_KEYS) {
    const value = src[key];
    if (typeof value === "string" && value.trim()) cleaned[key] = value.trim().slice(0, 24);
  }
  return Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
}

/** PATCH /api/profile — settings + optional target recalculation */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const { name, locale, unitSystem, weightKg, recalculate, mealNames, ...profilePatch } = parsed.data;

    // Custom meal names: dedicated path — independent of profile completeness
    if (mealNames !== undefined) {
      await db.profile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, mealNames: mealNames === null ? null : normalizeMealNames(mealNames) },
        update: { mealNames: mealNames === null ? null : normalizeMealNames(mealNames) },
      });
    }

    if (name || locale || unitSystem) {
      await db.user.update({
        where: { id: user.id },
        data: { ...(name ? { name } : {}), ...(locale ? { locale } : {}), ...(unitSystem ? { unitSystem } : {}) },
      });
    }
    const currentProfile = await db.profile.findUnique({ where: { userId: user.id } });
    if (Object.keys(profilePatch).length > 0 || weightKg != null || recalculate) {
      const merged = {
        ...currentProfile,
        ...profilePatch,
        ...(weightKg != null ? { weightKg } : {}),
      };
      if (merged.sex && merged.birthDate && merged.heightCm && merged.weightKg) {
        await db.profile.update({
          where: { userId: user.id },
          data: {
            ...(weightKg != null ? { weightKg } : {}),
            ...profilePatch,
          },
        });
        if (recalculate) {
          const result = calcTargets({
            sex: merged.sex as Sex,
            birthDate: merged.birthDate,
            heightCm: merged.heightCm,
            weightKg: merged.weightKg,
            goalWeightKg: merged.goalWeightKg ?? null,
            bodyFatPct: merged.bodyFatPct ?? null,
            goal: (profilePatch.goal ?? merged.goal ?? "maintain") as Goal,
            weeklyRateKg: profilePatch.weeklyRateKg ?? merged.weeklyRateKg ?? 0.5,
            activityLevel: (profilePatch.activityLevel ?? merged.activityLevel ?? "moderate") as ActivityLevel,
            userType: (profilePatch.userType ?? merged.userType ?? "general") as UserType,
          });
          const trainingDay = (profilePatch.userType ?? merged.userType) === "athlete";
          const trainResult = trainingDay
            ? calcTargets(
                {
                  sex: merged.sex as Sex,
                  birthDate: merged.birthDate,
                  heightCm: merged.heightCm,
                  weightKg: merged.weightKg,
                  goalWeightKg: merged.goalWeightKg ?? null,
                  bodyFatPct: merged.bodyFatPct ?? null,
                  goal: (profilePatch.goal ?? merged.goal ?? "maintain") as Goal,
                  weeklyRateKg: profilePatch.weeklyRateKg ?? merged.weeklyRateKg ?? 0.5,
                  activityLevel: (profilePatch.activityLevel ?? merged.activityLevel ?? "moderate") as ActivityLevel,
                  userType: "athlete",
                },
                true
              )
            : null;
          await db.targets.upsert({
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
          if (weightKg != null) {
            await db.bodyMeasurement.create({
              data: { userId: user.id, date: localDateStr(), weightKg },
            });
          }
        }
      }
    }
    return Response.json({ ok: true, waterTarget: waterTargetMl(weightKg ?? currentProfile?.weightKg ?? null) });
  } catch (e) {
    return errorResponse(e);
  }
}
