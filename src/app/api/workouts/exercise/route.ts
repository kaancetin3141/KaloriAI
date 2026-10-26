/**
 * Per-exercise strength history (openGym: pre-fill weights from last time + PR curve).
 * GET ?exerciseKey=xxx → { history: [{date, sets, best1RM, metric}], best, last }
 * `metric` = PR metric (e1RM when loaded, best reps when bodyweight) — chartable
 * for every exercise; `best1RM` stays pure Epley e1RM.
 */
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { parseSets, estimate1RM, prMetricOfSet, type StrengthSet } from "@/lib/strength";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const key = new URL(req.url).searchParams.get("exerciseKey") || "";
    if (!key || key.length > 60) throw new ApiError("VALIDATION", 400);
    const rows = await db.workoutExercise.findMany({
      where: { userId: user.id, exerciseKey: key },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { createdAt: true, setsJson: true },
    });
    const history = rows.map((r) => {
      const sets = parseSets(r.setsJson);
      return {
        date: r.createdAt.toISOString(),
        sets,
        best1RM: sets.reduce((b, s) => Math.max(b, estimate1RM(s.weightKg, s.reps)), 0),
        metric: sets.reduce((b, s) => Math.max(b, prMetricOfSet(s.weightKg, s.reps)), 0),
      };
    });
    const best = history.reduce((b, h) => Math.max(b, h.best1RM), 0);
    const bestMetric = history.reduce((b, h) => Math.max(b, h.metric), 0);
    const last: StrengthSet[] | null = history[0]?.sets ?? null;
    return Response.json({ history, best, bestMetric, last });
  } catch (e) {
    return errorResponse(e);
  }
}
