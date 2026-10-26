/**
 * Strength stats (openGym-inspired): weekly volume per muscle, best lifts by e1RM, recent PRs.
 * GET ?days=7|30 → { volumeByMuscle, bestLifts, recentPRs, totals }
 */
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth";
import { appDaysAgoStr } from "@/lib/tz";
import { parseSets, estimate1RM, prMetricOfSet, MUSCLE_ORDER } from "@/lib/strength";

interface BestEntry {
  exerciseKey: string;
  name: string;
  e1rm: number;
  weightKg: number;
  reps: number;
}
interface PrEntry {
  date: string;
  exerciseKey: string;
  name: string;
  weightKg: number;
  reps: number;
  e1rm: number;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 90);
    const since = appDaysAgoStr(days - 1);

    // All logged exercise rows in range
    const rows = await db.workoutExercise.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(`${since}T00:00:00.000Z`) } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, exerciseKey: true, name: true, muscle: true, setsJson: true },
    });

    const volumeByMuscle: Record<string, { volume: number; sets: number }> = {};
    const bestByKey = new Map<string, BestEntry>();
    const recentPRs: PrEntry[] = [];
    let totalSets = 0;
    let totalVolume = 0;

    // Track best-so-far to detect PRs chronologically
    const bestSoFar = new Map<string, number>();

    for (const row of rows) {
      const sets = parseSets(row.setsJson);
      const vol = sets.reduce((v, s) => v + s.reps * s.weightKg, 0);
      const nSets = sets.length;
      totalSets += nSets;
      totalVolume += vol;
      const m = (volumeByMuscle[row.muscle] ??= { volume: 0, sets: 0 });
      m.volume += vol;
      m.sets += nSets;

      // PR metric: e1RM when loaded, best reps when bodyweight — matches session save
      const sessionMetric = sets.reduce((b, s) => Math.max(b, prMetricOfSet(s.weightKg, s.reps)), 0);
      // best-lifts metric is pure e1RM (bodyweight lifts don't enter the leaderboard)
      const sessionE1rm = sets.reduce((b, s) => Math.max(b, estimate1RM(s.weightKg, s.reps)), 0);
      if (sessionMetric > 0) {
        const prev = bestSoFar.get(row.exerciseKey) ?? 0;
        if (sessionMetric > prev) {
          const prSet = sets.find((s) => prMetricOfSet(s.weightKg, s.reps) === sessionMetric)!;
          recentPRs.push({
            date: row.createdAt.toISOString(),
            exerciseKey: row.exerciseKey,
            name: row.name,
            weightKg: prSet.weightKg,
            reps: prSet.reps,
            e1rm: sessionMetric,
          });
          bestSoFar.set(row.exerciseKey, sessionMetric);
        }
      }
      if (sessionE1rm > 0) {
        const cur = bestByKey.get(row.exerciseKey);
        if (!cur || sessionE1rm > cur.e1rm) {
          const prSet = sets.find((s) => estimate1RM(s.weightKg, s.reps) === sessionE1rm)!;
          bestByKey.set(row.exerciseKey, {
            exerciseKey: row.exerciseKey,
            name: row.name,
            e1rm: sessionE1rm,
            weightKg: prSet.weightKg,
            reps: prSet.reps,
          });
        }
      }
    }

    const sessionCount = await db.workout.count({
      where: { userId: user.id, type: "strength", date: { gte: since } },
    });

    const bestLifts = [...bestByKey.values()].sort((a, b) => b.e1rm - a.e1rm).slice(0, 8);

    return Response.json({
      days,
      totals: { sessions: sessionCount, sets: totalSets, volume: Math.round(totalVolume), prs: recentPRs.length },
      volumeByMuscle: MUSCLE_ORDER.map((muscle) => ({
        muscle,
        volume: Math.round(volumeByMuscle[muscle]?.volume ?? 0),
        sets: volumeByMuscle[muscle]?.sets ?? 0,
      })),
      bestLifts,
      recentPRs: recentPRs.slice(-10).reverse(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
