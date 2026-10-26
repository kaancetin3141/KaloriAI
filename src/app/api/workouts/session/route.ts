/**
 * Guided strength sessions (openGym-style set logging).
 * POST   → save full session (PR detection included)
 * GET    → list recent sessions with exercises
 * DELETE ?id= → delete a session (cascades exercises)
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { appToday, appDaysAgoStr } from "@/lib/tz";
import { workoutCalories } from "@/lib/calculations";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  parseSets,
  strengthSessionMet,
  detectPRs,
  prMetricOfSet,
  type SessionExerciseInput,
  type StrengthSessionDTO,
} from "@/lib/strength";

const setSchema = z.object({
  reps: z.number().int().min(0).max(1000),
  weightKg: z.number().min(0).max(1000),
  rir: z.number().int().min(0).max(10).optional(),
});

const exerciseSchema = z.object({
  exerciseKey: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  muscle: z.string().min(1).max(30),
  equipment: z.string().max(30).optional().nullable(),
  sets: z.array(setSchema).min(1).max(20),
});

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().max(80).optional().nullable(),
  durationMin: z.number().int().min(1).max(600),
  exercises: z.array(exerciseSchema).min(1).max(30),
  addToTarget: z.boolean().optional(),
});

function toDTO(
  w: {
    id: string;
    date: string;
    name: string | null;
    durationMin: number;
    intensity: string;
    calories: number;
    addedToTarget: boolean;
    createdAt: Date;
    exercises: {
      id: string;
      exerciseKey: string;
      name: string;
      muscle: string;
      equipment: string | null;
      setsJson: string;
    }[];
  },
): StrengthSessionDTO {
  return {
    id: w.id,
    date: w.date,
    name: w.name,
    durationMin: w.durationMin,
    intensity: w.intensity,
    calories: w.calories,
    addedToTarget: w.addedToTarget,
    createdAt: w.createdAt.toISOString(),
    exercises: w.exercises.map((e) => ({
      id: e.id,
      exerciseKey: e.exerciseKey,
      name: e.name,
      muscle: e.muscle,
      equipment: e.equipment,
      sets: parseSets(e.setsJson),
    })),
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), 50);
    const where = date
      ? { userId: user.id, date, type: "strength" }
      : { userId: user.id, type: "strength" };
    const workouts = await db.workout.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { exercises: { orderBy: { order: "asc" } } },
    });
    return Response.json({ sessions: workouts.map(toDTO) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const rl = checkRateLimit(`wsession:${user.id}:${clientIp(req)}`, 30, 60_000);
    if (!rl.allowed) throw new ApiError("RATE_LIMITED", 429);
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const data = parsed.data;

    // Date: past 365 days or today only (no future sessions)
    const date = data.date || appToday();
    if (date > appToday() || date < appDaysAgoStr(365)) throw new ApiError("VALIDATION", 400);

    const profile = await db.profile.findUnique({ where: { userId: user.id } });
    const weightKg = profile?.weightKg ?? 70;

    // Previous all-time best e1RM per exercise key → PR detection
    const keys = [...new Set(data.exercises.map((e) => e.exerciseKey))];
    const prevRows = await db.workoutExercise.findMany({
      where: { userId: user.id, exerciseKey: { in: keys } },
      select: { exerciseKey: true, setsJson: true },
    });
    const prevBestByKey: Record<string, number> = {};
    for (const row of prevRows) {
      const best = parseSets(row.setsJson).reduce((b, s) => Math.max(b, prMetricOfSet(s.weightKg, s.reps)), 0);
      prevBestByKey[row.exerciseKey] = Math.max(prevBestByKey[row.exerciseKey] ?? 0, best);
    }
    const { prs, flaggedSets } = detectPRs(data.exercises, prevBestByKey);

    const met = strengthSessionMet(data.exercises as SessionExerciseInput[]);
    const calories = workoutCalories(met, weightKg, data.durationMin);

    const workout = await db.workout.create({
      data: {
        userId: user.id,
        date,
        type: "strength",
        name: data.name ?? null,
        durationMin: data.durationMin,
        intensity: "moderate",
        met,
        calories,
        addedToTarget: data.addToTarget ?? false,
        exercises: {
          create: data.exercises.map((ex, i) => ({
            userId: user.id,
            order: i,
            exerciseKey: ex.exerciseKey,
            name: ex.name,
            muscle: ex.muscle,
            equipment: ex.equipment ?? null,
            setsJson: JSON.stringify(
              ex.sets.map((s, si) => ({
                reps: s.reps,
                weightKg: Math.round(s.weightKg * 10) / 10,
                ...(s.rir != null ? { rir: s.rir } : {}),
                ...(flaggedSets[ex.exerciseKey]?.[si] ? { pr: true } : {}),
              })),
            ),
          })),
        },
      },
      include: { exercises: { orderBy: { order: "asc" } } },
    });

    return Response.json({ ok: true, session: toDTO(workout), prs }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("VALIDATION", 400);
    // Ownership-checked delete (IDOR-safe)
    const existing = await db.workout.findFirst({ where: { id, userId: user.id, type: "strength" } });
    if (!existing) throw new ApiError("NOT_FOUND", 404);
    await db.workout.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
