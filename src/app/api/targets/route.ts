import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { CALORIE_FLOOR } from "@/lib/calculations";

const patchSchema = z.object({
  calories: z.number().int().min(800).max(6000).optional(),
  protein: z.number().int().min(20).max(400).optional(),
  carbs: z.number().int().min(20).max(800).optional(),
  fat: z.number().int().min(15).max(300).optional(),
  adaptiveEnabled: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const targets = await db.targets.findUnique({ where: { userId: user.id } });
    const profile = await db.profile.findUnique({ where: { userId: user.id } });
    return Response.json({ targets, profile });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const profile = await db.profile.findUnique({ where: { userId: user.id } });
    // disordered-eating guard
    if (parsed.data.calories != null && profile?.sex) {
      const floor = CALORIE_FLOOR[profile.sex === "female" ? "female" : "male"];
      if (parsed.data.calories < floor) {
        throw new ApiError("CALORIE_FLOOR", 400);
      }
    }
    const targets = await db.targets.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        calories: parsed.data.calories ?? 2000,
        protein: parsed.data.protein ?? 100,
        carbs: parsed.data.carbs ?? 220,
        fat: parsed.data.fat ?? 65,
        ...parsed.data,
        manuallyOverridden: true,
      },
      update: { ...parsed.data, manuallyOverridden: true },
    });
    return Response.json({ ok: true, targets });
  } catch (e) {
    return errorResponse(e);
  }
}
