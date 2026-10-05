import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { waterTargetMl, localDateStr } from "@/lib/calculations";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deltaMl: z.number().int().min(-2000).max(2000),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const date = parsed.data.date || localDateStr();
    const existing = await db.waterLog.findFirst({ where: { userId: user.id, date } });
    const ml = Math.max(0, (existing?.ml ?? 0) + parsed.data.deltaMl);
    const log = existing
      ? await db.waterLog.update({ where: { id: existing.id }, data: { ml } })
      : await db.waterLog.create({ data: { userId: user.id, date, ml } });
    const profile = await db.profile.findUnique({ where: { userId: user.id } });
    return Response.json({ ok: true, waterMl: log.ml, target: waterTargetMl(profile?.weightKg ?? null) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const date = new URL(req.url).searchParams.get("date") || localDateStr();
    const [log, profile] = await Promise.all([
      db.waterLog.findFirst({ where: { userId: user.id, date } }),
      db.profile.findUnique({ where: { userId: user.id } }),
    ]);
    return Response.json({ waterMl: log?.ml ?? 0, target: waterTargetMl(profile?.weightKg ?? null) });
  } catch (e) {
    return errorResponse(e);
  }
}
