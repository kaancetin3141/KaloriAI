import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

/**
 * Aktif oturum yönetimi (Task 5-c):
 *  GET    → kullanıcının süresi geçmemiş oturumları (createdAt desc) + currentId
 *  DELETE → mevcut oturum DIŞINDAKİ tüm oturumları kapat ("diğer cihazlardan çıkış")
 *
 * Çerez adı src/lib/auth.ts ile aynıdır (konstant dışa açılmadığı için burada
 * aynı mekanizmayla — next/headers cookies() — okunur).
 */
const SESSION_COOKIE = "kaloriai_session";

async function currentToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

export async function GET() {
  try {
    const user = await requireUser();
    const token = await currentToken();
    const rows = await db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, createdAt: true, expiresAt: true },
    });
    const current = token ? rows.find((s) => s.token === token) : null;
    return Response.json({
      ok: true,
      currentId: current?.id ?? null,
      sessions: rows.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    // requireUser çerezdeki token üzerinden çözülür → token burada daima mevcut
    const token = await currentToken();
    if (!token) throw new ApiError("UNAUTHORIZED", 401);
    const res = await db.session.deleteMany({
      where: { userId: user.id, NOT: { token } },
    });
    return Response.json({ ok: true, revoked: res.count });
  } catch (e) {
    return errorResponse(e);
  }
}
