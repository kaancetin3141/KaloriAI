import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

/** GET /api/recipes — user recipes with per-serving macros (computed from foods) */
export async function GET() {
  try {
    const user = await requireUser();
    const recipes = await db.recipe.findMany({
      where: { userId: user.id, deletedAt: null },
      include: { items: { include: { food: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const mapped = recipes.map((r) => {
      const totals = r.items.reduce(
        (acc, it) => {
          const f = it.food;
          acc.kcal += ((f?.kcal100 ?? 0) * it.grams) / 100;
          acc.protein += ((f?.protein100 ?? 0) * it.grams) / 100;
          acc.carbs += ((f?.carb100 ?? 0) * it.grams) / 100;
          acc.fat += ((f?.fat100 ?? 0) * it.grams) / 100;
          acc.fiber += ((f?.fiber100 ?? 0) * it.grams) / 100;
          acc.sugar += ((f?.sugar100 ?? 0) * it.grams) / 100;
          acc.sodium += ((f?.sodium100 ?? 0) * it.grams) / 100;
          acc.satFat += ((f?.satFat100 ?? 0) * it.grams) / 100;
          return acc;
        },
        { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satFat: 0 }
      );
      const servings = Math.max(r.servings, 1);
      return {
        id: r.id,
        name: r.name,
        servings,
        items: r.items.map((it) => ({
          foodId: it.foodId,
          name: it.food?.name ?? "?",
          grams: it.grams,
          kcal100: it.food?.kcal100 ?? 0,
          protein100: it.food?.protein100 ?? 0,
          carb100: it.food?.carb100 ?? 0,
          fat100: it.food?.fat100 ?? 0,
          fiber100: it.food?.fiber100 ?? 0,
          sugar100: it.food?.sugar100 ?? 0,
          sodium100: it.food?.sodium100 ?? 0,
          satFat100: it.food?.satFat100 ?? 0,
        })),
        perServing: {
          kcal: Math.round(totals.kcal / servings),
          protein: Math.round(totals.protein / servings),
          carbs: Math.round(totals.carbs / servings),
          fat: Math.round(totals.fat / servings),
          fiber: Math.round(totals.fiber / servings),
          sugar: Math.round(totals.sugar / servings),
          sodium: Math.round(totals.sodium / servings),
          satFat: Math.round(totals.satFat / servings),
        },
        total: {
          kcal: Math.round(totals.kcal),
          protein: Math.round(totals.protein),
          carbs: Math.round(totals.carbs),
          fat: Math.round(totals.fat),
          fiber: Math.round(totals.fiber),
          sugar: Math.round(totals.sugar),
          sodium: Math.round(totals.sodium),
          satFat: Math.round(totals.satFat),
        },
      };
    });
    return Response.json({ recipes: mapped });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  name: z.string().min(1).max(120),
  servings: z.number().int().min(1).max(20).default(1),
  items: z
    .array(z.object({ foodId: z.string().min(1), grams: z.number().min(1).max(3000) }))
    .min(1)
    .max(25),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    // validate foods exist & belong to user or global
    const ids = parsed.data.items.map((i) => i.foodId);
    const foods = await db.food.findMany({
      where: { id: { in: ids }, deletedAt: null, OR: [{ userId: null }, { userId: user.id }] },
      select: { id: true },
    });
    const valid = new Set(foods.map((f) => f.id));
    if (ids.some((id) => !valid.has(id))) throw new ApiError("VALIDATION", 400);

    const recipe = await db.recipe.create({
      data: {
        userId: user.id,
        name: parsed.data.name.trim(),
        servings: parsed.data.servings,
        items: { create: parsed.data.items },
      },
      include: { items: { include: { food: true } } },
    });
    return Response.json({ ok: true, recipeId: recipe.id });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("VALIDATION", 400);
    await db.recipe.updateMany({ where: { id, userId: user.id }, data: { deletedAt: new Date() } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
