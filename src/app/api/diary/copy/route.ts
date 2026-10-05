import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

const schema = z.object({
  mode: z.enum(["meal", "day"]),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snacks"]).optional(),
});

/** POST /api/diary/copy — copy a meal or whole day to another date */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const { mode, sourceDate, targetDate, mealType } = parsed.data;

    const logs = await db.mealLog.findMany({
      where: {
        userId: user.id,
        date: sourceDate,
        deletedAt: null,
        isTemplate: false,
        ...(mode === "meal" && mealType ? { mealType } : {}),
      },
      include: { items: true },
    });
    if (!logs.length) throw new ApiError("NOT_FOUND", 404);

    const created = await Promise.all(
      logs.map((log) =>
        db.mealLog.create({
          data: {
            userId: user.id,
            date: targetDate,
            mealType: log.mealType,
            name: log.name,
            items: {
              create: log.items.map((i) => ({
                foodId: i.foodId,
                name: i.name,
                grams: i.grams,
                kcal: i.kcal,
                protein: i.protein,
                carbs: i.carbs,
                fat: i.fat,
                fiber: i.fiber,
                sugar: i.sugar ?? 0,
                sodium: i.sodium ?? 0,
                satFat: i.satFat ?? 0,
                source: i.source,
              })),
            },
          },
        })
      )
    );
    return Response.json({ ok: true, count: created.length });
  } catch (e) {
    return errorResponse(e);
  }
}
