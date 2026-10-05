import { promises as dns } from "dns";
import net from "net";

/**
 * SSRF guard — recipes/import gibi sunucu tarafında kullanıcı URL'i çeken
 * uçlar için. Hedef: localhost, private/loopback/link-local/cloud-metadata
 * ağlarına erişimi engellemek (redirect zincirindeki her atlama dahil).
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
]);

function isPrivateIPv4(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // parse edilemiyorsa engelle
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 0 && o[2] === 0) return true; // 192.0.0/24
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped → IPv4 kuralına sor
    return isPrivateIPv4(lower.slice(7));
  }
  return false;
}

function isPrivateAddress(ip: string): boolean {
  return net.isIPv4(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

export class UrlBlockedError extends Error {
  constructor(reason: string) {
    super(`URL_BLOCKED:${reason}`);
  }
}

/**
 * URL'i parse eder, şema/port/dns kurallarına göre doğrular.
 * Güvenli URL döner; engellenirse UrlBlockedError fırlatır.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlBlockedError("parse");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UrlBlockedError("protocol");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UrlBlockedError("port");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) throw new UrlBlockedError("hostname");
  if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
    if (isPrivateAddress(hostname)) throw new UrlBlockedError("ip");
  } else {
    let addrs: { address: string }[];
    try {
      addrs = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new UrlBlockedError("dns");
    }
    if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
      throw new UrlBlockedError("private-ip");
    }
  }
  return url;
}

/**
 * Guard'lı fetch: her redirect adımını yeniden doğrular (redirect:"follow"
 * korumasız iç ağa yönlenebileceği için manuel takip edilir).
 */
export async function fetchWithGuard(
  rawUrl: string,
  init: { headers?: Record<string, string>; timeoutMs?: number } = {},
  maxRedirects = 3
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicHttpUrl(current);
    const res = await fetch(url.toString(), {
      headers: init.headers,
      signal: AbortSignal.timeout(init.timeoutMs ?? 12000),
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, url).toString();
      try {
        await res.body?.cancel();
      } catch {}
      continue;
    }
    return res;
  }
  throw new UrlBlockedError("too-many-redirects");
}
