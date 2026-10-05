import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth";
import { localDaysAgoStr, calcStreak } from "@/lib/calculations";

export const runtime = "nodejs";
export const maxDuration = 60;

/** In-memory cache (local memory caching policy) */
const cache = new Map<string, { at: number; text: string }>();
const TTL = 30 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const locale = new URL(req.url).searchParams.get("locale") || user.locale || "tr";
    const lang = locale === "en" ? "English" : "Turkish";
    const today = new Date();
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      days.push(localDaysAgoStr(i));
    }
    const [logs, targets, workouts, weights] = await Promise.all([
      db.mealLog.findMany({
        where: { userId: user.id, date: { in: days }, deletedAt: null, isTemplate: false },
        include: { items: true },
      }),
      db.targets.findUnique({ where: { userId: user.id } }),
      db.workout.findMany({ where: { userId: user.id, date: { in: days } } }),
      db.bodyMeasurement.findMany({
        where: { userId: user.id, date: { gte: days[0] } },
        orderBy: { date: "asc" },
      }),
    ]);

    const perDay = days.map((d) => {
      const dayLogs = logs.filter((l) => l.date === d);
      const kcal = dayLogs.reduce((a, l) => a + l.items.reduce((s, i) => s + i.kcal, 0), 0);
      const protein = dayLogs.reduce((a, l) => a + l.items.reduce((s, i) => s + i.protein, 0), 0);
      const water = 0;
      return { date: d, kcal: Math.round(kcal), protein: Math.round(protein), water };
    });
    const loggedDays = perDay.filter((d) => d.kcal > 200).length;
    const hitDays = targets ? perDay.filter((d) => d.kcal > 0 && Math.abs(d.kcal - targets.calories) <= targets.calories * 0.1).length : 0;
    const proteinHits = targets ? perDay.filter((d) => d.protein >= targets.protein * 0.9).length : 0;
    const streak = calcStreak(new Set(logs.map((l) => l.date)), today);
    const workoutCount = workouts.length;

    const stats = {
      targetCalories: targets?.calories ?? 2000,
      targetProtein: targets?.protein ?? 100,
      perDay,
      loggedDays,
      hitDays,
      proteinHits,
      streak,
      workoutCount,
      weightTrend:
        weights.length >= 2
          ? `${weights[0].weightKg} -> ${weights[weights.length - 1].weightKg} kg`
          : null,
    };

    const cacheKey = `${user.id}:${locale}:${days[6]}:${loggedDays}:${hitDays}:${proteinHits}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < TTL) {
      return Response.json({ insight: cached.text, cached: true, stats });
    }

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a supportive nutrition coach. Respond in ${lang}. Write 2-3 SHORT sentences (max 60 words) summarizing the user's week with one concrete, encouraging observation and one small actionable suggestion. Never give medical advice. Use a warm, neutral tone. Avoid weight-shaming language.`,
        },
        {
          role: "user",
          content: `My weekly nutrition stats: ${JSON.stringify(stats)}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const insight = completion.choices[0]?.message?.content?.trim() || "";
    if (insight) cache.set(cacheKey, { at: Date.now(), text: insight });
    return Response.json({ insight, cached: false, stats });
  } catch (e) {
    return errorResponse(e);
  }
}
