import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

const querySchema = z.object({
  before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snacks"]),
});

/**
 * GET /api/diary/last?before=YYYY-MM-DD&mealType=breakfast
 * Returns the most recent day this meal was logged strictly before `before`
 * (any date, not just yesterday), with an item summary for the repeat chip.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const parsed = querySchema.safeParse({
      before: new URL(req.url).searchParams.get("before") ?? "",
      mealType: new URL(req.url).searchParams.get("mealType") ?? "",
    });
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const { before, mealType } = parsed.data;

    const logs = await db.mealLog.findMany({
      where: {
        userId: user.id,
        date: { lt: before },
        mealType,
        isTemplate: false,
        deletedAt: null,
      },
      include: { items: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 4,
    });

    // prefer the latest date that actually has items
    const withItems = logs.find((l) => l.items.length > 0);
    if (!withItems) return Response.json({ last: null });

    const kcal = Math.round(withItems.items.reduce((a, i) => a + i.kcal, 0));
    return Response.json({
      last: {
        date: withItems.date,
        kcal,
        itemCount: withItems.items.length,
        items: withItems.items.slice(0, 4).map((i) => ({ name: i.name, grams: i.grams, kcal: Math.round(i.kcal) })),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
