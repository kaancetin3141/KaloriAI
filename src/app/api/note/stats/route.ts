import { db } from "@/lib/db";
import { localDateStr } from "@/lib/calculations";
import { requireUser, errorResponse } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/note/stats?days=30
 * Mood ↔ nutrition correlation: for each day with a mood entry, returns
 * logged kcal and adherence vs the calorie target, plus aggregate rates.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const daysRaw = Number(url.searchParams.get("days") ?? "30");
    const days = Number.isFinite(daysRaw)
      ? Math.min(Math.max(Math.trunc(daysRaw), 7), 90)
      : 30;

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    const sinceStr = localDateStr(since);

    const notes = await db.dailyNote.findMany({
      where: { userId: user.id, date: { gte: sinceStr }, mood: { not: null } },
      orderBy: { date: "asc" },
      select: { date: true, mood: true },
    });

    const moodDays = notes.map((n) => ({ date: n.date, mood: n.mood as string }));

    let targetKcal: number | null = null;
    if (moodDays.length > 0) {
      const targets = await db.targets.findUnique({
        where: { userId: user.id },
        select: { calories: true },
      });
      targetKcal = targets?.calories ?? null;
    }

    // Sum kcal per logged date (only for dates that have a mood entry)
    const kcalByDate = new Map<string, number>();
    if (moodDays.length > 0) {
      const logs = await db.mealLog.findMany({
        where: {
          userId: user.id,
          date: { in: moodDays.map((d) => d.date) },
          deletedAt: null,
          isTemplate: false,
        },
        select: { date: true, items: { select: { kcal: true } } },
      });
      for (const log of logs) {
        const sum = log.items.reduce((a, i) => a + i.kcal, 0);
        kcalByDate.set(log.date, (kcalByDate.get(log.date) ?? 0) + sum);
      }
    }

    const POSITIVE = new Set(["great", "good"]);
    const NEGATIVE = new Set(["low", "bad"]);
    const ON_TARGET_MIN = 0.8;
    const ON_TARGET_MAX = 1.1;

    const moodCounts: Record<string, number> = {};
    let positiveOn = 0;
    let positiveN = 0;
    let negativeOn = 0;
    let negativeN = 0;

    const daysOut = moodDays.map(({ date, mood }) => {
      moodCounts[mood] = (moodCounts[mood] ?? 0) + 1;
      const kcal = kcalByDate.get(date) ?? null;
      let targetPct: number | null = null;
      if (kcal !== null && targetKcal && targetKcal > 0) {
        targetPct = Math.round((kcal / targetKcal) * 100) / 100;
        const onTarget = targetPct >= ON_TARGET_MIN && targetPct <= ON_TARGET_MAX;
        if (POSITIVE.has(mood)) {
          positiveN++;
          if (onTarget) positiveOn++;
        } else if (NEGATIVE.has(mood)) {
          negativeN++;
          if (onTarget) negativeOn++;
        }
      }
      return { date, mood, kcal, targetPct };
    });

    const positiveRate = positiveN > 0 ? Math.round((positiveOn / positiveN) * 100) / 100 : null;
    const negativeRate = negativeN > 0 ? Math.round((negativeOn / negativeN) * 100) / 100 : null;

    return Response.json({
      ok: true,
      count: daysOut.length,
      days: daysOut,
      moodCounts,
      positiveRate,
      negativeRate,
      samples: { positive: positiveN, negative: negativeN },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
