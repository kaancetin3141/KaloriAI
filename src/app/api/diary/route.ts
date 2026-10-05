import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { localDateStr } from "@/lib/calculations";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function todayStr(): string {
  return localDateStr();
}

/** GET /api/diary?date=YYYY-MM-DD — full day view */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const date = new URL(req.url).searchParams.get("date") || todayStr();
    if (!dateRe.test(date)) throw new ApiError("VALIDATION", 400);

    const [logs, targets, water, workouts, profile, templates] = await Promise.all([
      db.mealLog.findMany({
        where: { userId: user.id, date, deletedAt: null, isTemplate: false },
        include: { items: { include: { food: { include: { servings: true } } } } },
        orderBy: { createdAt: "asc" },
      }),
      db.targets.findUnique({ where: { userId: user.id } }),
      db.waterLog.findFirst({ where: { userId: user.id, date } }),
      db.workout.findMany({ where: { userId: user.id, date } }),
      db.profile.findUnique({ where: { userId: user.id } }),
      db.mealLog.findMany({
        where: { userId: user.id, isTemplate: true, deletedAt: null },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    const totals = logs.reduce(
      (acc, log) => {
        for (const item of log.items) {
          acc.kcal += item.kcal;
          acc.protein += item.protein;
          acc.carbs += item.carbs;
          acc.fat += item.fat;
          acc.fiber += item.fiber;
          acc.sugar += item.sugar ?? 0;
          acc.sodium += item.sodium ?? 0;
          acc.satFat += item.satFat ?? 0;
        }
        return acc;
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satFat: 0 }
    );
    const burned = workouts.reduce((a, w) => a + w.calories, 0);
    const addedBurned = workouts.filter((w) => w.addedToTarget).reduce((a, w) => a + w.calories, 0);

    return Response.json({
      date,
      logs,
      totals: {
        kcal: Math.round(totals.kcal),
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat),
        fiber: Math.round(totals.fiber),
        sugar: Math.round(totals.sugar),
        sodium: Math.round(totals.sodium),
        satFat: Math.round(totals.satFat),
      },
      targets,
      burned,
      addedBurned,
      waterMl: water?.ml ?? 0,
      workouts,
      profile,
      templates,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const itemSchema = z.object({
  foodId: z.string().optional().nullable(),
  name: z.string().min(1).max(150),
  grams: z.number().min(0.1).max(5000),
  kcal: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000).default(0),
  carbs: z.number().min(0).max(1000).default(0),
  fat: z.number().min(0).max(1000).default(0),
  fiber: z.number().min(0).max(500).default(0),
  sugar: z.number().min(0).max(500).default(0),
  sodium: z.number().min(0).max(20000).default(0),
  satFat: z.number().min(0).max(500).default(0),
  source: z.enum(["manual", "ai", "barcode", "recipe", "quick_add"]).default("manual"),
});

const postSchema = z
  .object({
    date: z.string().regex(dateRe).default(todayStr()),
    mealType: z.enum(["breakfast", "lunch", "dinner", "snacks"]),
    items: z.array(itemSchema).max(30).optional(),
    aiAnalysisId: z.string().optional().nullable(),
    quickAddKcal: z.number().min(1).max(5000).optional(),
  })
  .refine((d) => d.quickAddKcal != null || (d.items && d.items.length > 0), {
    message: "ITEMS_REQUIRED",
  });

/** POST /api/diary — add a meal (quick_add uses items=[{name:'Hızlı ekleme', kcal}]) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const { date, mealType, items, aiAnalysisId, quickAddKcal } = parsed.data;

    const log = await db.mealLog.create({
      data: {
        userId: user.id,
        date,
        mealType,
        name: quickAddKcal ? "Hızlı ekleme" : null,
        items: {
          create: quickAddKcal
            ? [{ name: "Hızlı ekleme", grams: 0, kcal: quickAddKcal, protein: 0, carbs: 0, fat: 0, source: "quick_add" }]
            : items,
        },
      },
      include: { items: true },
    });

    // track frequent foods + mark ai analysis logged
    const ops: Promise<unknown>[] = [];
    if (aiAnalysisId) {
      ops.push(db.aiAnalysis.update({ where: { id: aiAnalysisId }, data: { logged: true, corrected: true } }).catch(() => {}));
    }
    for (const item of items ?? []) {
      if (item.foodId && !item.foodId.startsWith("off_")) {
        ops.push(
          db.frequentFood
            .upsert({
              where: { userId_foodId: { userId: user.id, foodId: item.foodId } },
              create: { userId: user.id, foodId: item.foodId, count: 1 },
              update: { count: { increment: 1 }, lastUsed: new Date() },
            })
            .catch(() => {})
        );
      }
    }
    await Promise.all(ops);
    return Response.json({ ok: true, log });
  } catch (e) {
    return errorResponse(e);
  }
}
