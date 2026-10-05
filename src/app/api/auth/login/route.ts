import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSession, errorResponse, ApiError } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const ipRl = checkRateLimit(`login:ip:${ip}`, 10, 60_000);
    if (!ipRl.allowed) throw new ApiError("RATE_LIMITED", 429);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const email = parsed.data.email.toLowerCase().trim();

    // hesap başına sıkı limitleme — brute force parola denemelerine karşı
    const acctRl = checkRateLimit(`login:acct:${email}`, 5, 60_000);
    if (!acctRl.allowed) throw new ApiError("RATE_LIMITED", 429);

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      throw new ApiError("LOGIN_FAILED", 401);
    }
    await createSession(user.id);
    return Response.json({ ok: true, userId: user.id });
  } catch (e) {
    return errorResponse(e);
  }
}
