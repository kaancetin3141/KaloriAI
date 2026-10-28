import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { createAiJob, getAiJob, startAiJob } from "@/lib/ai-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(60)).min(2).max(15),
  locale: z.enum(["tr", "en"]).default("tr"),
  vegan: z.boolean().default(false),
});

// Prompt sözleşmesinden biraz toleranslı sınırlar (zararsız sapmalarda işi
// düşürmemek için); normalizasyonda sözleşmeye geri kırpılır.
const recipeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  servings: z.number().int().min(1).max(8),
  kcalPerServing: z.number().min(0).max(5000),
  steps: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  ingredients: z
    .array(z.object({ name: z.string().trim().min(1).max(80), grams: z.number().min(1).max(2000) }))
    .min(1)
    .max(20),
});

const outSchema = z.object({ recipes: z.array(recipeSchema).min(1).max(4) });

export type FridgeRecipe = z.infer<typeof recipeSchema>;

/** LLM çıktısından sağlam JSON çıkarımı (çit tolere + sık görülen onarımlar). */
function extractJson(content: string): unknown {
  const cleaned = content.replace(/```json/gi, "```").split("```").filter(Boolean);
  for (const c of [content, ...cleaned]) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const slice = c.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        try {
          return JSON.parse(
            slice
              .replace(/[\u201c\u201d]/g, '"')
              .replace(/,(\s*[}\]])/g, "$1")
              .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
          );
        } catch {
          continue;
        }
      }
    }
  }
  throw new ApiError("AI_PARSE", 502);
}

function buildPrompt(ingredients: string[], vegan: boolean, locale: string): string {
  const lang = locale === "en" ? "English" : "Turkish";
  return `The user has these ingredients: ${ingredients.join(", ")}.
Suggest 2 recipes using mainly these ingredients (pantry basics like oil/salt/spices allowed).${
    vegan ? " Make them fully vegan." : ""
  }
Recipe names, steps and ingredient names must be in ${lang}. Respond ONLY with JSON, no markdown:
{"recipes":[{"name":"recipe name in ${lang} (max 60 chars)","servings":2,"kcalPerServing":350,"steps":["step 1 (max 200 chars)","step 2","step 3"],"ingredients":[{"name":"ingredient name in ${lang} (max 60 chars)","grams":150}]}]}
Rules: exactly 2 recipes; 3-6 steps per recipe; grams between 1-2000; realistic home-cooking portions.`;
}

/**
 * POST — hızlı aşama: girdi doğrulanır, iş arka plana atanır ve hemen jobId
 * döner (insights/import/planner deseni). AI turu (2-10 sn) bağlantıyı meşgul
 * etmez; istemci GET?id= ile yoklar.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const { ingredients, locale, vegan } = parsed.data;
    const jobId = createAiJob(user.id);

    startAiJob(jobId, async () => {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: "You are a creative home cook. Output only valid JSON." },
          { role: "user", content: buildPrompt(ingredients, vegan, locale) },
        ],
        thinking: { type: "disabled" },
      });
      const content = completion.choices[0]?.message?.content ?? "";
      const raw = extractJson(content);
      const parsedOut = outSchema.safeParse(raw);
      if (!parsedOut.success) throw new ApiError("AI_PARSE", 502);

      // Normalizasyon: prompt sözleşmesine geri kırp (2 tarif, ≤6 adım, 60/200 karak)
      const recipes = parsedOut.data.recipes.slice(0, 2).map((r) => ({
        name: r.name.slice(0, 60),
        servings: r.servings,
        kcalPerServing: Math.round(r.kcalPerServing),
        steps: r.steps.slice(0, 6).map((s) => s.slice(0, 200)),
        ingredients: r.ingredients
          .slice(0, 20)
          .map((i) => ({ name: i.name.slice(0, 60), grams: Math.round(i.grams) })),
      }));
      return { recipes };
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
