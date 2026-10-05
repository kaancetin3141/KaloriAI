/**
 * KaloriAI — Turkish food database seed
 * Run: bun prisma/seed.ts
 *
 * Idempotent: upserts every Food by (name, source="SEED") and replaces its
 * Servings. Safe to run multiple times. barcode=null, isVerified=true.
 *
 * DATABASE_URL: Bun auto-loads the root .env; fallback matches it exactly.
 */
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??= "file:/home/z/my-project/db/custom.db";

const prisma = new PrismaClient();

interface SeedServing {
  label: string;
  grams: number;
}

interface SeedFood {
  name: string;
  nameEn: string;
  category:
    | "turkish_cuisine"
    | "fruit"
    | "grain"
    | "meat"
    | "dairy"
    | "snack"
    | "drink"
    | "vegetable"
    | "nut"
    | "general";
  kcal100: number;
  protein100: number;
  carb100: number;
  fat100: number;
  fiber100: number;
  sugar100: number;
  sodium100: number; // mg
  satFat100: number;
  servings: SeedServing[];
}

// Per-100g values are realistic estimates (TÜİK/USDA/typical TR restaurant portions).
const FOODS: SeedFood[] = [
  // ─── Türk Mutfağı — Ana Yemekler ───────────────────────────────────────────
  { name: "Mantı", nameEn: "Turkish dumplings with yogurt", category: "turkish_cuisine", kcal100: 175, protein100: 8, carb100: 22, fat100: 6.5, fiber100: 1.2, sugar100: 2, sodium100: 280, satFat100: 2.5, servings: [{ label: "1 porsiyon", grams: 300 }, { label: "1 kaşık", grams: 30 }] },
  { name: "Lahmacun", nameEn: "Turkish pizza", category: "turkish_cuisine", kcal100: 250, protein100: 11, carb100: 32, fat100: 8.5, fiber100: 1.5, sugar100: 2, sodium100: 480, satFat100: 3, servings: [{ label: "1 adet", grams: 125 }, { label: "1 adet (çeşni taşımaz, ince)", grams: 110 }] },
  { name: "Su Böreği", nameEn: "Water börek (layered pastry)", category: "turkish_cuisine", kcal100: 290, protein100: 7, carb100: 30, fat100: 15, fiber100: 1, sugar100: 1.5, sodium100: 400, satFat100: 7, servings: [{ label: "1 dilim", grams: 120 }, { label: "1 porsiyon", grams: 200 }] },
  { name: "Patatesli Börek", nameEn: "Potato börek", category: "turkish_cuisine", kcal100: 240, protein100: 6, carb100: 28, fat100: 11, fiber100: 2, sugar100: 2, sodium100: 380, satFat100: 4, servings: [{ label: "1 dilim", grams: 100 }, { label: "1 porsiyon", grams: 180 }] },
  { name: "Peynirli Börek", nameEn: "Cheese börek", category: "turkish_cuisine", kcal100: 265, protein100: 9.5, carb100: 26, fat100: 13, fiber100: 1.2, sugar100: 1.5, sodium100: 450, satFat100: 5.5, servings: [{ label: "1 dilim", grams: 100 }, { label: "1 porsiyon", grams: 180 }] },
  { name: "Ispanaklı Börek", nameEn: "Spinach börek", category: "turkish_cuisine", kcal100: 220, protein100: 6.5, carb100: 26, fat100: 10, fiber100: 2.2, sugar100: 1.5, sodium100: 380, satFat100: 4, servings: [{ label: "1 dilim", grams: 100 }, { label: "1 porsiyon", grams: 180 }] },
  { name: "Kıymalı Börek", nameEn: "Minced meat börek", category: "turkish_cuisine", kcal100: 270, protein100: 9, carb100: 27, fat100: 13.5, fiber100: 1.2, sugar100: 1.5, sodium100: 460, satFat100: 5.5, servings: [{ label: "1 dilim", grams: 100 }, { label: "1 porsiyon", grams: 180 }] },
  { name: "Kuşbaşılı Pide", nameEn: "Pide with diced meat", category: "turkish_cuisine", kcal100: 240, protein100: 12, carb100: 30, fat100: 8, fiber100: 1.5, sugar100: 2, sodium100: 470, satFat100: 3.2, servings: [{ label: "1 adet", grams: 250 }, { label: "1 yarım", grams: 125 }] },
  { name: "Kaşarlı Pide", nameEn: "Cheese pide", category: "turkish_cuisine", kcal100: 270, protein100: 13, carb100: 29, fat100: 11, fiber100: 1.5, sugar100: 2, sodium100: 520, satFat100: 5.5, servings: [{ label: "1 adet", grams: 250 }, { label: "1 yarım", grams: 125 }] },
  { name: "Adana Kebap", nameEn: "Adana kebab", category: "turkish_cuisine", kcal100: 230, protein100: 17, carb100: 2, fat100: 17, fiber100: 0.3, sugar100: 1, sodium100: 550, satFat100: 7, servings: [{ label: "1 porsiyon", grams: 180 }, { label: "1 şiş", grams: 100 }] },
  { name: "Urfa Kebap", nameEn: "Urfa kebab (mild)", category: "turkish_cuisine", kcal100: 220, protein100: 17.5, carb100: 2, fat100: 16, fiber100: 0.3, sugar100: 1, sodium100: 530, satFat100: 6.5, servings: [{ label: "1 porsiyon", grams: 180 }, { label: "1 şiş", grams: 100 }] },
  { name: "Et Döner", nameEn: "Beef döner", category: "turkish_cuisine", kcal100: 230, protein100: 16, carb100: 4, fat100: 16, fiber100: 0.5, sugar100: 1.5, sodium100: 600, satFat100: 6, servings: [{ label: "1 porsiyon", grams: 200 }, { label: "1 dürüm", grams: 250 }, { label: "1 dilim", grams: 50 }] },
  { name: "Tavuk Döner", nameEn: "Chicken döner", category: "turkish_cuisine", kcal100: 180, protein100: 18, carb100: 3, fat100: 10, fiber100: 0.5, sugar100: 1.5, sodium100: 600, satFat100: 2.5, servings: [{ label: "1 porsiyon", grams: 200 }, { label: "1 dürüm", grams: 250 }, { label: "1 dilim", grams: 50 }] },
  { name: "Kuzu Şiş Kebap", nameEn: "Lamb shish kebab", category: "turkish_cuisine", kcal100: 210, protein100: 20, carb100: 1.5, fat100: 13, fiber100: 0.2, sugar100: 0.8, sodium100: 420, satFat100: 5.5, servings: [{ label: "1 porsiyon", grams: 180 }, { label: "1 şiş", grams: 90 }] },
  { name: "Şiş Tavuk", nameEn: "Chicken shish kebab", category: "turkish_cuisine", kcal100: 150, protein100: 24, carb100: 1.5, fat100: 5, fiber100: 0.2, sugar100: 0.8, sodium100: 400, satFat100: 1.3, servings: [{ label: "1 porsiyon", grams: 180 }, { label: "1 şiş", grams: 90 }] },
  { name: "İskender Kebap", nameEn: "Iskender kebab", category: "turkish_cuisine", kcal100: 190, protein100: 13, carb100: 10, fat100: 12, fiber100: 0.8, sugar100: 3, sodium100: 420, satFat100: 5, servings: [{ label: "1 porsiyon", grams: 350 }] },
  { name: "Izgara Köfte", nameEn: "Grilled meatballs", category: "turkish_cuisine", kcal100: 240, protein100: 17, carb100: 6, fat100: 16, fiber100: 0.5, sugar100: 1, sodium100: 480, satFat100: 6, servings: [{ label: "1 adet", grams: 40 }, { label: "1 porsiyon (4 adet)", grams: 160 }] },
  { name: "Etli Güveç", nameEn: "Meat güveç (casserole)", category: "turkish_cuisine", kcal100: 130, protein100: 9, carb100: 8, fat100: 7, fiber100: 1.5, sugar100: 2.5, sodium100: 380, satFat100: 2.8, servings: [{ label: "1 güveç", grams: 300 }] },
  { name: "Karnıyarık", nameEn: "Stuffed eggplant with meat", category: "turkish_cuisine", kcal100: 130, protein100: 6.5, carb100: 10, fat100: 7, fiber100: 2.5, sugar100: 4, sodium100: 350, satFat100: 2.5, servings: [{ label: "1 adet", grams: 200 }, { label: "1 porsiyon (2 adet)", grams: 400 }] },
  { name: "Etli Biber Dolması", nameEn: "Stuffed green peppers with meat", category: "turkish_cuisine", kcal100: 120, protein100: 6, carb100: 12, fat100: 5, fiber100: 2, sugar100: 3.5, sodium100: 340, satFat100: 2, servings: [{ label: "1 adet", grams: 150 }, { label: "1 porsiyon (2 adet)", grams: 300 }] },
  { name: "Zeytinyağlı Yaprak Sarma", nameEn: "Stuffed vine leaves (olive oil)", category: "turkish_cuisine", kcal100: 135, protein100: 2.5, carb100: 16, fat100: 7, fiber100: 2.5, sugar100: 2, sodium100: 350, satFat100: 1, servings: [{ label: "1 porsiyon", grams: 200 }, { label: "1 adet", grams: 30 }] },
  { name: "Kumpir", nameEn: "Loaded baked potato", category: "turkish_cuisine", kcal100: 150, protein100: 4, carb100: 18, fat100: 7, fiber100: 2, sugar100: 3, sodium100: 320, satFat100: 3.5, servings: [{ label: "1 adet", grams: 400 }] },
  { name: "Karışık Tost", nameEn: "Mixed toast (ham & cheese)", category: "turkish_cuisine", kcal100: 250, protein100: 12, carb100: 26, fat100: 11, fiber100: 1.8, sugar100: 2.5, sodium100: 450, satFat100: 4.5, servings: [{ label: "1 adet", grams: 150 }] },
  { name: "Menemen", nameEn: "Turkish scrambled eggs with tomato", category: "turkish_cuisine", kcal100: 110, protein100: 5.5, carb100: 5, fat100: 7.5, fiber100: 1.2, sugar100: 3, sodium100: 300, satFat100: 2.8, servings: [{ label: "1 porsiyon (2 yumurtalı)", grams: 250 }] },
  { name: "Çılbır", nameEn: "Poached eggs with yogurt", category: "turkish_cuisine", kcal100: 130, protein100: 7, carb100: 3, fat100: 10, fiber100: 0.3, sugar100: 2.5, sodium100: 260, satFat100: 4.5, servings: [{ label: "1 porsiyon", grams: 220 }] },

  // ─── Türk Mutfağı — Çorbalar ───────────────────────────────────────────────
  { name: "Mercimek Çorbası", nameEn: "Lentil soup", category: "turkish_cuisine", kcal100: 65, protein100: 3.5, carb100: 9, fat100: 1.8, fiber100: 2, sugar100: 1.5, sodium100: 320, satFat100: 0.4, servings: [{ label: "1 kase", grams: 250 }, { label: "1 kepçe", grams: 200 }] },
  { name: "Ezogelin Çorbası", nameEn: "Ezogelin soup", category: "turkish_cuisine", kcal100: 70, protein100: 3, carb100: 10.5, fat100: 2, fiber100: 2.2, sugar100: 1.5, sodium100: 340, satFat100: 0.5, servings: [{ label: "1 kase", grams: 250 }, { label: "1 kepçe", grams: 200 }] },
  { name: "Tarhana Çorbası", nameEn: "Tarhana soup", category: "turkish_cuisine", kcal100: 55, protein100: 2, carb100: 8, fat100: 1.5, fiber100: 1, sugar100: 1.5, sodium100: 350, satFat100: 0.4, servings: [{ label: "1 kase", grams: 250 }] },
  { name: "İşkembe Çorbası", nameEn: "Tripe soup", category: "turkish_cuisine", kcal100: 80, protein100: 5, carb100: 2, fat100: 5.5, fiber100: 0, sugar100: 0.5, sodium100: 350, satFat100: 2.2, servings: [{ label: "1 kase", grams: 300 }] },
  { name: "Domates Çorbası", nameEn: "Tomato soup", category: "turkish_cuisine", kcal100: 60, protein100: 1.5, carb100: 9, fat100: 2, fiber100: 0.8, sugar100: 4, sodium100: 330, satFat100: 0.5, servings: [{ label: "1 kase", grams: 250 }] },

  // ─── Türk Mutfağı — Baklagil & Pilav ───────────────────────────────────────
  { name: "Kuru Fasulye", nameEn: "White bean stew", category: "turkish_cuisine", kcal100: 110, protein100: 6.5, carb100: 15, fat100: 3, fiber100: 5, sugar100: 2.5, sodium100: 380, satFat100: 0.5, servings: [{ label: "1 porsiyon", grams: 250 }, { label: "1 kepçe", grams: 200 }] },
  { name: "Nohut Yemeği", nameEn: "Chickpea stew", category: "turkish_cuisine", kcal100: 130, protein100: 6.5, carb100: 17, fat100: 4, fiber100: 5, sugar100: 2.5, sodium100: 380, satFat100: 0.6, servings: [{ label: "1 porsiyon", grams: 250 }, { label: "1 kepçe", grams: 200 }] },
  { name: "Beyaz Pilav", nameEn: "White rice pilaf", category: "turkish_cuisine", kcal100: 130, protein100: 2.7, carb100: 25, fat100: 2.8, fiber100: 0.7, sugar100: 0.5, sodium100: 250, satFat100: 0.7, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 kaşık", grams: 40 }] },
  { name: "Bulgur Pilavı", nameEn: "Bulgur pilaf", category: "turkish_cuisine", kcal100: 110, protein100: 3.2, carb100: 20, fat100: 2.2, fiber100: 3.5, sugar100: 0.5, sodium100: 250, satFat100: 0.4, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 kaşık", grams: 40 }] },
  { name: "İç Pilav", nameEn: "Rice pilaf with currants & pine nuts", category: "turkish_cuisine", kcal100: 150, protein100: 3.5, carb100: 26, fat100: 4, fiber100: 1.5, sugar100: 2.5, sodium100: 280, satFat100: 0.8, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 kaşık", grams: 40 }] },

  // ─── Türk Mutfağı — Kahvaltı/Meze & Sokak ──────────────────────────────────
  { name: "Simit", nameEn: "Turkish sesame bagel", category: "turkish_cuisine", kcal100: 300, protein100: 9, carb100: 55, fat100: 4.5, fiber100: 2.5, sugar100: 3, sodium100: 400, satFat100: 0.8, servings: [{ label: "1 adet", grams: 100 }, { label: "1 mini simit", grams: 50 }] },
  { name: "Poğaça", nameEn: "Turkish savory pastry", category: "turkish_cuisine", kcal100: 330, protein100: 8, carb100: 42, fat100: 14, fiber100: 1.5, sugar100: 2, sodium100: 420, satFat100: 5, servings: [{ label: "1 adet", grams: 80 }] },
  { name: "Açma", nameEn: "Turkish soft bagel", category: "turkish_cuisine", kcal100: 310, protein100: 8, carb100: 46, fat100: 10, fiber100: 1.5, sugar100: 3, sodium100: 400, satFat100: 2.5, servings: [{ label: "1 adet", grams: 90 }] },
  { name: "Hummus", nameEn: "Hummus", category: "turkish_cuisine", kcal100: 180, protein100: 7.5, carb100: 14, fat100: 10, fiber100: 4, sugar100: 1, sodium100: 380, satFat100: 1.4, servings: [{ label: "1 porsiyon", grams: 100 }, { label: "1 yemek kaşığı", grams: 20 }] },
  { name: "Cacık", nameEn: "Yogurt with cucumber & garlic", category: "turkish_cuisine", kcal100: 55, protein100: 3, carb100: 3.5, fat100: 2.8, fiber100: 0.4, sugar100: 3, sodium100: 180, satFat100: 1.8, servings: [{ label: "1 kase", grams: 200 }] },
  { name: "Haydari", nameEn: "Strained yogurt dip", category: "turkish_cuisine", kcal100: 120, protein100: 6, carb100: 4, fat100: 8.5, fiber100: 0.3, sugar100: 3, sodium100: 300, satFat100: 5.5, servings: [{ label: "1 porsiyon", grams: 80 }] },
  { name: "Muhammara", nameEn: "Red pepper & walnut dip", category: "turkish_cuisine", kcal100: 230, protein100: 4.5, carb100: 12, fat100: 18, fiber100: 2.5, sugar100: 4, sodium100: 350, satFat100: 2.2, servings: [{ label: "1 porsiyon", grams: 80 }] },
  { name: "Acılı Ezme", nameEn: "Spicy tomato salad (ezme)", category: "turkish_cuisine", kcal100: 60, protein100: 1.5, carb100: 6, fat100: 3.5, fiber100: 1.8, sugar100: 4, sodium100: 300, satFat100: 0.5, servings: [{ label: "1 porsiyon", grams: 80 }] },

  // ─── Türk Mutfağı — Tatlılar ───────────────────────────────────────────────
  { name: "Baklava", nameEn: "Baklava", category: "turkish_cuisine", kcal100: 430, protein100: 6, carb100: 48, fat100: 24, fiber100: 1.5, sugar100: 30, sodium100: 150, satFat100: 10, servings: [{ label: "1 dilim", grams: 60 }, { label: "1 porsiyon (4 dilim)", grams: 240 }] },
  { name: "Künefe", nameEn: "Künefe (cheese pastry in syrup)", category: "turkish_cuisine", kcal100: 350, protein100: 7, carb100: 35, fat100: 20, fiber100: 1, sugar100: 18, sodium100: 180, satFat100: 9, servings: [{ label: "1 porsiyon", grams: 150 }] },
  { name: "Sütlaç", nameEn: "Rice pudding", category: "turkish_cuisine", kcal100: 130, protein100: 3, carb100: 21, fat100: 3.5, fiber100: 0.3, sugar100: 12, sodium100: 60, satFat100: 2.2, servings: [{ label: "1 porsiyon (kase)", grams: 150 }] },
  { name: "Kazandibi", nameEn: "Kazandibi (caramelized milk pudding)", category: "turkish_cuisine", kcal100: 190, protein100: 3.5, carb100: 28, fat100: 7, fiber100: 0.2, sugar100: 18, sodium100: 70, satFat100: 4.5, servings: [{ label: "1 dilim", grams: 120 }] },
  { name: "Lokum", nameEn: "Turkish delight", category: "turkish_cuisine", kcal100: 350, protein100: 0.2, carb100: 87, fat100: 0.1, fiber100: 0.2, sugar100: 70, sodium100: 30, satFat100: 0, servings: [{ label: "1 adet", grams: 15 }, { label: "1 porsiyon", grams: 50 }] },
  { name: "Tahin Helvası", nameEn: "Tahini halva", category: "turkish_cuisine", kcal100: 500, protein100: 12, carb100: 45, fat100: 30, fiber100: 3, sugar100: 35, sodium100: 90, satFat100: 4.5, servings: [{ label: "1 dilim", grams: 30 }] },
  { name: "Un Helvası", nameEn: "Flour halva", category: "turkish_cuisine", kcal100: 420, protein100: 6, carb100: 55, fat100: 20, fiber100: 1, sugar100: 28, sodium100: 80, satFat100: 11, servings: [{ label: "1 porsiyon", grams: 100 }] },

  // ─── Türk Mutfağı — İçecekler ──────────────────────────────────────────────
  { name: "Ayran", nameEn: "Ayran (yogurt drink)", category: "drink", kcal100: 37, protein100: 1.9, carb100: 3, fat100: 1.8, fiber100: 0, sugar100: 3, sodium100: 90, satFat100: 1.1, servings: [{ label: "1 bardak", grams: 200 }, { label: "1 küçük bardak", grams: 100 }] },
  { name: "Şalgam Suyu", nameEn: "Turnip juice (şalgam)", category: "drink", kcal100: 25, protein100: 0.5, carb100: 5.5, fat100: 0.1, fiber100: 0.3, sugar100: 4, sodium100: 450, satFat100: 0, servings: [{ label: "1 bardak", grams: 200 }] },
  { name: "Limonata", nameEn: "Lemonade", category: "drink", kcal100: 40, protein100: 0.1, carb100: 10, fat100: 0, fiber100: 0, sugar100: 9.5, sodium100: 10, satFat100: 0, servings: [{ label: "1 bardak", grams: 200 }] },
  { name: "Türk Kahvesi (sade)", nameEn: "Turkish coffee (plain)", category: "drink", kcal100: 4, protein100: 0.1, carb100: 0.7, fat100: 0.1, fiber100: 0, sugar100: 0, sodium100: 2, satFat100: 0, servings: [{ label: "1 fincan", grams: 70 }] },
  { name: "Türk Kahvesi (orta şekerli)", nameEn: "Turkish coffee (medium sugar)", category: "drink", kcal100: 20, protein100: 0.1, carb100: 5, fat100: 0.1, fiber100: 0, sugar100: 4.8, sodium100: 2, satFat100: 0, servings: [{ label: "1 fincan", grams: 70 }] },
  { name: "Çay (sade)", nameEn: "Turkish tea (plain)", category: "drink", kcal100: 1, protein100: 0, carb100: 0.2, fat100: 0, fiber100: 0, sugar100: 0, sodium100: 1, satFat100: 0, servings: [{ label: "1 bardak (ince belli)", grams: 100 }, { label: "1 büyük bardak", grams: 200 }] },

  // ─── Temel — Ekmek & Tahıl ─────────────────────────────────────────────────
  { name: "Beyaz Ekmek", nameEn: "White bread", category: "grain", kcal100: 265, protein100: 9, carb100: 52, fat100: 3, fiber100: 2.3, sugar100: 2.5, sodium100: 490, satFat100: 0.7, servings: [{ label: "1 dilim", grams: 25 }, { label: "1 yarım ekmek", grams: 100 }] },
  { name: "Tam Buğday Ekmek", nameEn: "Whole wheat bread", category: "grain", kcal100: 245, protein100: 10, carb100: 44, fat100: 3.5, fiber100: 6.5, sugar100: 2.5, sodium100: 450, satFat100: 0.7, servings: [{ label: "1 dilim", grams: 30 }, { label: "1 yarım ekmek", grams: 100 }] },
  { name: "Haşlanmış Pirinç", nameEn: "Cooked white rice", category: "grain", kcal100: 130, protein100: 2.7, carb100: 28, fat100: 0.3, fiber100: 0.4, sugar100: 0.1, sodium100: 1, satFat100: 0.1, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 kaşık", grams: 40 }] },
  { name: "Pişmiş Bulgur", nameEn: "Cooked bulgur", category: "grain", kcal100: 83, protein100: 3, carb100: 18.6, fat100: 0.2, fiber100: 4.5, sugar100: 0.1, sodium100: 5, satFat100: 0, servings: [{ label: "1 porsiyon", grams: 150 }] },
  { name: "Makarna (pişmiş)", nameEn: "Pasta (cooked)", category: "grain", kcal100: 158, protein100: 5.8, carb100: 31, fat100: 0.9, fiber100: 1.8, sugar100: 0.6, sodium100: 5, satFat100: 0.2, servings: [{ label: "1 porsiyon", grams: 200 }, { label: "1 tabak", grams: 250 }] },
  { name: "Yulaf Ezmesi", nameEn: "Rolled oats (dry)", category: "grain", kcal100: 389, protein100: 16.9, carb100: 66, fat100: 6.9, fiber100: 10.6, sugar100: 1, sodium100: 2, satFat100: 1.2, servings: [{ label: "1 porsiyon (kahvaltı)", grams: 40 }, { label: "1 yemek kaşığı", grams: 10 }] },

  // ─── Temel — Et, Balık, Yumurta ────────────────────────────────────────────
  { name: "Yumurta (haşlanmış)", nameEn: "Boiled egg", category: "meat", kcal100: 155, protein100: 13, carb100: 1.1, fat100: 11, fiber100: 0, sugar100: 1.1, sodium100: 124, satFat100: 3.3, servings: [{ label: "1 adet (L)", grams: 55 }, { label: "1 adet (M)", grams: 50 }] },
  { name: "Sahanda Yumurta", nameEn: "Fried eggs", category: "meat", kcal100: 190, protein100: 11, carb100: 1, fat100: 16, fiber100: 0, sugar100: 1, sodium100: 200, satFat100: 5.5, servings: [{ label: "1 porsiyon (2 yumurta)", grams: 120 }] },
  { name: "Izgara Tavuk Göğsü", nameEn: "Grilled chicken breast", category: "meat", kcal100: 165, protein100: 31, carb100: 0, fat100: 3.6, fiber100: 0, sugar100: 0, sodium100: 74, satFat100: 1, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 dilim", grams: 50 }] },
  { name: "Izgara Tavuk But", nameEn: "Grilled chicken thigh", category: "meat", kcal100: 185, protein100: 26, carb100: 0, fat100: 9, fiber100: 0, sugar100: 0, sodium100: 85, satFat100: 2.5, servings: [{ label: "1 adet", grams: 120 }] },
  { name: "Dana Kıyma (orta yağlı)", nameEn: "Ground beef (medium fat, raw)", category: "meat", kcal100: 250, protein100: 17.5, carb100: 0, fat100: 20, fiber100: 0, sugar100: 0, sodium100: 75, satFat100: 8, servings: [{ label: "1 porsiyon", grams: 150 }] },
  { name: "Dana Kuşbaşı", nameEn: "Diced beef (raw)", category: "meat", kcal100: 190, protein100: 19.5, carb100: 0, fat100: 12, fiber100: 0, sugar100: 0, sodium100: 60, satFat100: 5, servings: [{ label: "1 porsiyon", grams: 150 }] },
  { name: "Kuzu Pirzola", nameEn: "Lamb chops", category: "meat", kcal100: 280, protein100: 25, carb100: 0, fat100: 20, fiber100: 0, sugar100: 0, sodium100: 80, satFat100: 9, servings: [{ label: "1 adet", grams: 100 }, { label: "1 porsiyon (2 adet)", grams: 200 }] },
  { name: "Sucuk", nameEn: "Turkish sausage", category: "meat", kcal100: 460, protein100: 17, carb100: 1.5, fat100: 42, fiber100: 0, sugar100: 0.5, sodium100: 1600, satFat100: 17, servings: [{ label: "1 dilim", grams: 15 }, { label: "1 porsiyon (sahanda)", grams: 60 }] },
  { name: "Izgara Somon", nameEn: "Grilled salmon", category: "meat", kcal100: 208, protein100: 20, carb100: 0, fat100: 13, fiber100: 0, sugar100: 0, sodium100: 59, satFat100: 3.1, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 dilim", grams: 100 }] },
  { name: "Izgara Levrek", nameEn: "Grilled sea bass", category: "meat", kcal100: 125, protein100: 20, carb100: 0, fat100: 4.5, fiber100: 0, sugar100: 0, sodium100: 90, satFat100: 1, servings: [{ label: "1 porsiyon (fileto)", grams: 200 }] },
  { name: "Ton Balığı Konserve (suda)", nameEn: "Canned tuna in water", category: "meat", kcal100: 116, protein100: 26, carb100: 0, fat100: 1, fiber100: 0, sugar100: 0, sodium100: 350, satFat100: 0.3, servings: [{ label: "1 kutu (süzülmüş)", grams: 80 }] },

  // ─── Temel — Süt Ürünleri ──────────────────────────────────────────────────
  { name: "Süt (tam yağlı)", nameEn: "Whole milk", category: "dairy", kcal100: 64, protein100: 3.3, carb100: 4.8, fat100: 3.5, fiber100: 0, sugar100: 4.8, sodium100: 43, satFat100: 2.3, servings: [{ label: "1 bardak", grams: 200 }] },
  { name: "Süt (yarım yağlı)", nameEn: "Semi-skimmed milk", category: "dairy", kcal100: 52, protein100: 3.4, carb100: 5, fat100: 1.5, fiber100: 0, sugar100: 5, sodium100: 45, satFat100: 0.9, servings: [{ label: "1 bardak", grams: 200 }] },
  { name: "Yoğurt (sade, tam yağlı)", nameEn: "Plain whole yogurt", category: "dairy", kcal100: 90, protein100: 3.5, carb100: 4.7, fat100: 4.8, fiber100: 0, sugar100: 4.7, sodium100: 55, satFat100: 3, servings: [{ label: "1 kase", grams: 200 }, { label: "1 yemek kaşığı", grams: 25 }] },
  { name: "Süzme Yoğurt", nameEn: "Strained yogurt", category: "dairy", kcal100: 110, protein100: 8, carb100: 4, fat100: 7, fiber100: 0, sugar100: 4, sodium100: 50, satFat100: 4.5, servings: [{ label: "1 kase", grams: 200 }, { label: "1 yemek kaşığı", grams: 25 }] },
  { name: "Beyaz Peynir", nameEn: "White brined cheese (feta)", category: "dairy", kcal100: 264, protein100: 17, carb100: 1.9, fat100: 21, fiber100: 0, sugar100: 1.5, sodium100: 1100, satFat100: 13, servings: [{ label: "1 dilim", grams: 30 }, { label: "1 kibrit kutusu", grams: 50 }] },
  { name: "Kaşar Peyniri", nameEn: "Kashar cheese", category: "dairy", kcal100: 330, protein100: 25, carb100: 2, fat100: 25, fiber100: 0, sugar100: 1.5, sodium100: 700, satFat100: 16, servings: [{ label: "1 dilim", grams: 20 }, { label: "1 porsiyon", grams: 50 }] },
  { name: "Lor Peyniri", nameEn: "Whey cheese (lor)", category: "dairy", kcal100: 90, protein100: 12, carb100: 3, fat100: 3.5, fiber100: 0, sugar100: 3, sodium100: 200, satFat100: 2.2, servings: [{ label: "1 porsiyon", grams: 100 }] },

  // ─── Temel — Baklagil (sade, pişmiş) ───────────────────────────────────────
  { name: "Haşlanmış Mercimek", nameEn: "Cooked lentils", category: "general", kcal100: 116, protein100: 9, carb100: 20, fat100: 0.4, fiber100: 8, sugar100: 1.8, sodium100: 2, satFat100: 0.1, servings: [{ label: "1 porsiyon", grams: 200 }] },
  { name: "Haşlanmış Nohut", nameEn: "Cooked chickpeas", category: "general", kcal100: 164, protein100: 8.9, carb100: 27, fat100: 2.6, fiber100: 7.6, sugar100: 4.7, sodium100: 7, satFat100: 0.3, servings: [{ label: "1 porsiyon", grams: 200 }] },

  // ─── Temel — Meyve ─────────────────────────────────────────────────────────
  { name: "Muz", nameEn: "Banana", category: "fruit", kcal100: 89, protein100: 1.1, carb100: 23, fat100: 0.3, fiber100: 2.6, sugar100: 12, sodium100: 1, satFat100: 0.1, servings: [{ label: "1 adet (orta)", grams: 120 }, { label: "1 adet (büyük)", grams: 150 }] },
  { name: "Elma", nameEn: "Apple", category: "fruit", kcal100: 52, protein100: 0.3, carb100: 14, fat100: 0.2, fiber100: 2.4, sugar100: 10, sodium100: 1, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 150 }, { label: "1 adet (küçük)", grams: 100 }] },
  { name: "Portakal", nameEn: "Orange", category: "fruit", kcal100: 47, protein100: 0.9, carb100: 12, fat100: 0.1, fiber100: 2.4, sugar100: 9, sodium100: 0, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 140 }] },

  // ─── Temel — Sebze ─────────────────────────────────────────────────────────
  { name: "Domates", nameEn: "Tomato", category: "vegetable", kcal100: 18, protein100: 0.9, carb100: 3.9, fat100: 0.2, fiber100: 1.2, sugar100: 2.6, sodium100: 5, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 120 }, { label: "1 dilim", grams: 20 }] },
  { name: "Salatalık", nameEn: "Cucumber", category: "vegetable", kcal100: 15, protein100: 0.7, carb100: 3.6, fat100: 0.1, fiber100: 0.5, sugar100: 1.7, sodium100: 2, satFat100: 0, servings: [{ label: "1 adet", grams: 150 }, { label: "1 yarım", grams: 75 }] },
  { name: "Avokado", nameEn: "Avocado", category: "fruit", kcal100: 160, protein100: 2, carb100: 8.5, fat100: 15, fiber100: 6.7, sugar100: 0.7, sodium100: 7, satFat100: 2.1, servings: [{ label: "1 adet", grams: 200 }, { label: "1 yarım", grams: 100 }] },

  // ─── Temel — Kuruyemiş & Yağ ───────────────────────────────────────────────
  { name: "Badem", nameEn: "Almonds", category: "nut", kcal100: 579, protein100: 21, carb100: 22, fat100: 50, fiber100: 12.5, sugar100: 4.4, sodium100: 1, satFat100: 3.8, servings: [{ label: "1 avuç (~20 adet)", grams: 30 }, { label: "1 adet", grams: 1.2 }] },
  { name: "Ceviz", nameEn: "Walnuts", category: "nut", kcal100: 654, protein100: 15, carb100: 14, fat100: 65, fiber100: 6.7, sugar100: 2.6, sodium100: 2, satFat100: 6.1, servings: [{ label: "1 avuç (~6 yarım)", grams: 30 }, { label: "1 adet (yarım ceviz)", grams: 2.5 }] },
  { name: "Yer Fıstığı", nameEn: "Peanuts (roasted)", category: "nut", kcal100: 587, protein100: 24, carb100: 21, fat100: 50, fiber100: 8.5, sugar100: 4.2, sodium100: 6, satFat100: 6.3, servings: [{ label: "1 avuç", grams: 30 }] },
  { name: "Fındık", nameEn: "Hazelnuts", category: "nut", kcal100: 628, protein100: 15, carb100: 17, fat100: 61, fiber100: 9.7, sugar100: 4.3, sodium100: 0, satFat100: 4.5, servings: [{ label: "1 avuç", grams: 30 }] },
  { name: "Antep Fıstığı", nameEn: "Pistachios (roasted)", category: "nut", kcal100: 560, protein100: 20, carb100: 28, fat100: 45, fiber100: 10, sugar100: 7.7, sodium100: 300, satFat100: 5.6, servings: [{ label: "1 avuç", grams: 25 }] },
  { name: "Siyah Zeytin", nameEn: "Black olives", category: "nut", kcal100: 115, protein100: 0.8, carb100: 6, fat100: 11, fiber100: 3.3, sugar100: 0, sodium100: 700, satFat100: 1.5, servings: [{ label: "1 porsiyon (5-6 adet)", grams: 30 }, { label: "1 adet", grams: 4 }] },
  { name: "Yeşil Zeytin", nameEn: "Green olives", category: "nut", kcal100: 145, protein100: 1, carb100: 4, fat100: 15, fiber100: 3.2, sugar100: 0, sodium100: 1400, satFat100: 2, servings: [{ label: "1 porsiyon (5-6 adet)", grams: 30 }, { label: "1 adet", grams: 4 }] },
  { name: "Tahin", nameEn: "Tahini (sesame paste)", category: "nut", kcal100: 595, protein100: 17, carb100: 21, fat100: 54, fiber100: 9.3, sugar100: 0.5, sodium100: 10, satFat100: 7.5, servings: [{ label: "1 yemek kaşığı", grams: 15 }] },
  { name: "Zeytinyağı", nameEn: "Olive oil", category: "general", kcal100: 884, protein100: 0, carb100: 0, fat100: 100, fiber100: 0, sugar100: 0, sodium100: 2, satFat100: 14, servings: [{ label: "1 yemek kaşığı", grams: 15 }, { label: "1 tatlı kaşığı", grams: 5 }] },
  { name: "Tereyağı", nameEn: "Butter", category: "dairy", kcal100: 717, protein100: 0.9, carb100: 0.1, fat100: 81, fiber100: 0, sugar100: 0.1, sodium100: 640, satFat100: 51, servings: [{ label: "1 yemek kaşığı", grams: 15 }, { label: "1 tatlı kaşığı", grams: 12 }] },

  // ─── Temel — Bal/Reçel & Takviye ───────────────────────────────────────────
  { name: "Bal", nameEn: "Honey", category: "general", kcal100: 304, protein100: 0.3, carb100: 82, fat100: 0, fiber100: 0.2, sugar100: 82, sodium100: 4, satFat100: 0, servings: [{ label: "1 yemek kaşığı", grams: 20 }, { label: "1 tatlı kaşığı", grams: 7 }] },
  { name: "Çilek Reçeli", nameEn: "Strawberry jam", category: "general", kcal100: 278, protein100: 0.4, carb100: 69, fat100: 0.1, fiber100: 1.1, sugar100: 65, sodium100: 20, satFat100: 0, servings: [{ label: "1 yemek kaşığı", grams: 20 }] },
  { name: "Whey Protein Tozu", nameEn: "Whey protein powder", category: "general", kcal100: 380, protein100: 75, carb100: 8, fat100: 4, fiber100: 1, sugar100: 4, sodium100: 250, satFat100: 1.5, servings: [{ label: "1 ölçek (scoop)", grams: 30 }, { label: "1 yemek kaşığı", grams: 15 }] },
];

