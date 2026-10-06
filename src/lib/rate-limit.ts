/**
 * Basit in-memory sliding-window rate limiter (tek süreçli Next.js sunucusu
 * için yeterli; çoklu replika kurulumda paylaşımlı store gerekir).
 *
 * Kullanım:
 *   const rl = checkRateLimit("login:ip:1.2.3.4", 10, 60_000);
 *   if (!rl.allowed) throw new ApiError("RATE_LIMITED", 429);
 */

interface Bucket {
  hits: number[]; // timestamp ms
}

const buckets = new Map<string, Bucket>();

/** Eski bucket'ları temizle — her 1000 çağrıda bir sweeping */
let calls = 0;
function sweep(now: number, maxAgeMs: number): void {
  if (++calls % 1000 !== 0) return;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < maxAgeMs);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  bucket.hits.push(now);
  return { allowed: true, remaining: max - bucket.hits.length, retryAfterSec: 0 };
}

/** İstek istemci IP'si (x-real-ip → XFF SON eleman → unknown; spoof-dayanıklı) */
export function clientIp(req: Request): string {
  // Güvenilir ters proxy (nginx) X-Real-IP'i $remote_addr ile ÜZERINE YAZAR — spoof edilemez.
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  // XFF: yalnız SON elemana güven — güvenilir proxy gerçek istemci IP'sini sona EKLER
  // ($proxy_add_x_forwarded_for). İlk eleman istemci tarafından spoof edilebilir
  // (rate-limit bypass vektörü — sızma testi T29 bulgusu, düzeltildi).
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}
