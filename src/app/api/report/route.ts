import { db } from "@/lib/db";
import { localDateStr } from "@/lib/calculations";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/report?date=YYYY-MM-DD — printable weekly report data (last 7 days ending at date) */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) throw new ApiError("VALIDATION", 400);
    const endDate = dateParam ?? localDateStr();
    const start = new Date(`${endDate}T12:00:00`);
    start.setDate(start.getDate() - 6);
    const startDate = start.toLocaleDateString("en-CA");
    const dates: string[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < 7; i++) {
      dates.push(cursor.toLocaleDateString("en-CA"));
      cursor.setDate(cursor.getDate() + 1);
    }

    const [profile, targets, logs, water, workouts, measurements, dailyNote] = await Promise.all([
      db.profile.findUnique({ where: { userId: user.id } }),
      db.targets.findUnique({ where: { userId: user.id } }),
      db.mealLog.findMany({
        where: { userId: user.id, isTemplate: false, deletedAt: null, date: { in: dates } },
        include: { items: true },
      }),
      db.waterLog.findMany({ where: { userId: user.id, date: { in: dates } } }),
      db.workout.findMany({ where: { userId: user.id, date: { in: dates } } }),
      db.bodyMeasurement.findMany({
        where: { userId: user.id, date: { lte: endDate } },
        orderBy: { date: "asc" },
      }),
      db.dailyNote.findMany({ where: { userId: user.id, date: { in: dates } }, orderBy: { date: "asc" } }),
    ]);

    const byDate = dates.map((date) => {
      const dayLogs = logs.filter((l) => l.date === date);
      const totals = dayLogs.reduce(
        (acc, l) => {
          for (const it of l.items) {
            acc.kcal += it.kcal;
            acc.protein += it.protein;
            acc.carbs += it.carbs;
            acc.fat += it.fat;
            acc.fiber += it.fiber;
          }
          return acc;
        },
        { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
      );
      const round = (v: number) => Math.round(v);
      return {
        date,
        kcal: round(totals.kcal),
        protein: round(totals.protein),
        carbs: round(totals.carbs),
        fat: round(totals.fat),
        fiber: round(totals.fiber),
        waterMl: water.filter((w) => w.date === date).reduce((a, w) => a + w.ml, 0),
        burned: Math.round(workouts.filter((w) => w.date === date).reduce((a, w) => a + w.calories, 0)),
        mood: dailyNote.find((n) => n.date === date)?.mood ?? null,
      };
    });

    const loggedDays = byDate.filter((d) => d.kcal > 0).length;
    const hitDays = targets
      ? byDate.filter((d) => d.kcal > 0 && Math.abs(d.kcal - targets.calories) <= targets.calories * 0.1).length
      : 0;

    const measByDate = new Map<string, (typeof measurements)[number]>();
    for (const m of measurements) measByDate.set(m.date, m);
    const latestMeas = measurements[measurements.length - 1] ?? null;
    const startMeas = measByDate.get(startDate) ?? null;

    return Response.json({
      ok: true,
      period: { start: startDate, end: endDate },
      generatedAt: new Date().toISOString(),
      user: { name: user.name, locale: user.locale },
      profile: profile
        ? {
            sex: profile.sex,
            heightCm: profile.heightCm,
            weightKg: profile.weightKg,
            goalWeightKg: profile.goalWeightKg,
            goal: profile.goal,
            activityLevel: profile.activityLevel,
            userType: profile.userType,
            dietPreference: profile.dietPreference,
          }
        : null,
      targets: targets
        ? { calories: targets.calories, protein: targets.protein, carbs: targets.carbs, fat: targets.fat }
        : null,
      byDate,
      summary: {
        loggedDays,
        hitDays,
        adherencePct: loggedDays > 0 ? Math.round((hitDays / loggedDays) * 100) : 0,
        avgCalories: loggedDays > 0 ? Math.round(byDate.reduce((a, d) => a + d.kcal, 0) / loggedDays) : 0,
        avgProtein: loggedDays > 0 ? Math.round(byDate.reduce((a, d) => a + d.protein, 0) / loggedDays) : 0,
        avgCarbs: loggedDays > 0 ? Math.round(byDate.reduce((a, d) => a + d.carbs, 0) / loggedDays) : 0,
        avgFat: loggedDays > 0 ? Math.round(byDate.reduce((a, d) => a + d.fat, 0) / loggedDays) : 0,
        avgWaterMl: loggedDays > 0 ? Math.round(byDate.reduce((a, d) => a + d.waterMl, 0) / loggedDays) : 0,
        totalBurned: Math.round(byDate.reduce((a, d) => a + d.burned, 0)),
        workoutCount: workouts.length,
      },
      body: {
        latest: latestMeas
          ? {
              date: latestMeas.date,
              weightKg: latestMeas.weightKg,
              bodyFatPct: latestMeas.bodyFatPct,
              waistCm: latestMeas.waistCm,
            }
          : null,
        weekDelta:
          startMeas && latestMeas && startMeas.weightKg != null && latestMeas.weightKg != null
            ? Math.round((latestMeas.weightKg - startMeas.weightKg) * 10) / 10
            : null,
      },
      unitSystem: user.unitSystem,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