async function main() {
  const existing = await prisma.food.count({ where: { source: "SEED" } });
  if (existing > 0) {
    console.log(`Found ${existing} existing SEED foods — refreshing (upsert by name)...`);
  }

  let servingCount = 0;
  for (const f of FOODS) {
    const data = {
      name: f.name,
      nameEn: f.nameEn,
      brand: null,
      source: "SEED",
      barcode: null,
      category: f.category,
      kcal100: f.kcal100,
      protein100: f.protein100,
      carb100: f.carb100,
      fat100: f.fat100,
      fiber100: f.fiber100,
      sugar100: f.sugar100,
      sodium100: f.sodium100,
      satFat100: f.satFat100,
      userId: null,
      isVerified: true,
      deletedAt: null,
    };

    const food = await prisma.food.findFirst({
      where: { name: f.name, source: "SEED" },
      select: { id: true },
    });

    if (food) {
      await prisma.food.update({ where: { id: food.id }, data });
      await prisma.serving.deleteMany({ where: { foodId: food.id } });
      await prisma.serving.createMany({
        data: f.servings.map((s) => ({ foodId: food.id, label: s.label, grams: s.grams })),
      });
    } else {
      await prisma.food.create({
        data: { ...data, servings: { create: f.servings } },
      });
    }
    servingCount += f.servings.length;
  }

  const totalFoods = await prisma.food.count({ where: { source: "SEED" } });
  const totalServings = await prisma.serving.count({
    where: { food: { source: "SEED" } },
  });

  console.log(`Seeded ${totalFoods} foods, ${totalServings} servings (source=SEED).`);
  if (totalServings !== servingCount) {
    console.warn(`Note: inserted ${servingCount} servings this run; DB now holds ${totalServings}.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
