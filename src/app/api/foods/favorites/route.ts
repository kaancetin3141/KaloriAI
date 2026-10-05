import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const favorites = await db.favorite.findMany({
      where: { userId: user.id },
      include: { food: { include: { servings: true } } },
      orderBy: { createdAt: "desc" },
    });
    const frequent = await db.frequentFood.findMany({
      where: { userId: user.id, food: { deletedAt: null } },
      include: { food: { include: { servings: true } } },
      orderBy: [{ count: "desc" }, { lastUsed: "desc" }],
      take: 12,
    });
    return Response.json({
      favorites: favorites.filter((f) => !f.food.deletedAt).map((f) => ({ ...f.food, isFavorite: true })),
      frequent: frequent.map((f) => ({ ...f.food, isFavorite: false })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST toggle favorite */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { foodId } = (await req.json()) as { foodId?: string };
    if (!foodId) throw new ApiError("VALIDATION", 400);
    const existing = await db.favorite.findUnique({
      where: { userId_foodId: { userId: user.id, foodId } },
    });
    if (existing) {
      await db.favorite.delete({ where: { id: existing.id } });
      return Response.json({ ok: true, isFavorite: false });
    }
    await db.favorite.create({ data: { userId: user.id, foodId } });
    return Response.json({ ok: true, isFavorite: true });
  } catch (e) {
    return errorResponse(e);
  }
}
