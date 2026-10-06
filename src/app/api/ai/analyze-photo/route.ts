import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { localDateStr } from "@/lib/calculations";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const UPLOAD_ROOT = path.join(process.cwd(), "upload");
const FREE_DAILY_LIMIT = 5;
/** Demo hesapları ortak oturumla kullanıldığından paylaşılan kota tek kullanıcıyı bloklamasın */
const DEMO_DAILY_LIMIT = 40;
const isDemoUser = (email?: string | null) => !!email?.endsWith("@demo.kaloriai.app");

export const runtime = "nodejs";
export const maxDuration = 60;

const itemSchema = z.object({
  name: z.string().min(1).max(120),
  grams: z.number().min(1).max(3000),
  kcal: z.number().min(0).max(5000),
  protein: z.number().min(0).max(400),
  carbs: z.number().min(0).max(600),
  fat: z.number().min(0).max(400),
  fiber: z.number().min(0).max(200).default(0),
  sugar: z.number().min(0).max(500).default(0),
  sodium: z.number().min(0).max(20000).default(0),
  satFat: z.number().min(0).max(500).default(0),
  confidence: z.number().min(0).max(1).default(0.5),
  alternatives: z.array(z.string().max(120)).max(3).default([]),
});

const responseSchema = z.object({
  items: z.array(itemSchema).min(1).max(12),
  overallConfidence: z.number().min(0).max(1),
  clarifyingQuestion: z.string().max(300).optional().nullable(),
});

function buildPrompt(locale: string): string {
  const lang = locale === "en" ? "English" : "Turkish";
  return `You are a nutrition expert analyzing a photo of a meal. The user's language is ${lang}.

Identify EVERY distinct food/drink item in the photo. For each item estimate:
- name: the food name in ${lang} (use natural names, e.g. Turkish cuisine dishes like pilav, mantı, lahmacun, börek, kebap, mercimek çorbası when applicable)
- grams: estimated portion weight in grams (be realistic about plate sizes)
- kcal: calories for the estimated portion
- protein, carbs, fat, fiber: grams for the estimated portion
- sugar: estimated sugar grams, sodium: estimated sodium milligrams, satFat: estimated saturated fat grams for the portion (estimate 0 only if truly none)
- confidence: 0-1 confidence in this item's identification and portion
- alternatives: up to 3 alternative food names in ${lang} that the item could be

Rules:
- Hidden ingredients (cooking oil, butter, sugar, sauces) MUST be accounted for if plausibly present; if uncertain about a hidden ingredient, include it in the clarifyingQuestion.
- If portions are genuinely unclear, lower the confidence and ask ONE short clarifying question in ${lang} in clarifyingQuestion (e.g. "Was oil used with the rice?").
- overallConfidence: average confidence across items (0-1).
- Respond ONLY with a JSON object matching exactly this schema, no markdown, no commentary:
{"items":[{"name":"...","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"satFat":0,"confidence":0,"alternatives":["..."]}],"overallConfidence":0,"clarifyingQuestion":"..."}`;
}

async function checkQuota(userId: string, limit: number = FREE_DAILY_LIMIT): Promise<void> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  const premium = sub?.tier === "premium" && (!sub.cancelledAt || (sub.renewsAt && sub.renewsAt > new Date()));
  if (premium) return;
  const date = localDateStr();
  const quota = await db.usageQuota.findUnique({ where: { userId_date: { userId, date } } });
  if ((quota?.aiCount ?? 0) >= limit) throw new ApiError("QUOTA_EXCEEDED", 429);
}

async function bumpQuota(userId: string): Promise<void> {
  const date = localDateStr();
  await db.usageQuota.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, aiCount: 1 },
    update: { aiCount: { increment: 1 } },
  });
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

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const profile = await db.profile.findUnique({ where: { userId: user.id } });

    const form = await req.formData();
    const file = form.get("image");
    const locale = (form.get("locale") as string) || user.locale || "tr";
    if (!(file instanceof File)) throw new ApiError("VALIDATION", 400);
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowed.includes(file.type)) throw new ApiError("FILE_TYPE", 415);
    if (file.size > 10 * 1024 * 1024) throw new ApiError("FILE_TOO_LARGE", 413);

    await checkQuota(user.id, isDemoUser(user.email) ? DEMO_DAILY_LIMIT : FREE_DAILY_LIMIT);

    // compress + persist privately per user
    const buf = Buffer.from(await file.arrayBuffer());
    // Bozuk/desteklenmeyen görsel verisi sharp'ta fırlar → 500 yerine 415 döndür
    let compressed: Buffer;
    try {
      compressed = await sharp(buf)
        .rotate()
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      throw new ApiError("FILE_TYPE", 415);
    }
    const dir = path.join(UPLOAD_ROOT, "ai", user.id);
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${Date.now()}.jpg`;
    await fs.writeFile(path.join(dir, fileName), compressed);
    const imagePath = `ai/${user.id}/${fileName}`;

    const zai = await ZAI.create();
    const base64 = compressed.toString("base64");
    const completion = await zai.chat.completions.createVision({
      model: "glm-4.5v",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(locale) },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content ?? "";
    if (!content) throw new ApiError("AI_FAILED", 502);

    const raw = extractJson(content);
    const parsedResult = responseSchema.safeParse(raw);
    if (!parsedResult.success) throw new ApiError("AI_PARSE_FAILED", 502);
    const result = parsedResult.data;
    if (!result.items.length) throw new ApiError("NOT_FOOD", 422);

    const analysis = await db.aiAnalysis.create({
      data: {
        userId: user.id,
        imagePath,
        rawResponse: JSON.stringify(result),
        confidence: result.overallConfidence,
      },
    });
    await bumpQuota(user.id);
    const quota = await db.usageQuota.findUnique({ where: { userId_date: { userId: user.id, date: localDateStr() } } });

    return Response.json({
      ok: true,
      analysisId: analysis.id,
      imageUrl: `/api/files/${imagePath}`,
      items: result.items,
      overallConfidence: result.overallConfidence,
      clarifyingQuestion: result.clarifyingQuestion ?? null,
      quotaLeft: Math.max(0, (isDemoUser(user.email) ? DEMO_DAILY_LIMIT : FREE_DAILY_LIMIT) - (quota?.aiCount ?? 1)),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
