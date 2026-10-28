import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { appToday } from "@/lib/tz";
import { waterTargetMl } from "@/lib/calculations";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deltaMl: z.number().int().min(-2000).max(2000),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const date = parsed.data.date || appToday();
    // Atomic upsert + increment: iki eşzamanlı "+250 ml" dokunuşu 500 ml olur,
    // kayıp güncelleme olmaz (eski find→update/create deseni yarış kaybediyordu).
    await db.waterLog.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date, ml: Math.max(0, parsed.data.deltaMl) },
      update: { ml: { increment: parsed.data.deltaMl } },
    });
    // negatif delta toplamı 0'ın altına düşürdüyse kelepçele (koşullu, yarış güvenli)
    await db.waterLog.updateMany({
      where: { userId: user.id, date, ml: { lt: 0 } },
      data: { ml: 0 },
    });
    const [row, profile] = await Promise.all([
      db.waterLog.findUnique({ where: { userId_date: { userId: user.id, date } } }),
      db.profile.findUnique({ where: { userId: user.id } }),
    ]);
    return Response.json({ ok: true, waterMl: row?.ml ?? 0, target: waterTargetMl(profile?.weightKg ?? null) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const date = new URL(req.url).searchParams.get("date") || appToday();
    const [log, profile] = await Promise.all([
      db.waterLog.findFirst({ where: { userId: user.id, date } }),
      db.profile.findUnique({ where: { userId: user.id } }),
    ]);
    return Response.json({ waterMl: log?.ml ?? 0, target: waterTargetMl(profile?.weightKg ?? null) });
  } catch (e) {
    return errorResponse(e);
  }
}
