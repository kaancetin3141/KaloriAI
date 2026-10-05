import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

/** GET /api/fasting — active fast + last 7 completed fasts + stats */
export async function GET() {
  try {
    const user = await requireUser();
    const [active, history] = await Promise.all([
      db.fastingLog.findFirst({ where: { userId: user.id, endAt: null }, orderBy: { startAt: "desc" } }),
      db.fastingLog.findMany({
        where: { userId: user.id, endAt: { not: null } },
        orderBy: { startAt: "desc" },
        take: 7,
      }),
    ]);
    const completedHours = history.reduce((a, f) => {
      const h = f.endAt ? (f.endAt.getTime() - f.startAt.getTime()) / 3600000 : 0;
      return a + h;
    }, 0);
    return Response.json({
      active,
      history: history.map((f) => ({
        id: f.id,
        startAt: f.startAt.toISOString(),
        endAt: f.endAt?.toISOString() ?? null,
        targetHours: f.targetHours,
        durationHours: f.endAt ? Math.round(((f.endAt.getTime() - f.startAt.getTime()) / 3600000) * 10) / 10 : null,
      })),
      stats: { completedCount: history.length, totalHours: Math.round(completedHours * 10) / 10 },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  action: z.enum(["start", "stop"]),
  targetHours: z.number().int().min(10).max(24).optional(),
});

/** POST /api/fasting — start (targetHours preset) or stop active fast */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    if (parsed.data.action === "start") {
      const existing = await db.fastingLog.findFirst({ where: { userId: user.id, endAt: null } });
      if (existing) throw new ApiError("FASTING_ACTIVE", 409);
      const log = await db.fastingLog.create({
        data: {
          userId: user.id,
          startAt: new Date(),
          targetHours: parsed.data.targetHours ?? 16,
        },
      });
      return Response.json({ ok: true, active: log });
    }

    const active = await db.fastingLog.findFirst({ where: { userId: user.id, endAt: null }, orderBy: { startAt: "desc" } });
    if (!active) throw new ApiError("NO_ACTIVE_FAST", 404);
    const endAt = new Date();
    const log = await db.fastingLog.update({ where: { id: active.id }, data: { endAt } });
    return Response.json({
      ok: true,
      log: { ...log, durationHours: Math.round(((endAt.getTime() - log.startAt.getTime()) / 3600000) * 10) / 10 },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
