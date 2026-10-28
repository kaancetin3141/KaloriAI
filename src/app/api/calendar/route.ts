import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { appToday, addDaysIso, monthStartStr, monthEndStr } from "@/lib/tz";
import type { CalendarDay } from "@/lib/types";

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * GET /api/calendar?month=YYYY-MM — month-at-a-glance day cells for the
 * FitZen-style calendar dialog ("Takvim").
 *
 * - All calendar math uses APP_TZ date strings (Europe/Istanbul).
 * - ONE range query per table (never per-day queries).
 * - All days of the month are included; future days come back logged:false
 *   with zeroed numerics (the `logged` flag carries the meaning).
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const month = new URL(req.url).searchParams.get("month") ?? "";
    if (!monthRe.test(month)) throw new ApiError("VALIDATION", 400);

    const firstDay = monthStartStr(month);
    const lastDay = monthEndStr(month);
    const today = appToday();

    // FastingLog stores INSTANTS (startAt/endAt), not date strings. A fast
    // overlaps the month only if it started inside a generous ±3-day window
    // around it (fasts last at most a few days; APP_TZ day bounds shift by
    // whole hours vs UTC, so 3 days is a safe pad). Ongoing fasts (endAt
    // null) are always fetched and cover up to today.
    const fastStart = new Date(`${addDaysIso(firstDay, -3)}T00:00:00Z`);
    const fastEnd = new Date(`${addDaysIso(lastDay, 3)}T00:00:00Z`);

    const [logs, waterLogs, workouts, fasts, targets, profile] = await Promise.all([
      db.mealLog.findMany({
        where: { userId: user.id, date: { gte: firstDay, lte: lastDay }, isTemplate: false, deletedAt: null },
        include: { items: true },
      }),
      db.waterLog.findMany({ where: { userId: user.id, date: { gte: firstDay, lte: lastDay } } }),
      db.workout.findMany({ where: { userId: user.id, date: { gte: firstDay, lte: lastDay } } }),
      db.fastingLog.findMany({
        where: { userId: user.id, OR: [{ startAt: { gte: fastStart, lt: fastEnd } }, { endAt: null }] },
      }),
      db.targets.findUnique({ where: { userId: user.id } }),
      db.profile.findUnique({ where: { userId: user.id }, select: { userType: true } }),
    ]);

    // ---- per-day aggregation (maps, single pass per table) ----
    const mealsBy = new Map<string, { kcal: number; protein: number }>();
    for (const log of logs) {
      const m = mealsBy.get(log.date) ?? { kcal: 0, protein: 0 };
      for (const item of log.items) {
        m.kcal += item.kcal;
        m.protein += item.protein;
      }
      mealsBy.set(log.date, m);
    }

    const waterBy = new Map<string, number>();
    for (const w of waterLogs) waterBy.set(w.date, (waterBy.get(w.date) ?? 0) + w.ml);

    const workoutBy = new Map<string, number>();
    for (const w of workouts) workoutBy.set(w.date, (workoutBy.get(w.date) ?? 0) + w.durationMin);

    const dayFasting = (date: string) =>
      fasts.some((f) => {
        const s = appToday(f.startAt);
        const e = f.endAt ? appToday(f.endAt) : today;
        return s <= date && date <= e;
      });

    // ---- build ALL days of the month ----
    const dayCount = Number(lastDay.slice(8));
    const days: CalendarDay[] = [];
    for (let i = 1; i <= dayCount; i++) {
      const date = `${month}-${String(i).padStart(2, "0")}`;
      const future = date > today;
      const meal = mealsBy.get(date);
      const waterMl = waterBy.get(date) ?? 0;
      const workoutMin = workoutBy.get(date) ?? 0;
      days.push({
        date,
        kcal: future ? 0 : Math.round(meal?.kcal ?? 0),
        protein: future ? 0 : Math.round(meal?.protein ?? 0),
        waterMl: future ? 0 : waterMl,
        workoutMin: future ? 0 : workoutMin,
        fasting: future ? false : dayFasting(date),
        // "logged": tüm ögeleri silinmiş boş öğün kaydı günü dolu göstermesin —
        // kcal>0 olan gerçek öğün ya da su/antrenman kaydı gerekir.
        logged: !future && ((meal?.kcal ?? 0) > 0 || waterMl > 0 || workoutMin > 0),
      });
    }

    return Response.json({
      month,
      days,
      // day-target inputs for the client: athlete training-day override logic
      targetKcal: targets?.calories ?? 0,
      trainTargetKcal: targets?.trainCalories ?? null,
      isAthlete: profile?.userType === "athlete",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
