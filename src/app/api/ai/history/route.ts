import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth";

/** rawResponse içindeki { items: [...] } dizisinden güvenli { name, grams, kcal } listesi çıkarır. */
function parseItems(raw: string): { name: string; grams: number; kcal: number }[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const items = (parsed as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items
      .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
      .slice(0, 6)
      .map((it) => ({
        name: typeof it.name === "string" ? it.name : "",
        grams: typeof it.grams === "number" && Number.isFinite(it.grams) ? it.grams : 0,
        kcal: typeof it.kcal === "number" && Number.isFinite(it.kcal) ? it.kcal : 0,
      }))
      .filter((it) => it.name !== "");
  } catch {
    return [];
  }
}

/**
 * GET /api/ai/history?page=0&limit=12 — kullanıcının kendi AI analiz geçmişi (yeniden eskiye).
 * take limit+1 → hasMore hesabı; rawResponse JSON'ı korunaklı ayrıştırılır (bozuksa items: []).
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const page = Math.max(0, Math.floor(Number(sp.get("page") || 0)) || 0);
    const limit = Math.min(Math.max(Math.floor(Number(sp.get("limit") || 12)) || 12, 1), 48);

    const rows = await db.aiAnalysis.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: page * limit,
      take: limit + 1,
    });
    const hasMore = rows.length > limit;

    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      itemType: r.itemType,
      textInput: r.textInput,
      imageUrl: r.imagePath ? `/api/files/${r.imagePath}` : null,
      confidence: r.confidence,
      corrected: r.corrected,
      logged: r.logged,
      createdAt: r.createdAt.toISOString(),
      items: parseItems(r.rawResponse),
    }));

    return Response.json({ ok: true, items, hasMore });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/ai/history?id=<cuid> — yalnızca kendi kaydını siler. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "VALIDATION" }, { status: 400 });

    const res = await db.aiAnalysis.deleteMany({ where: { id, userId: user.id } });
    return Response.json({ ok: true, deleted: res.count });
  } catch (e) {
    return errorResponse(e);
  }
}
