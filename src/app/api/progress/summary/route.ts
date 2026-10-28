import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth";
import { appDaysAgoStr } from "@/lib/tz";
import { calcStreak, adaptiveTdee } from "@/lib/calculations";

/** GET /api/progress/summary?days=7|30|90 — charts + streak + adherence + adaptive TDEE */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") || 7), 7), 90);
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      dates.push(appDaysAgoStr(i));
    }
    const [logs, targets, workouts, water, measurements, streakDates] = await Promise.all([
      db.mealLog.findMany({
        where: { userId: user.id, date: { in: dates }, deletedAt: null, isTemplate: false },
        include: { items: true },
      }),
      db.targets.findUnique({ where: { userId: user.id } }),
      db.workout.findMany({ where: { userId: user.id, date: { in: dates } } }),
      db.waterLog.findMany({ where: { userId: user.id, date: { in: dates } } }),
      db.bodyMeasurement.findMany({
        where: { userId: user.id, date: { gte: dates[0] } },
        orderBy: { date: "asc" },
      }),
      // Seri tüm zamanların kayıt tarihlerinden hesaplanır: days=7 penceresiyle
      // sınırlansa 14+ günlük gerçek seriler yanlışlıkla "7"de kırılırdı.
      db.mealLog.groupBy({
        by: ["date"],
        where: { userId: user.id, deletedAt: null, isTemplate: false },
      }),
    ]);

    const byDate = dates.map((d) => {
      const dayLogs = logs.filter((l) => l.date === d);
      const sum = (sel: (i: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }) => number) =>
        dayLogs.reduce((a, l) => a + l.items.reduce((s, sel2) => s + sel(sel2), 0), 0);
      return {
        date: d,
        kcal: Math.round(sum((i) => i.kcal)),
        protein: Math.round(sum((i) => i.protein)),
        carbs: Math.round(sum((i) => i.carbs)),
        fat: Math.round(sum((i) => i.fat)),
        fiber: Math.round(sum((i) => i.fiber)),
        burned: workouts.filter((w) => w.date === d).reduce((a, w) => a + w.calories, 0),
        waterMl: water.find((w) => w.date === d)?.ml ?? 0,
      };
    });

    const targetKcal = targets?.calories ?? 2000;
    const logged = byDate.filter((d) => d.kcal > 0);
    const hitDays = logged.filter((d) => Math.abs(d.kcal - targetKcal) <= targetKcal * 0.1).length;
    const streak = calcStreak(new Set(streakDates.map((l) => l.date)), new Date());
    const avgCalories = logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length) : 0;
    const avgProtein = logged.length ? Math.round(logged.reduce((a, d) => a + d.protein, 0) / logged.length) : 0;
    const mealTiming = ["breakfast", "lunch", "dinner", "snacks"].map((m) => ({
      meal: m,
      count: logs.filter((l) => l.mealType === m).length,
    }));

    // adaptive TDEE from last 14 days
    const last14 = byDate.slice(-14).map((d) => d.kcal || null);
    const { tdee: adaptive, confidence } = adaptiveTdee({
      dailyIntake: last14,
      weights: measurements.map((m) => ({ date: m.date, weightKg: m.weightKg ?? 0 })).filter((w) => w.weightKg > 0),
      previousTdee: targets?.tdeeEstimate || null,
    });

    // weight-change yalnızca kilolu (weightKg dolu) ölçümler üzerinden hesaplanır:
    // bel-girişli ölçüm penceresinde kilo alanı null olabilir → NaN yerine null dön.
    const weighted = measurements.filter((m) => m.weightKg != null);
    const firstW = weighted[0]?.weightKg ?? null;
    const lastW = weighted[weighted.length - 1]?.weightKg ?? null;
    const weightChange =
      firstW != null && lastW != null && weighted.length >= 2 ? Math.round((lastW - firstW) * 100) / 100 : null;
    const weightChangePct =
      weightChange != null && firstW != null && firstW !== 0 ? Math.round((weightChange / firstW) * 1000) / 10 : null;

    return Response.json({
      byDate,
      targets,
      summary: {
        loggedDays: logged.length,
        hitDays,
        adherencePct: logged.length ? Math.round((hitDays / logged.length) * 100) : 0,
        streak,
        avgCalories,
        avgProtein,
        weightChange,
        weightChangePct,
        workoutCount: workouts.length,
        totalBurned: workouts.reduce((a, w) => a + w.calories, 0),
      },
      measurements,
      mealTiming,
      adaptiveTdee: { value: adaptive, confidence },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
