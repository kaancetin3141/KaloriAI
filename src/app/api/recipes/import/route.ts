import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { appToday } from "@/lib/tz";
import { requireUser, errorResponse, ApiError, isPremium } from "@/lib/auth";
import { assertPublicHttpUrl, fetchWithGuard, UrlBlockedError } from "@/lib/url-guard";
import { createAiJob, getAiJob, startAiJob } from "@/lib/ai-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const FREE_DAILY_LIMIT = 5;

const schema = z.object({
  url: z.string().trim().min(10).max(2000),
  locale: z.enum(["tr", "en"]).default("tr"),
});

/* ---------------- quota (same policy as photo/text AI) ---------------- */
async function checkQuota(userId: string): Promise<void> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (isPremium(sub)) return;
  const date = appToday();
  const quota = await db.usageQuota.findUnique({ where: { userId_date: { userId, date } } });
  if ((quota?.aiCount ?? 0) >= FREE_DAILY_LIMIT) throw new ApiError("QUOTA_EXCEEDED", 429);
}

async function bumpQuota(userId: string): Promise<void> {
  const date = appToday();
  await db.usageQuota.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, aiCount: 1 },
    update: { aiCount: { increment: 1 } },
  });
}

/* ---------------- page extraction ---------------- */
async function extractPage(url: string): Promise<{ title: string; text: string }> {
  // 0) SSRF guard — private/loopback/metadata hedefleri ve portlar engellenir
  await assertPublicHttpUrl(url);

  // 1) SDK page_reader (clean extraction — dış serviste çözümlenir)
  try {
    const zai = await ZAI.create();
    const res = (await zai.functions.invoke("page_reader", { url })) as {
      code?: number;
      data?: { title?: string; html?: string };
    };
    const html = res?.data?.html ?? "";
    if (html.length > 200) {
      return { title: res?.data?.title ?? "", text: htmlToText(html).slice(0, 12000) };
    }
  } catch {
    // fall through to direct fetch
  }

  // 2) direct fetch + strip (SSRF guard'lı, redirect'ler hop-hop doğrulanır)
  const res = await fetchWithGuard(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; KaloriAI/1.0; +https://kaloriai.app)" },
    timeoutMs: 12000,
  });
  if (!res.ok) throw new ApiError("FETCH_FAILED", 422);
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return { title: titleMatch?.[1]?.trim() ?? "", text: htmlToText(html).slice(0, 12000) };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&ccedil;/gi, "ç").replace(/&Ccedil;/gi, "Ç")
    .replace(/&ouml;/gi, "ö").replace(/&Ouml;/gi, "Ö")
    .replace(/&uuml;/gi, "ü").replace(/&Uuml;/gi, "Ü")
    .replace(/&#351;|&scedil;/gi, "ş").replace(/&#350;|&Scedil;/gi, "Ş")
    .replace(/&#305;/gi, "ı").replace(/&#304;|&Idot;/gi, "İ")
    .replace(/&#287;|&gbreve;/gi, "ğ").replace(/&#286;|&Gbreve;/gi, "Ğ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ---------------- LLM extraction ---------------- */
function buildPrompt(text: string, locale: string, pageUrl: string): string {
  const lang = locale === "en" ? "English" : "Turkish";
  return `Extract the RECIPE from this web page content (source: ${pageUrl}). The recipe's original language may be any; respond in ${lang}.
Page content:
"""
${text}
"""

Rules:
- Find the actual recipe (name, how many servings/portions it yields, ingredients with quantities).
- Convert every ingredient amount to GRAMS (use standard kitchen conversions: 1 water glass ≈ 200ml, 1 Turkish tea glass ≈ 100ml, 1 tablespoon flour ≈ 8g, 1 tablespoon oil ≈ 12g, 1 cup ≈ 240ml, eggs ≈ 50g each...).
- For each ingredient estimate TOTAL nutrition for its stated amount: kcal, protein, carbs, fat, fiber, sugar (g), sodium (mg), satFat (g).
- If the page is not a recipe, set isRecipe=false.
Respond ONLY with JSON, no markdown:
{"isRecipe":true,"name":"<recipe name in ${lang}>","servings":0,"items":[{"name":"<ingredient in ${lang}>","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"satFat":0}],"notes":null}`;
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "```").split("```").filter(Boolean);
  const candidates = [text, ...cleaned];
  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(c.slice(start, end + 1));
      } catch {
        continue;
      }
    }
  }
  throw new ApiError("AI_PARSE_FAILED", 502);
}

