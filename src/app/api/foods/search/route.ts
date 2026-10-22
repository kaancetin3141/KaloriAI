import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth";

/**
 * Türkçe-duyarlı normalizasyon: SQLite LIKE yalnız ASCII harfleri küçük-büyük
 * eşler (ı↔I, İ↔i eşleşmez). "MANTI" ↔ "Mantı", "ıspanak" ↔ "Ispanaklı" gibi
 * sorguları eşleyebilmek için adaylar DB'de toplanır, sıralama/filtre JS'te
 * TR-normalize edilmiş adlar üzerinden yapılır.
 */
const TR_FOLD: [RegExp, string][] = [
  [/İ/g, "i"],
  [/I/g, "ı"],
  [/Â/g, "â"],
  [/â/g, "a"],
  [/Û/g, "û"],
  [/û/g, "u"],
  [/Ô/g, "ô"],
  [/ô/g, "o"],
];

function trNormalize(s: string): string {
  let out = s;
  for (const [re, to] of TR_FOLD) out = out.replace(re, to);
  return out.toLocaleLowerCase("tr");
}

/** LIKE aday varyantları: ham + tüm-i + noktasız-ı biçimleri (ASCII katlamaya yaslanır) */
function likeVariants(q: string): string[] {
  const allI = q.replace(/[iİıI]/g, "i");
  const allDotless = q.replace(/[iİıI]/g, "ı");
  return Array.from(new Set([q, q.toLowerCase(), allI, allI.toLowerCase(), allDotless])).filter((v) => v.length >= 1);
}

/** GET /api/foods/search?q=...&limit=20 — local DB + Open Food Facts fallback */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 20), 40);
    if (q.length < 2) return Response.json({ foods: [], source: "empty" });

    const nq = trNormalize(q);
    const visibility = { OR: [{ userId: null }, { userId: user.id }] };
    const include = { servings: true, favorites: { where: { userId: user.id } } } as const;
    const matchesQ = (f: { name: string; nameEn?: string | null }) =>
      trNormalize(f.name).includes(nq) || (f.nameEn ? trNormalize(f.nameEn).includes(nq) : false);

    // 1) local (global seed + user's custom) — hızlı yol: LIKE varyant adayları
    const candidates = await db.food.findMany({
      where: {
        deletedAt: null,
        AND: [visibility, { OR: likeVariants(q).map((v) => ({ name: { contains: v } })) }],
      },
      include,
      orderBy: [{ isVerified: "desc" }, { name: "asc" }],
      take: 60,
    });
    let filtered = candidates.filter(matchesQ);

    if (filtered.length < limit) {
      // 1b) geniş aday seti: LIKE'ın kaçırabileceği TR harf varyantlarını JS'te tara
      const broad = await db.food.findMany({
        where: { deletedAt: null, ...visibility },
        include,
        orderBy: [{ isVerified: "desc" }, { name: "asc" }],
        take: 400,
      });
      const seen = new Set(filtered.map((f) => f.id));
      for (const f of broad) {
        if (!seen.has(f.id) && matchesQ(f)) {
          filtered.push(f);
          seen.add(f.id);
        }
      }
    }

    // sıralama: doğrulanmış → önekle başlayan → TR alfabetik
    filtered.sort((a, b) => {
      const av = a.isVerified ? 0 : 1;
      const bv = b.isVerified ? 0 : 1;
      if (av !== bv) return av - bv;
      const as = trNormalize(a.name).startsWith(nq) ? 0 : 1;
      const bs = trNormalize(b.name).startsWith(nq) ? 0 : 1;
      if (as !== bs) return as - bs;
      return trNormalize(a.name).localeCompare(trNormalize(b.name), "tr");
    });

    const serialize = (foods: typeof filtered) =>
      foods.map((f) => ({ ...f, nameEn: f.nameEn ?? null, isFavorite: f.favorites.length > 0, favoriteId: undefined }));

    if (filtered.length >= 5) {
      return Response.json({ foods: serialize(filtered).slice(0, limit), source: "local" });
    }

    // 2) Open Food Facts (real API, server-side, no key needed)
    let offFoods: unknown[] = [];
    try {
      const fields = "code,product_name,brands,nutriments,serving_size,serving_quantity";
      const res = await fetch(
        `https://tr.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${Math.max(limit - filtered.length, 5)}&fields=${fields}`,
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
              ? [
                  {
                    id: `offs_${p.code}`,
                    // dil-bağımsız etiket: OFF porsiyon bilgisi gram cinsinden geldiği için "X g"
                    label: p.serving_size || `${Math.round(p.serving_quantity)} g`,
                    grams: p.serving_quantity,
                  },
                ]
              : [],
            isFavorite: false,
          }));
      }
    } catch (offErr) {
      console.error("[foods/search] OFF fetch failed:", offErr);
    }

    return Response.json({ foods: [...serialize(filtered), ...offFoods], source: filtered.length ? "mixed" : "off" });
  } catch (e) {
    return errorResponse(e);
  }
}
