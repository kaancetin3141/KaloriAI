import { z } from "zod";
import { db } from "@/lib/db";
import { localDateStr } from "@/lib/calculations";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

const saveSchema = z.object({
  logId: z.string(),
  name: z.string().min(1).max(80),
});

/** POST /api/diary/template — save a meal log as reusable template */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = saveSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const log = await db.mealLog.findFirst({
      where: { id: parsed.data.logId, userId: user.id, deletedAt: null },
      include: { items: true },
    });
    if (!log) throw new ApiError("NOT_FOUND", 404);
    const template = await db.mealLog.create({
      data: {
        userId: user.id,
        date: localDateStr(),
        mealType: log.mealType,
        name: parsed.data.name,
        isTemplate: true,
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
      include: { items: true },
    });
    return Response.json({ ok: true, template });
  } catch (e) {
    return errorResponse(e);
  }
}

const applySchema = z.object({
  templateId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** PUT /api/diary/template — apply template to a date */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const parsed = applySchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const template = await db.mealLog.findFirst({
      where: { id: parsed.data.templateId, userId: user.id, isTemplate: true },
      include: { items: true },
    });
    if (!template) throw new ApiError("NOT_FOUND", 404);
    const log = await db.mealLog.create({
      data: {
        userId: user.id,
        date: parsed.data.date,
        mealType: template.mealType,
        name: template.name,
        items: {
          create: template.items.map((i) => ({
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
    });
    return Response.json({ ok: true, log });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/diary/template?id=... */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("VALIDATION", 400);
    await db.mealLog.updateMany({ where: { id, userId: user.id, isTemplate: true }, data: { deletedAt: new Date() } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
