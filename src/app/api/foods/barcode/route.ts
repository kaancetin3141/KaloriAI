import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

/** GET /api/foods/barcode?code=... — local first, then Open Food Facts */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const code = new URL(req.url).searchParams.get("code")?.trim() || "";
    if (!/^\d{6,14}$/.test(code)) throw new ApiError("VALIDATION", 400);

    let food = await db.food.findFirst({
      where: { barcode: code, deletedAt: null, OR: [{ userId: null }, { userId: user.id }] },
      include: { servings: true, favorites: { where: { userId: user.id } } },
    });
    if (food) {
      return Response.json({ food: { ...food, isFavorite: food.favorites.length > 0 }, source: "local" });
    }

    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,brands,nutriments,serving_size,serving_quantity`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new ApiError("BARCODE_NOT_FOUND", 404);
    const data = (await res.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        brands?: string;
        nutriments?: Record<string, number>;
        serving_size?: string;
        serving_quantity?: number;
      };
    };
    const p = data.product;
    if (!p?.product_name || p.nutriments?.["energy-kcal_100g"] == null) {
      throw new ApiError("BARCODE_NOT_FOUND", 404);
    }
    const n = p.nutriments;
    // cache into local DB for future lookups
    const saved = await db.food.create({
      data: {
        name: p.product_name.slice(0, 120),
        brand: p.brands?.split(",")[0]?.trim() || null,
        source: "OFF",
        barcode: code,
        kcal100: Math.round(n["energy-kcal_100g"]),
        protein100: n["proteins_100g"] ?? 0,
        carb100: n["carbohydrates_100g"] ?? 0,
        fat100: n["fat_100g"] ?? 0,
        fiber100: n["fiber_100g"] ?? 0,
        sugar100: n["sugars_100g"] ?? 0,
        sodium100: (n["sodium_100g"] ?? 0) * 1000,
        satFat100: n["saturated-fat_100g"] ?? 0,
        servings: p.serving_quantity
          ? { create: { label: p.serving_size || "1 porsiyon", grams: p.serving_quantity } }
          : undefined,
      },
      include: { servings: true },
    });
    return Response.json({ food: { ...saved, isFavorite: false }, source: "off" });
  } catch (e) {
    return errorResponse(e);
  }
}
