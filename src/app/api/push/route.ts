import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { getVapidPublicKey, sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

/** GET /api/push — VAPID public key + this user's endpoint count */
export async function GET() {
  try {
    await requireUser();
    return Response.json({
      publicKey: getVapidPublicKey(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
  userAgent: z.string().max(300).optional().nullable(),
});

/** POST /api/push — subscribe (upsert) this browser's push endpoint */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = subscribeSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    if (!getVapidPublicKey()) throw new ApiError("PUSH_NOT_CONFIGURED", 503);

    await db.pushEndpoint.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: {
        userId: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: parsed.data.userAgent ?? null,
      },
      update: {
        userId: user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/push?endpoint=... — unsubscribe a browser */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const endpoint = new URL(req.url).searchParams.get("endpoint") ?? "";
    if (endpoint.length < 10) throw new ApiError("VALIDATION", 400);
    await db.pushEndpoint.deleteMany({ where: { endpoint, userId: user.id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/push/test — send a test notification to all of the user's endpoints */
export async function PUT() {
  try {
    const user = await requireUser();
    if (!getVapidPublicKey()) throw new ApiError("PUSH_NOT_CONFIGURED", 503);
    const res = await sendPushToUser(user.id, {
      title: "KaloriAI",
      body: "Arka plan bildirimleri çalışıyor 🎉",
      tag: "kaloriai-push-test",
      url: "/",
    });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return errorResponse(e);
  }
}
