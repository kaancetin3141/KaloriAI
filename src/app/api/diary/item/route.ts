import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

const patchSchema = z.object({
  grams: z.number().min(0.1).max(5000).optional(),
  kcal: z.number().min(0).max(10000).optional(),
  protein: z.number().min(0).max(1000).optional(),
  carbs: z.number().min(0).max(1000).optional(),
  fat: z.number().min(0).max(1000).optional(),
});

/** PATCH /api/diary/item — edit grams (scales macros) or explicit values */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const id = body.id as string;
    if (!id) throw new ApiError("VALIDATION", 400);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const item = await db.mealLogItem.findFirst({
      where: { id, log: { userId: user.id } },
      include: { log: true },
    });
    if (!item) throw new ApiError("NOT_FOUND", 404);

    const data: Record<string, number> = {};
    if (parsed.data.grams != null && item.grams > 0) {
      const scale = parsed.data.grams / item.grams;
      data.grams = parsed.data.grams;
      data.kcal = Math.round(item.kcal * scale * 10) / 10;
      data.protein = Math.round(item.protein * scale * 10) / 10;
      data.carbs = Math.round(item.carbs * scale * 10) / 10;
      data.fat = Math.round(item.fat * scale * 10) / 10;
      data.fiber = Math.round((item.fiber ?? 0) * scale * 10) / 10;
      data.sugar = Math.round((item.sugar ?? 0) * scale * 10) / 10;
      data.sodium = Math.round((item.sodium ?? 0) * scale * 10) / 10;
      data.satFat = Math.round((item.satFat ?? 0) * scale * 10) / 10;
    }
    for (const [k, v] of Object.entries(parsed.data)) {
      if (k !== "grams" && v != null) data[k] = v;
    }
    const updated = await db.mealLogItem.update({ where: { id }, data });
    return Response.json({ ok: true, item: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/diary/item?id=... */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("VALIDATION", 400);
    const item = await db.mealLogItem.findFirst({
      where: { id, log: { userId: user.id } },
    });
    if (!item) throw new ApiError("NOT_FOUND", 404);
    await db.mealLogItem.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