const draftItem = z.object({
  name: z.string().min(1).max(120),
  grams: z.number().min(1).max(5000),
  kcal: z.number().min(0).max(8000),
  protein: z.number().min(0).max(600),
  carbs: z.number().min(0).max(900),
  fat: z.number().min(0).max(600),
  fiber: z.number().min(0).max(300).default(0),
  sugar: z.number().min(0).max(700).default(0),
  sodium: z.number().min(0).max(30000).default(0),
  satFat: z.number().min(0).max(600).default(0),
});

const draftSchema = z.object({
  isRecipe: z.boolean().default(true),
  name: z.string().min(1).max(160),
  servings: z.number().int().min(1).max(20).default(4),
  items: z.array(draftItem).min(1).max(20),
  notes: z.string().max(500).nullable().default(null),
});

export type RecipeDraft = z.infer<typeof draftSchema>;

/**
 * POST — hızlı aşama: URL doğrulanır, kota kontrol edilir ve iş arka plana
 * atanarak hemen jobId döner. Sayfa çekme (12 sn timeout'a kadar) + AI turu
 * bağlantıyı meşgul etmez; istemci GET?id= ile yoklar. (Uzun istekler ara
 * proxy'lerce kesiliyor → "Bağlantı hatası" sınıfı hatasının kökeni.)
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    let url: URL;
    try {
      // TAM SSRF guard'ı POST aşamasında (DNS + link-local/CGNAT/meta hostname):
      // engellenen hedef için iş AÇILMAZ, kota tüketilmez, istemci anında URL_BLOCKED görür.
      // (İş içi extractPage → fetchWithGuard redirect atlamlarını yine hop-hop doğrular.)
      url = await assertPublicHttpUrl(parsed.data.url);
    } catch (e) {
      if (e instanceof UrlBlockedError) throw new ApiError("URL_BLOCKED", 400);
      throw new ApiError("VALIDATION", 400);
    }

    await checkQuota(user.id);

    const jobId = createAiJob(user.id);
    const pageUrl = url.toString();
    const locale = parsed.data.locale;

    startAiJob(jobId, async () => {
      // UrlBlockedError işin içinde fırlayabilir → ApiError'a çevir (job kaydına
      // kodla yazılsın, istemci net bir hata görsün).
      let page: { title: string; text: string };
      try {
        page = await extractPage(pageUrl);
      } catch (e) {
        if (e instanceof UrlBlockedError) throw new ApiError("URL_BLOCKED", 400);
        throw e;
      }
      if (page.text.length < 150) throw new ApiError("FETCH_FAILED", 422);

      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: "You are a precise recipe extractor. Output only valid JSON." },
          { role: "user", content: buildPrompt(page.text, locale, pageUrl) },
        ],
        thinking: { type: "disabled" },
      });
      const content = completion.choices[0]?.message?.content ?? "";
      const raw = extractJson(content);
      const parsedDraft = draftSchema.safeParse(raw);
      if (!parsedDraft.success) {
        // LLM output malformed (e.g. non-recipe page produced null fields) → friendly 422, never a 500
        throw new ApiError("NOT_A_RECIPE", 422);
      }
      const draft = parsedDraft.data;
      if (!draft.isRecipe) throw new ApiError("NOT_A_RECIPE", 422);

      await bumpQuota(user.id);

      const record = await db.aiAnalysis.create({
        data: {
          userId: user.id,
          rawResponse: JSON.stringify(draft),
          confidence: 0.6,
          itemType: "recipe_import",
          textInput: pageUrl.slice(0, 2000),
        },
      });

      return {
        importId: record.id,
        draft,
        sourceTitle: page.title.length > 1 ? page.title.slice(0, 160) : null,
      };
    });

    return Response.json({ ok: true, jobId, status: "pending" });
  } catch (e) {
    if (e instanceof UrlBlockedError) return errorResponse(new ApiError("URL_BLOCKED", 400));
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
