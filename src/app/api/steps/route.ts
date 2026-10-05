import { z } from "zod";
import { db } from "@/lib/db";
import { localDateStr, localDaysAgoStr } from "@/lib/calculations";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

/** GET /api/steps?days=7 → daily step totals (app timezone window) */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const daysRaw = parseInt(url.searchParams.get("days") ?? "7", 10);
    const days = Math.min(Math.max(Number.isFinite(daysRaw) ? daysRaw : 7, 1), 90);
    const rows = await db.stepsLog.findMany({
      where: { userId: user.id, date: { gte: localDaysAgoStr(days - 1) } },
      orderBy: { date: "asc" },
      select: { date: true, count: true, source: true },
    });
    return Response.json({ days: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  count: z.number().int().min(0).max(200_000),
});

/** POST /api/steps { date?, count } — manual step entry (upsert by day) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const date = parsed.data.date ?? localDateStr();
    const row = await db.stepsLog.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date, count: parsed.data.count, source: "manual" },
      // manual entry replaces the day's total but keeps a health-synced source label
      update: { count: parsed.data.count },
    });
    return Response.json({ ok: true, day: { date: row.date, count: row.count, source: row.source } });
  } catch (e) {
    return errorResponse(e);
  }
}
