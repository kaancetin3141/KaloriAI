import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { appToday } from "@/lib/tz";
import { createAiJob, getAiJob, startAiJob } from "@/lib/ai-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * "Şimdi ne yesem?" — günün KALAN kalorisi ve proteinine göre 4 öğün önerisi.
 * Async job deseni (/api/ai/insights ile birebir): POST bugünün verisini
 * toplar (yerel SQLite, ~50 ms), AI turunu arka plana atar ve hemen jobId
 * döner; istemci GET?id= ile yoklar. Uzun AI isteği bağlantıyı meşgul etmez.
 */

/** Gövde: yalnız locale — bilinmeyen alanlar zod tarafından yok sayılır */
const bodySchema = z.object({ locale: z.enum(["tr", "en"]).default("tr") });

/** AI çıktısı şeması: 1..6 öneri, kcal 50..2000, protein 0..200 */
const aiSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string().min(1),
        kcal: z.number().min(50).max(2000),
        protein: z.number().min(0).max(200),
        why: z.string().min(1),
        searchTerm: z.string().min(1),
      })
    )
    .min(1)
    .max(6),
});

/** AI metninden JSON çıkar (```json çitleri tolere edilir) — parse-text ile aynı yaklaşım */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ApiError("AI_PARSE", 502);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ApiError("AI_PARSE", 502);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const locale = parsed.data.locale || user.locale || "tr";

    // Bugünün gerçek verisi — today-screen'in ETKİLİ hedef mantığıyla birebir:
    // sporcu + bugün antrenman kaydı → trainCalories/trainProtein
    // (+ antrenmanında hedefe eklediği yakılan kalori).
    const date = appToday();
    const [logs, targets, workouts, profile] = await Promise.all([
      db.mealLog.findMany({
        where: { userId: user.id, date, deletedAt: null, isTemplate: false },
        include: { items: true },
      }),
      db.targets.findUnique({ where: { userId: user.id } }),
      db.workout.findMany({ where: { userId: user.id, date } }),
      db.profile.findUnique({ where: { userId: user.id } }),
    ]);

    const consumedKcal = logs.reduce((a, l) => a + l.items.reduce((s, i) => s + i.kcal, 0), 0);
    const consumedProtein = logs.reduce((a, l) => a + l.items.reduce((s, i) => s + i.protein, 0), 0);
    const isTrainingDay =
      profile?.userType === "athlete" && workouts.length > 0 && targets?.trainCalories != null;
    const addedBurned = workouts.filter((w) => w.addedToTarget).reduce((a, w) => a + w.calories, 0);
    const effectiveKcal =
      (isTrainingDay ? targets?.trainCalories ?? targets?.calories ?? 2000 : targets?.calories ?? 2000) +
      addedBurned;
    const effectiveProtein = isTrainingDay
      ? targets?.trainProtein ?? targets?.protein ?? 100
      : targets?.protein ?? 100;
    const remainingKcal = Math.max(Math.round(effectiveKcal - consumedKcal), 0);
    const remainingProtein = Math.max(Math.round(effectiveProtein - consumedProtein), 0);

    const jobId = createAiJob(user.id);
    startAiJob(jobId, async () => {
      const lang = locale === "en" ? "English" : "Turkish";
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a Turkish nutrition coach. Respond ONLY with JSON, no markdown fences.",
          },
          {
            role: "user",
            content: `The user has ${remainingKcal} kcal and ${remainingProtein} g protein left today. Suggest 4 realistic Turkish/general meal ideas that fit. Respond ONLY with JSON: {"suggestions":[{"name":string (max 60 chars),"kcal":number (est. for the meal),"protein":number (g est),"why":string (max 90 chars, why it fits — e.g. 'protein açığını kapatır'),"searchTerm":string (1-2 generic food words to search in a food database, e.g. 'tavuk')}]} — 4 items, Turkish names if locale tr, English if en (current: ${lang}), no repeats.`,
          },
        ],
        thinking: { type: "disabled" },
      });
      const content = completion.choices[0]?.message?.content ?? "";
      const raw = extractJson(content);
      const result = aiSchema.safeParse(raw);
      if (!result.success) throw new ApiError("AI_PARSE", 502);
      // Uzun alanları kozmetik olarak kırp (şema yalnız sayı sınırlarını reddeder)
      const suggestions = result.data.suggestions.map((s) => ({
        name: s.name.trim().slice(0, 60),
        kcal: Math.round(s.kcal),
        protein: Math.round(s.protein),
        why: s.why.trim().slice(0, 90),
        searchTerm: s.searchTerm.trim().slice(0, 60),
      }));
      return { suggestions };
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
