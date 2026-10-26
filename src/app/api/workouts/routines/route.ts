/**
 * Custom routines (openGym-style weekly plan). Starter templates are client-side
 * (routine-templates.ts); saved copies live here.
 * GET → list, POST → create, DELETE ?id= → delete own routine.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { EXERCISE_MAP } from "@/lib/exercise-catalog";

const itemSchema = z.object({
  exerciseKey: z.string().min(1).max(60),
  sets: z.number().int().min(1).max(10),
  reps: z.string().min(1).max(12),
  restSec: z.number().int().min(0).max(900),
});

const daySchema = z.object({
  day: z.number().int().min(1).max(7),
  title: z.string().max(60),
  items: z.array(itemSchema).min(1).max(15),
});

const postSchema = z.object({
  name: z.string().min(1).max(60),
  notes: z.string().max(300).optional().nullable(),
  days: z.array(daySchema).min(1).max(7),
});

export async function GET() {
  try {
    const user = await requireUser();
    const routines = await db.routine.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    return Response.json({
      routines: routines.map((r) => ({
        id: r.id,
        name: r.name,
        notes: r.notes,
        days: safeDays(r.daysJson),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

function safeDays(json: string) {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((d) => d && typeof d === "object" && Array.isArray(d.items))
      .map((d) => ({
        day: Math.max(1, Math.min(7, Math.round(Number(d.day) || 1))),
        title: String(d.title ?? "").slice(0, 60),
        items: d.items
          .filter((i: unknown) => i && typeof i === "object")
          .slice(0, 15)
          .map((i: { exerciseKey?: unknown; sets?: unknown; reps?: unknown; restSec?: unknown }) => ({
            exerciseKey: String(i.exerciseKey ?? "").slice(0, 60),
            sets: Math.max(1, Math.min(10, Math.round(Number(i.sets) || 3))),
            reps: String(i.reps ?? "").slice(0, 12),
            restSec: Math.max(0, Math.min(900, Math.round(Number(i.restSec) || 90))),
          })),
      }));
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const rl = checkRateLimit(`routine:${user.id}:${clientIp(req)}`, 20, 60_000);
    if (!rl.allowed) throw new ApiError("RATE_LIMITED", 429);
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const data = parsed.data;
    // exerciseKeys must exist in the catalog (garbage keys rejected)
    for (const day of data.days) {
      for (const item of day.items) {
        if (!EXERCISE_MAP[item.exerciseKey]) throw new ApiError("VALIDATION", 400);
      }
    }
    const routine = await db.routine.create({
      data: {
        userId: user.id,
        name: data.name,
        notes: data.notes ?? null,
        daysJson: JSON.stringify(data.days),
      },
    });
    return Response.json(
      {
        ok: true,
        routine: {
          id: routine.id,
          name: routine.name,
          notes: routine.notes,
          days: safeDays(routine.daysJson),
          updatedAt: routine.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("VALIDATION", 400);
    const existing = await db.routine.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new ApiError("NOT_FOUND", 404);
    await db.routine.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
