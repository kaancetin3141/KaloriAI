import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // CRITICAL: repo sandbox'ta nested (mini-services) çalışıyor — çoklu lockfile yüzünden
  // Turbopack workspace root'unu /home/z/my-project seçip tüm ağacı izliyor, bellek şişiyordu.
  turbopack: {
    root: path.resolve(__dirname, "."),
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // 4GB sandbox'ta 8 servis birlikte çalışıyor — Turbopack bellek tavanını
  // sabitle (gnc-erp next.config.ts ile aynı desen).
  experimental: {
    turbopackMemoryLimit: 512,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // NOT: X-Frame-Options / frame-ancestors BİLİNKİ olarak yok —
          // önizleme paneli uygulamayı çapraz-origin iframe'de gömer.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
