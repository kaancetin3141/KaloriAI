/**
 * KaloriAI — Turkish food database seed
 * Run: bun prisma/seed.ts
 *
 * İnce sarmalayıcı: katalog verisi + upsert mantığı tek doğruluk kaynağı
 * olan src/lib/food-catalog.ts'te yaşar (uygulama içi self-healing ile aynı).
 */
import { PrismaClient } from "@prisma/client";
import { ensureSeedFoods } from "../src/lib/food-catalog";

process.env.DATABASE_URL ??= "file:/home/z/my-project/db/custom.db";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.food.count({ where: { source: "SEED" } });
  if (existing > 0) {
    console.log(`Found ${existing} existing SEED foods — refreshing (upsert by name)...`);
  }

  const { foods, servings } = await ensureSeedFoods(prisma);
  console.log(`Seeded ${foods} foods, ${servings} servings (source=SEED).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
