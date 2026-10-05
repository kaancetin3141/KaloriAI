import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1).max(120),
  brand: z.string().max(80).optional().nullable(),
  category: z.string().max(40).default("general"),
  kcal100: z.number().min(0).max(900),
  protein100: z.number().min(0).max(100).default(0),
  carb100: z.number().min(0).max(100).default(0),
  fat100: z.number().min(0).max(100).default(0),
  fiber100: z.number().min(0).max(100).default(0),
  sugar100: z.number().min(0).max(100).default(0),
  sodium100: z.number().min(0).max(10000).default(0),
  satFat100: z.number().min(0).max(100).default(0),
  servings: z
    .array(z.object({ label: z.string().min(1).max(40), grams: z.number().min(1).max(2000) }))
    .max(5)
    .optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const { servings, ...data } = parsed.data;
    const food = await db.food.create({
      data: {
        ...data,
        source: "CUSTOM",
        userId: user.id,
        servings: servings?.length ? { create: servings } : undefined,
      },
      include: { servings: true },
    });
    return Response.json({ food });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const foods = await db.food.findMany({
      where: { userId: user.id, source: "CUSTOM", deletedAt: null },
      include: { servings: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ foods });
  } catch (e) {
    return errorResponse(e);
  }
}
