import { getCurrentUser, errorResponse } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";

const UPLOAD_ROOT = path.join(process.cwd(), "upload");

/** Yalnızca görsel uzantıları — /api/files her zaman image servis eder */
const ALLOWED_EXT = new Set([".jpg", ".jpeg"]);

/** GET /api/files/ai/<userId>/<file> — private per-user access */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const user = await getCurrentUser();
    const { path: parts } = await ctx.params;
    if (!user || !parts || parts.length < 3) {
      return new Response("Not found", { status: 404 });
    }
    // traversal reddi — hiçbir segment ".." veya yol içeremez
    for (const seg of parts) {
      if (seg === ".." || seg === "." || seg.includes("/") || seg.includes("\\") || seg.includes("\0")) {
        return new Response("Not found", { status: 404 });
      }
    }
    const [scope, owner] = parts;
    // private per-user buckets (spec: private storage)
    if ((scope === "ai" || scope === "progress") && owner !== user.id) {
      return new Response("Forbidden", { status: 403 });
    }
    const rel = parts.join("/");
    const filePath = path.normalize(path.join(UPLOAD_ROOT, rel));
    // separator-safe root check (sibling prefix bypass'a karşı: "upload-evil")
    if (!filePath.startsWith(UPLOAD_ROOT + path.sep)) {
      return new Response("Not found", { status: 404 });
    }
    if (!ALLOWED_EXT.has(path.extname(filePath).toLowerCase())) {
      return new Response("Not found", { status: 404 });
    }
    const data = await fs.readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
