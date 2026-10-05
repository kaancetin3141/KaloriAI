import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, errorResponse, ApiError } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { ensureDemoUser, DEMO_ACCOUNTS } from "@/lib/demo";

const schema = z.object({
  demoId: z.enum(["athlete", "weightloss"]),
  reset: z.boolean().optional().default(false),
});

/** GET /api/auth/demo — demo hesap listesi (UI tek kaynaktan okur) */
export async function GET() {
  return Response.json({
    accounts: DEMO_ACCOUNTS.map((a) => ({ id: a.id, email: a.email, name: a.name })),
  });
}

/** POST /api/auth/demo { demoId, reset? } — demo hesabı hazırla + oturum aç */
export async function POST(req: Request) {
  try {
    const rl = checkRateLimit(`demo:${clientIp(req)}`, 15, 60_000);
    if (!rl.allowed) throw new ApiError("RATE_LIMITED", 429);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const meta = DEMO_ACCOUNTS.find((a) => a.id === parsed.data.demoId);
    if (!meta) throw new ApiError("VALIDATION", 400);
    const user = await ensureDemoUser(meta, parsed.data.reset);
    await createSession(user.id);
    return Response.json({ ok: true, userId: user.id, demo: meta.id });
  } catch (e) {
    return errorResponse(e);
  }
}
