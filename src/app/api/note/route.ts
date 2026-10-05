import { z } from "zod";
import { db } from "@/lib/db";
import { localDateStr } from "@/lib/calculations";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

export const runtime = "nodejs";

const MOODS = ["great", "good", "okay", "low", "bad"] as const;

const dateQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const upsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mood: z.enum(MOODS).nullable().optional(),
  text: z.string().max(2000).nullable().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const dateQ = dateQuery.safeParse(url.searchParams.get("date") ?? undefined);
    const date = dateQ.success ? dateQ.data || localDateStr() : localDateStr();
    const note = await db.dailyNote.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    return Response.json({ ok: true, note });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = upsertSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const date = parsed.data.date || localDateStr();
    const mood = parsed.data.mood ?? null;
    const text = parsed.data.text?.trim() ? parsed.data.text.trim() : null;
    if (mood === null && text === null) {
      // both cleared → delete the note
      await db.dailyNote.deleteMany({ where: { userId: user.id, date } });
      return Response.json({ ok: true, note: null });
    }
    const note = await db.dailyNote.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date, mood, text },
      update: { mood, text },
    });
    return Response.json({ ok: true, note });
  } catch (e) {
    return errorResponse(e);
  }
}
