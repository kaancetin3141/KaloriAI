import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

const SELECT_FULL = {
  id: true,
  name: true,
  brand: true,
  source: true,
  kcal100: true,
  protein100: true,
  carb100: true,
  fat100: true,
  fiber100: true,
  sugar100: true,
  sodium100: true,
  satFat100: true,
  createdAt: true,
} as const;

/** GET /api/foods/custom — user's own foods (created + AI imported) */
export async function GET() {
  try {
    const user = await requireUser();
    const foods = await db.food.findMany({
      where: { userId: user.id, deletedAt: null, source: { in: ["CUSTOM", "AI_IMPORT"] } },
      select: SELECT_FULL,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return Response.json({ foods });
  } catch (e) {
    return errorResponse(e);
  }
}

const deleteSchema = z.object({ id: z.string().min(1).max(64) });

/** DELETE /api/foods/custom?id=... — soft delete one of the user's own foods */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const parsed = deleteSchema.safeParse({ id: new URL(req.url).searchParams.get("id") ?? "" });
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const food = await db.food.findFirst({
      where: { id: parsed.data.id, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!food) throw new ApiError("VALIDATION", 404);

    await db.food.update({ where: { id: parsed.data.id }, data: { deletedAt: new Date() } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

const patchSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  kcal100: z.number().min(0).max(900).optional(),
  protein100: z.number().min(0).max(100).optional(),
  carb100: z.number().min(0).max(100).optional(),
  fat100: z.number().min(0).max(100).optional(),
  fiber100: z.number().min(0).max(100).optional(),
  sugar100: z.number().min(0).max(100).optional(),
  sodium100: z.number().min(0).max(10000).optional(),
  satFat100: z.number().min(0).max(100).optional(),
});

/** PATCH /api/foods/custom — fix name/nutrition of one of the user's own foods (CUSTOM + AI_IMPORT) */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const existing = await db.food.findFirst({
      where: { id: parsed.data.id, userId: user.id, deletedAt: null, source: { in: ["CUSTOM", "AI_IMPORT"] } },
      select: { id: true },
    });
    if (!existing) throw new ApiError("VALIDATION", 404);

    const { id, ...data } = parsed.data;
    // brand: "" → null normalization
    if (data.brand === "") data.brand = null;
    // at least one editable field required
    if (Object.keys(data).length === 0) throw new ApiError("VALIDATION", 400);
    // name can't become empty after trim
    if (data.name !== undefined && data.name.length === 0) throw new ApiError("VALIDATION", 400);

    const food = await db.food.update({
      where: { id },
      data,
      select: SELECT_FULL,
    });
    return Response.json({ ok: true, food });
  } catch (e) {
    return errorResponse(e);
  }
}
