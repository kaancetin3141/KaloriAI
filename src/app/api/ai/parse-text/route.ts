import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  text: z.string().min(3).max(500),
  locale: z.enum(["tr", "en"]).default("tr"),
});

function buildPrompt(text: string, locale: string): string {
  const lang = locale === "en" ? "English" : "Turkish";
  return `Parse this meal description into individual food items with portion estimates. The user's language is ${lang}.
Description: "${text}"

Estimate realistic portions in grams for each item and compute nutrition. Account for hidden ingredients (oil, sugar) reasonably.
For each item also estimate: sugar (grams), sodium (milligrams), satFat (saturated fat grams) — estimate 0 only if truly none.
Respond ONLY with JSON, no markdown:
{"items":[{"name":"<in ${lang}>","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"satFat":0,"confidence":0,"alternatives":[]}],"overallConfidence":0,"clarifyingQuestion":null}`;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ApiError("AI_PARSE_FAILED", 502);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ApiError("AI_PARSE_FAILED", 502);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a precise nutrition parser. Output only valid JSON." },
        { role: "user", content: buildPrompt(parsed.data.text, parsed.data.locale) },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content ?? "";
    const raw = extractJson(content);
    const resultSchema = z.object({
      items: z
        .array(
          z.object({
            name: z.string(),
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
            alternatives: z.array(z.string()).max(3).default([]),
          })
        )
        .min(1)
        .max(12),
      overallConfidence: z.number().min(0).max(1).default(0.7),
      clarifyingQuestion: z.string().max(300).optional().nullable(),
    });
    const result = resultSchema.parse(raw);
    await db.aiAnalysis.create({
      data: {
        userId: user.id,
        rawResponse: JSON.stringify(result),
        confidence: result.overallConfidence,
        itemType: "text",
        textInput: parsed.data.text,
      },
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
