import { z } from "zod";
import { db } from "@/lib/db";
import { localDateStr } from "@/lib/calculations";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weightKg: z.number().min(25).max(400).optional().nullable(),
  bodyFatPct: z.number().min(3).max(60).optional().nullable(),
  waistCm: z.number().min(30).max(200).optional().nullable(),
  armCm: z.number().min(10).max(80).optional().nullable(),
  chestCm: z.number().min(40).max(200).optional().nullable(),
  hipCm: z.number().min(40).max(200).optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const measurements = await db.bodyMeasurement.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
      take: 365,
    });
    return Response.json({ measurements });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const date = parsed.data.date || localDateStr();
    // upsert on (userId, date): aynı güne ikinci POST çoğaltma değil GÜNCELLEME yapar;
    // gönderilmeyen alanlar eski değeri korur (undefined → Prisma dokunmaz), explicit null temizler.
    const existing = await db.bodyMeasurement.findFirst({ where: { userId: user.id, date } });
    const m = existing
      ? await db.bodyMeasurement.update({ where: { id: existing.id }, data: parsed.data })
      : await db.bodyMeasurement
          .create({ data: { userId: user.id, date, ...parsed.data } })
          .catch(async (e: unknown) => {
            // eşzamanlı çift create'te @@unique([userId, date]) devreye girer → güncellemeye düş
            if ((e as { code?: string })?.code === "P2002") {
              const dupe = await db.bodyMeasurement.findFirst({ where: { userId: user.id, date } });
              if (dupe) return db.bodyMeasurement.update({ where: { id: dupe.id }, data: parsed.data });
            }
            throw e;
          });
    // keep profile weight fresh
    if (parsed.data.weightKg != null) {
      await db.profile.update({ where: { userId: user.id }, data: { weightKg: parsed.data.weightKg } });
    }
    return Response.json({ ok: true, measurement: m });
  } catch (e) {
    return errorResponse(e);
  }
}
