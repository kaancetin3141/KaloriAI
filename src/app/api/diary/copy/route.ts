import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

const schema = z.object({
  mode: z.enum(["meal", "day"]),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snacks"]).optional(),
});

/**
 * POST /api/diary/copy — bir öğünü ya da bütün günü başka bir tarihe kopyalar.
 * (Defter diyaloğu varsayılanı "yarın"a kopyalamadır → gelecek hedef serbest.)
 *
 * Korumalar:
 * - Kaynak = hedef reddedilir (kendine kopyalama anlamsız çiftleme yaratır).
 * - Tek istekte makul üst sınır: 100 öğe (deli girdi / yanlış hedef koruması).
 *
 * Kaynakta kayıt yoksa 404 NOT_FOUND döner; istemci bunu dostça "kaynak boş"
 * bilgisi olarak gösterir. Yanıt: { ok, count: öğün sayısı, items: öğe sayısı }.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const { mode, sourceDate, targetDate, mealType } = parsed.data;

    if (sourceDate === targetDate) throw new ApiError("VALIDATION", 400);

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

    // Deli girdi koruması: tek seferde makul üst sınır
    const totalItems = logs.reduce((a, l) => a + l.items.length, 0);
    if (totalItems > 100) throw new ApiError("VALIDATION", 400);

    const created = await db.$transaction(
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
    return Response.json({ ok: true, count: created.length, items: totalItems });
  } catch (e) {
    return errorResponse(e);
  }
}
