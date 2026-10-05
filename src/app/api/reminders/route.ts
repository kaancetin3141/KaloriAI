import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const reminders = await db.reminder.findMany({
      where: { userId: user.id },
      orderBy: { time: "asc" },
    });
    return Response.json({ reminders });
  } catch (e) {
    return errorResponse(e);
  }
}

const upsertSchema = z.object({
  type: z.enum(["breakfast", "lunch", "dinner", "water", "weigh_in", "workout"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  enabled: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = upsertSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const existing = await db.reminder.findFirst({
      where: { userId: user.id, type: parsed.data.type },
    });
    const reminder = existing
      ? await db.reminder.update({ where: { id: existing.id }, data: parsed.data })
      : await db.reminder.create({ data: { userId: user.id, ...parsed.data } });
    return Response.json({ ok: true, reminder });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("VALIDATION", 400);
    await db.reminder.deleteMany({ where: { id, userId: user.id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
