import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { localDateStr, localDaysAgoStr, workoutCalories, metForIntensity } from "@/lib/calculations";

const BASE_METS: Record<string, number> = {
  running: 9.8,
  cycling: 7.5,
  swimming: 8.3,
  walking: 3.5,
  strength: 6.0,
  football: 8.5,
  basketball: 8.0,
  hiit: 8.0,
  yoga: 3.0,
  other: 5.0,
};

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.enum(["running", "cycling", "swimming", "walking", "strength", "football", "basketball", "hiit", "yoga", "other"]),
  name: z.string().max(80).optional().nullable(),
  durationMin: z.number().int().min(1).max(600),
  intensity: z.enum(["light", "moderate", "vigorous"]).default("moderate"),
  calories: z.number().int().min(0).max(5000).optional().nullable(),
  addToTarget: z.boolean().default(false),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || localDateStr();
    const range = url.searchParams.get("range");
    const where = range === "week"
      ? { userId: user.id, date: { gte: localDaysAgoStr(6) } }
      : { userId: user.id, date };
    const workouts = await db.workout.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    return Response.json({ workouts });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const profile = await db.profile.findUnique({ where: { userId: user.id } });
    const weight = profile?.weightKg ?? 70;
    const met = metForIntensity(BASE_METS[parsed.data.type] ?? 5, parsed.data.intensity);
    const calories =
      parsed.data.calories != null && parsed.data.calories > 0
        ? parsed.data.calories
        : workoutCalories(met, weight, parsed.data.durationMin);
    const workout = await db.workout.create({
      data: {
        userId: user.id,
        date: parsed.data.date || localDateStr(),
        type: parsed.data.type,
        name: parsed.data.name ?? null,
        durationMin: parsed.data.durationMin,
        intensity: parsed.data.intensity,
        met,
        calories,
        addedToTarget: parsed.data.addToTarget,
      },
    });
    return Response.json({ ok: true, workout });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("VALIDATION", 400);
    await db.workout.deleteMany({ where: { id, userId: user.id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
