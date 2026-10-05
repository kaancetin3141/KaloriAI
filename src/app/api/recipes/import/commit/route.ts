import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const editedItemSchema = z.object({
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

const schema = z.object({
  importId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  servings: z.number().int().min(1).max(20),
  // optional client-side edits (grams edit / row delete in preview)
  items: z.array(editedItemSchema).min(1).max(20).optional(),
});

const draftItemSchema = z.object({
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
  isRecipe: z.boolean(),
  name: z.string(),
  servings: z.number().int().min(1).max(20),
  items: z.array(draftItemSchema).min(1).max(20),
  notes: z.string().nullable().default(null),
});

/** POST /api/recipes/import/commit — create Foods (match-or-create) + Recipe from a stored draft */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const record = await db.aiAnalysis.findFirst({
      where: { id: parsed.data.importId, userId: user.id, itemType: "recipe_import", logged: false },
    });
    if (!record) throw new ApiError("VALIDATION", 404);

    let draft: z.infer<typeof draftSchema>;
    try {
      draft = draftSchema.parse(JSON.parse(record.rawResponse));
    } catch {
      throw new ApiError("VALIDATION", 422);
    }

    // Use client-edited items when provided, else the stored draft
    const items = parsed.data.items ?? draft.items;

    // Match existing foods by normalized name (global + user), else create AI-sourced custom food
    // NOTE: SQLite Prisma `in` is case-sensitive → fetch candidates and match in JS
    const candidates = await db.food.findMany({
      where: { deletedAt: null, OR: [{ userId: null }, { userId: user.id }] },
      select: { id: true, name: true },
    });
    const byName = new Map(candidates.map((f) => [f.name.trim().toLowerCase(), f.id]));

    const recipeItems: { foodId: string; grams: number }[] = [];
    for (const it of items) {
      const key = it.name.trim().toLowerCase();
      let foodId = byName.get(key);
      if (!foodId) {
        const g = Math.max(it.grams, 1);
        const to100 = (v: number) => Math.round((v / g) * 100 * 10) / 10;
        const food = await db.food.create({
          data: {
            name: it.name.trim(),
            source: "AI_IMPORT",
            category: "general",
            kcal100: Math.max(Math.round((it.kcal / g) * 100 * 10) / 10, 0),
            protein100: to100(it.protein),
            carb100: to100(it.carbs),
            fat100: to100(it.fat),
            fiber100: to100(it.fiber),
            sugar100: to100(it.sugar),
            sodium100: to100(it.sodium),
            satFat100: to100(it.satFat),
            userId: user.id,
          },
        });
        foodId = food.id;
      }
      recipeItems.push({ foodId, grams: Math.round(it.grams * 10) / 10 });
    }

    const recipe = await db.recipe.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        servings: parsed.data.servings,
        items: { create: recipeItems },
      },
    });

    await db.aiAnalysis.update({ where: { id: record.id }, data: { logged: true } });

    return Response.json({ ok: true, recipeId: recipe.id });
  } catch (e) {
    return errorResponse(e);
  }
}
