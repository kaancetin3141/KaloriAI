import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { parseAppleHealthFile, latestPerDay } from "@/lib/apple-health";

/** Premium gate — same policy as progress photos */
async function requirePremium(userId: string): Promise<void> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  const premium =
    sub?.tier === "premium" &&
    (!sub.cancelledAt || (sub.renewsAt && sub.renewsAt > new Date()) || (sub.trialEndsAt && sub.trialEndsAt > new Date()));
  if (!premium) throw new ApiError("PREMIUM_REQUIRED", 402);
}

const formSchema = z.object({ dryRun: z.enum(["0", "1"]).default("0") });

/** Default MET by mapped workout type (when the export has no energy) */
const DEFAULT_MET: Record<string, number> = {
  running: 8.0, cycling: 6.8, swimming: 7.0, walking: 3.5, strength: 5.0,
  football: 7.0, basketball: 6.5, hiit: 7.0, yoga: 2.5, other: 4.0,
};

function intensityForMet(met: number): string {
  return met < 4 ? "light" : met < 7 ? "moderate" : "vigorous";
}

/**
 * POST /api/integrations/apple-health
 * FormData: file (.zip | .xml), dryRun ("1" preview | "0" import)
 * PREMIUM only. Maps weight/body-fat/steps/workouts from a HealthKit export.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await requirePremium(user.id);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("VALIDATION", 400);
    if (file.size > 60 * 1024 * 1024) throw new ApiError("FILE_TOO_LARGE", 413);
    const dryRun = formSchema.safeParse({ dryRun: (form.get("dryRun") as string) || "0" });
    if (!dryRun.success) throw new ApiError("VALIDATION", 400);

    let parsed;
    try {
      parsed = await parseAppleHealthFile(file);
    } catch {
      throw new ApiError("NO_HEALTH_DATA", 422);
    }

    const massByDay = latestPerDay(parsed.mass);
    const fatByDay = latestPerDay(parsed.bodyFat);
    const stepDays = parsed.stepsByDay.size;
    const stepTotal = [...parsed.stepsByDay.values()].reduce((a, b) => a + b, 0);

    const preview = {
      massDays: massByDay.size,
      bodyFatDays: fatByDay.size,
      stepDays,
      stepTotal,
      workouts: parsed.workouts.length,
      dateFrom: parsed.dateFrom,
      dateTo: parsed.dateTo,
      sampleMass: [...massByDay.entries()].slice(-3),
      sampleWorkouts: parsed.workouts.slice(-3).map((w) => ({ date: w.date, type: w.type, durationMin: w.durationMin })),
    };

    if (dryRun.data.dryRun === "1") {
      return Response.json({ preview });
    }

    /* ---------- IMPORT ---------- */
    let measurementCount = 0;
    // merge mass + body fat per date → single upsert per day
    const dates = new Set<string>([...massByDay.keys(), ...fatByDay.keys()]);
    for (const date of dates) {
      const weightKg = massByDay.get(date) ?? null;
      const bodyFatPct = fatByDay.get(date) ?? null;
      const existing = await db.bodyMeasurement.findFirst({ where: { userId: user.id, date } });
      if (existing) {
        await db.bodyMeasurement.update({
          where: { id: existing.id },
          data: {
            weightKg: weightKg ?? existing.weightKg,
            bodyFatPct: bodyFatPct ?? existing.bodyFatPct,
          },
        });
      } else {
        await db.bodyMeasurement.create({ data: { userId: user.id, date, weightKg, bodyFatPct } });
      }
      measurementCount++;
    }

    let workoutCount = 0;
    if (parsed.workouts.length > 0) {
      const wDates = parsed.workouts.map((w) => w.date);
      const existing = await db.workout.findMany({
        where: { userId: user.id, date: { gte: wDates.reduce((a, b) => (a < b ? a : b)), lte: wDates.reduce((a, b) => (a > b ? a : b)) } },
        select: { date: true, type: true, durationMin: true },
      });
      const seen = new Set(existing.map((w) => `${w.date}|${w.type}|${w.durationMin}`));
      const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { weightKg: true } });
      const weightKg = profile?.weightKg ?? 70;
      const toCreate: {
        userId: string; date: string; type: string; name: string; durationMin: number;
        intensity: string; met: number; calories: number;
      }[] = [];
      for (const w of parsed.workouts) {
        const key = `${w.date}|${w.type}|${w.durationMin}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const hours = w.durationMin / 60;
        const met = w.kcal && w.kcal > 0
          ? Math.min(14, Math.max(1.2, Math.round((w.kcal / (weightKg * hours)) * 10) / 10))
          : (DEFAULT_MET[w.type] ?? 4.0);
        toCreate.push({
          userId: user.id,
          date: w.date,
          type: w.type,
          name: "Apple Health",
          durationMin: w.durationMin,
          intensity: intensityForMet(met),
          met,
          calories: w.kcal && w.kcal > 0 ? w.kcal : Math.round(met * weightKg * hours),
        });
      }
      if (toCreate.length > 0) {
        const res = await db.workout.createMany({ data: toCreate });
        workoutCount = res.count;
      }
    }

    let stepCount = 0;
    for (const [date, count] of parsed.stepsByDay) {
      await db.stepsLog.upsert({
        where: { userId_date: { userId: user.id, date } },
        create: { userId: user.id, date, count, source: "apple_health" },
        update: { count, source: "apple_health" },
      });
      stepCount++;
    }

    return Response.json({
      imported: { measurements: measurementCount, workouts: workoutCount, stepDays: stepCount },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
