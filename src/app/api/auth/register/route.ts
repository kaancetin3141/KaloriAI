import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, createSession, errorResponse, ApiError } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(60),
  consent: z.literal(true),
  locale: z.enum(["tr", "en"]).default("tr"),
});

export async function POST(req: Request) {
  try {
    // toplu hesap üretimine karşı IP bazlı limitleme
    const ipRl = checkRateLimit(`register:${clientIp(req)}`, 5, 300_000);
    if (!ipRl.allowed) throw new ApiError("RATE_LIMITED", 429);

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.issues.map((i) => i.path[0]);
      if (fieldErrors.includes("consent")) throw new ApiError("CONSENT_REQUIRED", 400);
      if (fieldErrors.includes("password")) throw new ApiError("PASSWORD_SHORT", 400);
      throw new ApiError("VALIDATION", 400);
    }
    const { email, password, name, locale } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ApiError("EMAIL_TAKEN", 409);

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        name: name.trim(),
        locale,
        profile: { create: { consentAt: new Date() } },
        subscription: { create: { tier: "free" } },
      },
    });
    await createSession(user.id);
    return Response.json({ ok: true, userId: user.id });
  } catch (e) {
    return errorResponse(e);
  }
}
