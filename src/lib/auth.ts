import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { ZodError } from "zod";
import { db } from "@/lib/db";

const SESSION_COOKIE = "kaloriai_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  return candidate.length === original.length && timingSafeEqual(candidate, original);
}

/**
 * Çerez politikası: uygulama HTTPS (gateway/önizleme, iframe dahil) üzerinden
 * servis ediliyorsa SameSite=None; Secure; Partitioned (CHIPS) kullanılır —
 * çapraz-site iframe'lerde oturum çerezi çalışır. Aynı siteli kullanım ve
 * http://localhost geliştirmesi için SameSite=Lax korunur (None Secure gerektirir).
 */
async function cookieSecurityOptions(): Promise<{
  sameSite: "lax" | "none";
  secure: boolean;
  partitioned: boolean;
}> {
  const h = await headers();
  const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0]?.trim();
  const isHttps = proto === "https";
  return { sameSite: isHttps ? "none" : "lax", secure: isHttps, partitioned: isHttps };
}

export async function createSession(userId: string): Promise<string> {
  // oturum hijyeni: süresi geçmiş oturumları giriş anında temizle (tablo küçük kalır)
  await db.session
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});
  const token = createHash("sha256")
    .update(randomBytes(32))
    .update(userId)
    .digest("hex") + randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.session.create({ data: { token, userId, expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    ...(await cookieSecurityOptions()),
    expires: expiresAt,
    path: "/",
  });
  return token;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  // Oluşturmada kullanılan özniteliklerle uyumlu temizleme (partitioned dahil)
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    ...(await cookieSecurityOptions()),
    expires: new Date(0),
    path: "/",
  });
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("UNAUTHORIZED", 401);
  return user;
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  // ZodError (unhandled schema rejection) → client-side validation problem, never a 500
  if (e instanceof ZodError) {
    return Response.json({ error: "VALIDATION" }, { status: 400 });
  }
  console.error("[api]", e);
  return Response.json({ error: "SERVER_ERROR" }, { status: 500 });
}
