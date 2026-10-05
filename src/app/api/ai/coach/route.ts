import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { localDateStr } from "@/lib/calculations";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  message: z.string().min(1).max(1000),
  locale: z.enum(["tr", "en"]).default("tr"),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const today = localDateStr();
    const [targets, logs, history] = await Promise.all([
      db.targets.findUnique({ where: { userId: user.id } }),
      db.mealLog.findMany({
        where: { userId: user.id, date: today, deletedAt: null, isTemplate: false },
        include: { items: true },
      }),
      db.aiChatMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    ]);
    const eatenKcal = Math.round(logs.reduce((a, l) => a + l.items.reduce((s, i) => s + i.kcal, 0), 0));
    const eatenP = Math.round(logs.reduce((a, l) => a + l.items.reduce((s, i) => s + i.protein, 0), 0));
    const lang = parsed.data.locale === "en" ? "English" : "Turkish";

    const context = `User context: daily target ${targets?.calories ?? "?"} kcal, protein ${targets?.protein ?? "?"}g. Today so far: ${eatenKcal} kcal, ${eatenP}g protein. User type: ${targets ? "active" : "new"}.`;

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a friendly nutrition coach inside a calorie tracking app. Reply in ${lang}, max 3 short sentences. Be concrete and practical (suggest actual foods with portions). No medical advice, no weight-shaming. ${context}`,
        },
        ...history
          .reverse()
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: parsed.data.message },
      ],
      thinking: { type: "disabled" },
    });
    const reply = completion.choices[0]?.message?.content?.trim() || "…";
    await db.aiChatMessage.createMany({
      data: [
        { userId: user.id, role: "user", content: parsed.data.message },
        { userId: user.id, role: "assistant", content: reply },
      ],
    });
    return Response.json({ ok: true, reply });
  } catch (e) {
    return errorResponse(e);
  }
}
