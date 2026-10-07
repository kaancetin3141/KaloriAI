import { NextResponse, type NextRequest } from "next/server";

/**
 * API CSRF koruması — same-origin zorlaması (Next.js 16 "proxy" konvansiyonu).
 *
 * Uygulama HTTPS'te SameSite=None çerez kullanır (iframe/CHIPS), bu yüzden
 * çerez tarayıcı tarafından çapraz-site isteklere de eklenir. Tarayıcılar
 * çapraz-site isteklerde her zaman Origin ve/veya Sec-Fetch-Site gönderir;
 * bunları doğrulayarak CSRF'i keseriz. curl/benzeri istemciler bu başlıkları
 * göndermez → izin verilir (API testleri bozulmaz).
 */

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/:(443|80)$/, "");
}

export default function proxy(req: NextRequest) {
  const method = req.method.toUpperCase();
  const isMutating = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

  if (isMutating) {
    const secFetchSite = req.headers.get("sec-fetch-site");
    if (secFetchSite === "cross-site") {
      return NextResponse.json({ error: "CROSS_SITE_BLOCKED" }, { status: 403 });
    }

    const origin = req.headers.get("origin");
    if (origin) {
      let originHost: string | null = null;
      try {
        originHost = normalizeHost(new URL(origin).host);
      } catch {
        originHost = null;
      }
      const reqHost = normalizeHost(
        req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
      );
      // Host belirlenebilirse eşleşme zorunlu; belirlenemezse geç (proxy belirsizliği)
      if (originHost && reqHost && originHost !== reqHost) {
        return NextResponse.json({ error: "CROSS_SITE_BLOCKED" }, { status: 403 });
      }
    }
  }

  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
