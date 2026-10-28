import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { appDaysAgoStr } from "@/lib/tz";
import { calcStreak } from "@/lib/calculations";
import { createAiJob, getAiJob, startAiJob } from "@/lib/ai-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

/** In-memory cache (local memory caching policy) */
const cache = new Map<string, { at: number; text: string }>();
const TTL = 30 * 60 * 1000;
/** Bellek sızıntısı koruması: TTL dışı girdiler yazma anında temizlenir. */
function cacheSweep() {
  if (cache.size < 64) return;
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at >= TTL) cache.delete(k);
}

const bodySchema = z.object({ locale: z.enum(["tr", "en"]).default("tr") });

/** Son 7 günün gerçek verilerinden haftalık istatistik paketini toplar (yerel SQLite, hızlı). */
async function gatherWeeklyStats(userId: string) {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(appDaysAgoStr(i));
  }
  const [logs, targets, workouts, weights, waterLogs, streakDates] = await Promise.all([
    db.mealLog.findMany({
      where: { userId, date: { in: days }, deletedAt: null, isTemplate: false },
      include: { items: true },
    }),
    db.targets.findUnique({ where: { userId } }),
    db.workout.findMany({ where: { userId, date: { in: days } } }),
    db.bodyMeasurement.findMany({
      where: { userId, date: { gte: days[0] } },
      orderBy: { date: "asc" },
    }),
    db.waterLog.findMany({ where: { userId, date: { in: days } } }),
    // Seri tüm zamanların kayıt tarihlerinden hesaplanır (pencereyle sınırlanamaz)
    db.mealLog.groupBy({
      by: ["date"],
      where: { userId, deletedAt: null, isTemplate: false },
    }),
  ]);

  const perDay = days.map((d) => {
    const dayLogs = logs.filter((l) => l.date === d);
    const kcal = dayLogs.reduce((a, l) => a + l.items.reduce((s, i) => s + i.kcal, 0), 0);
    const protein = dayLogs.reduce((a, l) => a + l.items.reduce((s, i) => s + i.protein, 0), 0);
    // gerçek su verisi: günün toplamı (ml → litre); kayıt yoksa 0
    const waterMl = waterLogs.filter((w) => w.date === d).reduce((a, w) => a + w.ml, 0);
    const water = Math.round((waterMl / 1000) * 10) / 10;
    return { date: d, kcal: Math.round(kcal), protein: Math.round(protein), water };
  });
  const loggedDays = perDay.filter((d) => d.kcal > 200).length;
  const hitDays = targets
    ? perDay.filter((d) => d.kcal > 0 && Math.abs(d.kcal - targets.calories) <= targets.calories * 0.1).length
    : 0;
  const proteinHits = targets ? perDay.filter((d) => d.protein >= targets.protein * 0.9).length : 0;
  const streak = calcStreak(new Set(streakDates.map((l) => l.date)));
  const workoutCount = workouts.length;

  // kilo trendi: yalnız kilo alanı dolu ölçümler; yoksa "unknown" (null sızmasın)
  const weighted = weights.filter((w) => w.weightKg != null);
  const firstW = weighted[0]?.weightKg ?? null;
  const lastW = weighted[weighted.length - 1]?.weightKg ?? null;
  const weightTrend =
    weighted.length >= 2 && firstW != null && lastW != null
      ? `${firstW} -> ${lastW} kg`
      : "unknown";

  const stats = {
    targetCalories: targets?.calories ?? 2000,
    targetProtein: targets?.protein ?? 100,
    perDay,
    loggedDays,
    hitDays,
    proteinHits,
    streak,
    workoutCount,
    weightTrend,
  };
  return { stats, days };
}

/**
 * POST — hızlı aşama: haftalık istatistikler toplanır (yerel DB, ~50 ms); taze
 * önbellek varsa sonuç anında döner (jobId yok → istemci akışı bitirir). Önbellek
 * yoksa AI turu arka plana atanır ve jobId döner. AI çağrısı (1–3 sn) bağlantıyı
 * meşgul etmez; istemci GET?id= ile yoklar. (Uzun istekler ara proxy'lerce
 * kesiliyor → "Bağlantı hatası" sınıfı hatasının kökeni.)
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const locale = parsed.data.locale || user.locale || "tr";
    const lang = locale === "en" ? "English" : "Turkish";

    const { stats, days } = await gatherWeeklyStats(user.id);

    const cacheKey = `${user.id}:${locale}:${days[6]}:${stats.loggedDays}:${stats.hitDays}:${stats.proteinHits}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < TTL) {
      return Response.json({ insight: cached.text, cached: true, stats });
    }

    const jobId = createAiJob(user.id);
    startAiJob(jobId, async () => {
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
      if (insight) {
        cacheSweep();
        cache.set(cacheKey, { at: Date.now(), text: insight });
      }
      return { insight, cached: false, stats };
    });

    return Response.json({ ok: true, jobId, status: "pending" });
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET?id= — yoklama: pending / done (tam sonuç) / error (ApiError). */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("VALIDATION", 400);

    const job = getAiJob(id, user.id);
    if (!job) throw new ApiError("JOB_NOT_FOUND", 404);

    if (job.status === "pending") return Response.json({ ok: true, status: "pending" });
    if (job.status === "error") {
      throw new ApiError(job.error ?? "AI_FAILED", job.errorStatus ?? 502);
    }
    return Response.json({ ok: true, status: "done", ...(job.result as Record<string, unknown>) });
  } catch (e) {
    return errorResponse(e);
  }
}
