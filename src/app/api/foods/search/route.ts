import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth";
import { Prisma } from "@prisma/client";

/** GET /api/foods/search?q=...&limit=20 — local DB + Open Food Facts fallback */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 20), 40);
    if (q.length < 2) return Response.json({ foods: [], source: "empty" });

    // 1) local (global seed + user's custom)
    const local = await db.food.findMany({
      where: {
        deletedAt: null,
        OR: [{ userId: null }, { userId: user.id }],
        name: { contains: q.toLowerCase() },
      },
      include: { servings: true, favorites: { where: { userId: user.id } } },
      orderBy: [{ isVerified: "desc" }, { name: "asc" }],
      take: limit,
    });
    if (local.length >= 5) {
      return Response.json({
        foods: local.map((f) => ({ ...f, isFavorite: f.favorites.length > 0, favoriteId: undefined })),
        source: "local",
      });
    }

    // 2) Open Food Facts (real API, server-side, no key needed)
    let offFoods: unknown[] = [];
    try {
      const fields = "code,product_name,brands,nutriments,serving_size,serving_quantity".split(",").join(",");
      const res = await fetch(
        `https://tr.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${Math.max(limit - local.length, 5)}&fields=${fields}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          products?: Array<{
            code: string;
            product_name?: string;
            brands?: string;
            nutriments?: Record<string, number>;
            serving_size?: string;
            serving_quantity?: number;
          }>;
        };
        offFoods = (data.products || [])
          .filter((p) => p.product_name && p.nutriments?.["energy-kcal_100g"] != null)
          .slice(0, 10)
          .map((p) => ({
            id: `off_${p.code}`,
            name: p.product_name,
            nameEn: null,
            brand: p.brands?.split(",")[0]?.trim() || null,
            source: "OFF",
            barcode: p.code,
            category: "general",
            kcal100: Math.round(p.nutriments!["energy-kcal_100g"]),
            protein100: p.nutriments!["proteins_100g"] ?? 0,
            carb100: p.nutriments!["carbohydrates_100g"] ?? 0,
            fat100: p.nutriments!["fat_100g"] ?? 0,
            fiber100: p.nutriments!["fiber_100g"] ?? 0,
            sugar100: p.nutriments!["sugars_100g"] ?? 0,
            sodium100: (p.nutriments!["sodium_100g"] ?? 0) * 1000,
            satFat100: p.nutriments!["saturated-fat_100g"] ?? 0,
            isVerified: false,
            servings: p.serving_quantity
              ? [{ id: `offs_${p.code}`, label: p.serving_size || "1 porsiyon", grams: p.serving_quantity }]
              : [],
            isFavorite: false,
          }));
      }
    } catch (offErr) {
      console.error("[foods/search] OFF fetch failed:", offErr);
    }

    return Response.json({ foods: [...local, ...offFoods], source: local.length ? "mixed" : "off" });
  } catch (e) {
    return errorResponse(e);
  }
}

// suppress unused import warning for Prisma (kept for future raw queries)
void Prisma;
