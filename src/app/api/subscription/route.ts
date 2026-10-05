import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const sub = await db.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, tier: "free" },
      update: {},
    });
    return Response.json({ subscription: sub });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  action: z.enum(["start_trial", "subscribe", "cancel"]),
  plan: z.enum(["monthly", "yearly"]).optional(),
});

/** POST — RevenueCat simülasyonu */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const now = new Date();
    let sub = await db.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, tier: "free" },
      update: {},
    });
    switch (parsed.data.action) {
      case "start_trial":
        if (sub.trialEndsAt && sub.trialEndsAt > now) throw new ApiError("TRIAL_USED", 409);
        sub = await db.subscription.update({
          where: { userId: user.id },
          data: { tier: "premium", trialEndsAt: new Date(now.getTime() + 7 * 864e5), cancelledAt: null },
        });
        break;
      case "subscribe": {
        const months = parsed.data.plan === "yearly" ? 12 : 1;
        sub = await db.subscription.update({
          where: { userId: user.id },
          data: { tier: "premium", renewsAt: new Date(now.getTime() + months * 30 * 864e5), cancelledAt: null },
        });
        break;
      }
      case "cancel":
        sub = await db.subscription.update({
          where: { userId: user.id },
          data: { tier: "free", cancelledAt: now },
        });
        break;
    }
    return Response.json({ ok: true, subscription: sub });
  } catch (e) {
    return errorResponse(e);
  }
}
