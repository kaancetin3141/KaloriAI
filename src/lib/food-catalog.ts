/**
 * KaloriAI — SEED yemek kataloğu (tek doğruluk kaynağı).
 *
 * Hem `bun prisma/seed.ts` hem de uygulama içi self-healing tohumlama
 * (src/lib/demo.ts → loadSeedFoods) bu modülü kullanır. Böylece boş bir
 * veritabanında demo hesaplar da kendini otomatik onarabilir.
 *
 * Per-100g değerleri gerçekçi tahminlerdir (TÜİK/USDA/tipik TR porsiyonları).
 */
import type { PrismaClient } from "@prisma/client";

export interface SeedServing {
  label: string;
  grams: number;
}

export interface SeedFood {
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

export const SEED_FOODS: SeedFood[] = [

  // ─── Türk Mutfağı — Ana Yemekler ───────────────────────────────────────────
  { name: "Mantı", nameEn: "Turkish dumplings with yogurt", category: "turkish_cuisine", kcal100: 175, protein100: 8, carb100: 22, fat100: 6.5, fiber100: 1.2, sugar100: 2, sodium100: 280, satFat100: 2.5, servings: [{ label: "1 porsiyon", grams: 300 }, { label: "1 kaşık", grams: 30 }] },
  { name: "Lahmacun", nameEn: "Turkish pizza", category: "turkish_cuisine", kcal100: 250, protein100: 11, carb100: 32, fat100: 8.5, fiber100: 1.5, sugar100: 2, sodium100: 480, satFat100: 3, servings: [{ label: "1 adet", grams: 125 }, { label: "1 adet (çeşni taşımaz, ince)", grams: 110 }] },
  { name: "Su Böreği", nameEn: "Water börek (layered pastry)", category: "turkish_cuisine", kcal100: 290, protein100: 7, carb100: 30, fat100: 15, fiber100: 1, sugar100: 1.5, sodium100: 400, satFat100: 7, servings: [{ label: "1 dilim", grams: 120 }, { label: "1 porsiyon", grams: 200 }] },
  { name: "Patatesli Börek", nameEn: "Potato börek", category: "turkish_cuisine", kcal100: 240, protein100: 6, carb100: 28, fat100: 11, fiber100: 2, sugar100: 2, sodium100: 380, satFat100: 4, servings: [{ label: "1 dilim", grams: 100 }, { label: "1 porsiyon", grams: 180 }] },
  { name: "Peynirli Börek", nameEn: "Cheese börek", category: "turkish_cuisine", kcal100: 265, protein100: 9.5, carb100: 26, fat100: 13, fiber100: 1.2, sugar100: 1.5, sodium100: 450, satFat100: 5.5, servings: [{ label: "1 dilim", grams: 100 }, { label: "1 porsiyon", grams: 180 }] },
  { name: "Ispanaklı Börek", nameEn: "Spinach börek", category: "turkish_cuisine", kcal100: 220, protein100: 6.5, carb100: 26, fat100: 10, fiber100: 2.2, sugar100: 1.5, sodium100: 380, satFat100: 4, servings: [{ label: "1 dilim", grams: 100 }, { label: "1 porsiyon", grams: 180 }] },
  { name: "Kıymalı Börek", nameEn: "Minced meat börek", category: "turkish_cuisine", kcal100: 270, protein100: 9, carb100: 27, fat100: 13.5, fiber100: 1.2, sugar100: 1.5, sodium100: 460, satFat100: 5.5, servings: [{ label: "1 dilim", grams: 100 }, { label: "1 porsiyon", grams: 180 }] },
  { name: "Çiğ Börek (Tatar Böreği)", nameEn: "Fried meat pastry (Tatar böreği)", category: "turkish_cuisine", kcal100: 270, protein100: 11, carb100: 28, fat100: 13, fiber100: 1, sugar100: 1, sodium100: 420, satFat100: 5, servings: [{ label: "1 adet", grams: 120 }] },
  { name: "Kuşbaşılı Pide", nameEn: "Pide with diced meat", category: "turkish_cuisine", kcal100: 240, protein100: 12, carb100: 30, fat100: 8, fiber100: 1.5, sugar100: 2, sodium100: 470, satFat100: 3.2, servings: [{ label: "1 adet", grams: 250 }, { label: "1 yarım", grams: 125 }] },
  { name: "Kaşarlı Pide", nameEn: "Cheese pide", category: "turkish_cuisine", kcal100: 270, protein100: 13, carb100: 29, fat100: 11, fiber100: 1.5, sugar100: 2, sodium100: 520, satFat100: 5.5, servings: [{ label: "1 adet", grams: 250 }, { label: "1 yarım", grams: 125 }] },
  { name: "Adana Kebap", nameEn: "Adana kebab", category: "turkish_cuisine", kcal100: 230, protein100: 17, carb100: 2, fat100: 17, fiber100: 0.3, sugar100: 1, sodium100: 550, satFat100: 7, servings: [{ label: "1 porsiyon", grams: 180 }, { label: "1 şiş", grams: 100 }] },
  { name: "Urfa Kebap", nameEn: "Urfa kebab (mild)", category: "turkish_cuisine", kcal100: 220, protein100: 17.5, carb100: 2, fat100: 16, fiber100: 0.3, sugar100: 1, sodium100: 530, satFat100: 6.5, servings: [{ label: "1 porsiyon", grams: 180 }, { label: "1 şiş", grams: 100 }] },
  { name: "Et Döner", nameEn: "Beef döner", category: "turkish_cuisine", kcal100: 230, protein100: 16, carb100: 4, fat100: 16, fiber100: 0.5, sugar100: 1.5, sodium100: 600, satFat100: 6, servings: [{ label: "1 porsiyon", grams: 200 }, { label: "1 dürüm", grams: 250 }, { label: "1 dilim", grams: 50 }] },
  { name: "Tavuk Döner", nameEn: "Chicken döner", category: "turkish_cuisine", kcal100: 180, protein100: 18, carb100: 3, fat100: 10, fiber100: 0.5, sugar100: 1.5, sodium100: 600, satFat100: 2.5, servings: [{ label: "1 porsiyon", grams: 200 }, { label: "1 dürüm", grams: 250 }, { label: "1 dilim", grams: 50 }] },
  { name: "Kuzu Şiş Kebap", nameEn: "Lamb shish kebab", category: "turkish_cuisine", kcal100: 210, protein100: 20, carb100: 1.5, fat100: 13, fiber100: 0.2, sugar100: 0.8, sodium100: 420, satFat100: 5.5, servings: [{ label: "1 porsiyon", grams: 180 }, { label: "1 şiş", grams: 90 }] },
  { name: "Şiş Tavuk", nameEn: "Chicken shish kebab", category: "turkish_cuisine", kcal100: 150, protein100: 24, carb100: 1.5, fat100: 5, fiber100: 0.2, sugar100: 0.8, sodium100: 400, satFat100: 1.3, servings: [{ label: "1 porsiyon", grams: 180 }, { label: "1 şiş", grams: 90 }] },
  { name: "İskender Kebap", nameEn: "Iskender kebab", category: "turkish_cuisine", kcal100: 190, protein100: 13, carb100: 10, fat100: 12, fiber100: 0.8, sugar100: 3, sodium100: 420, satFat100: 5, servings: [{ label: "1 porsiyon", grams: 350 }] },
  { name: "Alinazik", nameEn: "Alinazik kebab (eggplant purée with lamb)", category: "turkish_cuisine", kcal100: 140, protein100: 9, carb100: 6, fat100: 9, fiber100: 2, sugar100: 3, sodium100: 380, satFat100: 3.8, servings: [{ label: "1 porsiyon", grams: 300 }] },
  { name: "Beyti Sarma", nameEn: "Beyti kebab wrapped in lavaş", category: "turkish_cuisine", kcal100: 210, protein100: 14, carb100: 15, fat100: 10.5, fiber100: 1, sugar100: 3, sodium100: 480, satFat100: 4.5, servings: [{ label: "1 porsiyon", grams: 350 }] },
  { name: "Çağ Kebabı", nameEn: "Çağ kebab (lamb on horizontal skewer)", category: "turkish_cuisine", kcal100: 230, protein100: 19, carb100: 1.5, fat100: 16.5, fiber100: 0.2, sugar100: 0.8, sodium100: 450, satFat100: 7, servings: [{ label: "1 porsiyon", grams: 200 }, { label: "1 şiş", grams: 50 }] },
  { name: "Karışık Izgara", nameEn: "Mixed grill platter", category: "turkish_cuisine", kcal100: 210, protein100: 18, carb100: 5, fat100: 13, fiber100: 0.6, sugar100: 1.5, sodium100: 480, satFat100: 5, servings: [{ label: "1 porsiyon", grams: 400 }] },
  { name: "Izgara Köfte", nameEn: "Grilled meatballs", category: "turkish_cuisine", kcal100: 240, protein100: 17, carb100: 6, fat100: 16, fiber100: 0.5, sugar100: 1, sodium100: 480, satFat100: 6, servings: [{ label: "1 adet", grams: 40 }, { label: "1 porsiyon (4 adet)", grams: 160 }] },
  { name: "Sac Kavurma", nameEn: "Sac kavurma (sautéed diced meat)", category: "turkish_cuisine", kcal100: 200, protein100: 17, carb100: 4, fat100: 13, fiber100: 0.8, sugar100: 2, sodium100: 420, satFat100: 5.5, servings: [{ label: "1 porsiyon", grams: 250 }] },
  { name: "Tavuk Kanat (Izgara)", nameEn: "Grilled chicken wings", category: "meat", kcal100: 225, protein100: 23, carb100: 1.5, fat100: 14, fiber100: 0, sugar100: 0.5, sodium100: 480, satFat100: 4.2, servings: [{ label: "1 porsiyon (6 adet)", grams: 300 }, { label: "1 adet", grams: 50 }] },
  { name: "İçli Köfte", nameEn: "Stuffed bulgur kofte (meat filled)", category: "turkish_cuisine", kcal100: 200, protein100: 9, carb100: 20, fat100: 9.5, fiber100: 2.5, sugar100: 1.5, sodium100: 350, satFat100: 3.5, servings: [{ label: "1 adet", grams: 60 }, { label: "1 porsiyon (3 adet)", grams: 180 }] },
  { name: "Mercimek Köftesi", nameEn: "Red lentil kofte", category: "turkish_cuisine", kcal100: 150, protein100: 6, carb100: 21, fat100: 4.5, fiber100: 4.5, sugar100: 2, sodium100: 300, satFat100: 0.7, servings: [{ label: "1 adet", grams: 25 }, { label: "1 porsiyon", grams: 200 }] },
  { name: "Etli Güveç", nameEn: "Meat güveç (casserole)", category: "turkish_cuisine", kcal100: 130, protein100: 9, carb100: 8, fat100: 7, fiber100: 1.5, sugar100: 2.5, sodium100: 380, satFat100: 2.8, servings: [{ label: "1 güveç", grams: 300 }] },
  { name: "Testi Kebabı", nameEn: "Testi kebab (clay pot casserole)", category: "turkish_cuisine", kcal100: 125, protein100: 9, carb100: 7, fat100: 7, fiber100: 1.5, sugar100: 3, sodium100: 350, satFat100: 2.8, servings: [{ label: "1 testi (porsiyon)", grams: 400 }] },
  { name: "Karnıyarık", nameEn: "Stuffed eggplant with meat", category: "turkish_cuisine", kcal100: 130, protein100: 6.5, carb100: 10, fat100: 7, fiber100: 2.5, sugar100: 4, sodium100: 350, satFat100: 2.5, servings: [{ label: "1 adet", grams: 200 }, { label: "1 porsiyon (2 adet)", grams: 400 }] },
  { name: "Hünkar Beğendi", nameEn: "Sultan's delight (eggplant purée with meat)", category: "turkish_cuisine", kcal100: 130, protein100: 7.5, carb100: 7, fat100: 8, fiber100: 1.5, sugar100: 2.5, sodium100: 320, satFat100: 3.5, servings: [{ label: "1 porsiyon", grams: 300 }] },
  { name: "Kabak Mücveri", nameEn: "Zucchini fritters", category: "turkish_cuisine", kcal100: 165, protein100: 5.5, carb100: 11, fat100: 11, fiber100: 1.5, sugar100: 2.5, sodium100: 350, satFat100: 2.8, servings: [{ label: "1 adet", grams: 40 }, { label: "1 porsiyon (4 adet)", grams: 160 }] },
  { name: "Bamya Yemeği", nameEn: "Okra stew with meat", category: "turkish_cuisine", kcal100: 90, protein100: 5, carb100: 8, fat100: 4.5, fiber100: 2.5, sugar100: 3, sodium100: 300, satFat100: 1.5, servings: [{ label: "1 porsiyon", grams: 250 }] },
  { name: "Pırasa Yemeği", nameEn: "Leek stew (olive oil)", category: "turkish_cuisine", kcal100: 70, protein100: 1.5, carb100: 8, fat100: 3.5, fiber100: 2.2, sugar100: 3.5, sodium100: 250, satFat100: 0.5, servings: [{ label: "1 porsiyon", grams: 200 }] },
  { name: "Etli Biber Dolması", nameEn: "Stuffed green peppers with meat", category: "turkish_cuisine", kcal100: 120, protein100: 6, carb100: 12, fat100: 5, fiber100: 2, sugar100: 3.5, sodium100: 340, satFat100: 2, servings: [{ label: "1 adet", grams: 150 }, { label: "1 porsiyon (2 adet)", grams: 300 }] },
  { name: "Zeytinyağlı Yaprak Sarma", nameEn: "Stuffed vine leaves (olive oil)", category: "turkish_cuisine", kcal100: 135, protein100: 2.5, carb100: 16, fat100: 7, fiber100: 2.5, sugar100: 2, sodium100: 350, satFat100: 1, servings: [{ label: "1 porsiyon", grams: 200 }, { label: "1 adet", grams: 30 }] },
  { name: "Etli Yaprak Sarma", nameEn: "Stuffed vine leaves with meat", category: "turkish_cuisine", kcal100: 150, protein100: 6.5, carb100: 13, fat100: 8, fiber100: 2, sugar100: 1.5, sodium100: 380, satFat100: 2.5, servings: [{ label: "1 porsiyon", grams: 250 }, { label: "1 adet", grams: 30 }] },
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
  { name: "Kumru", nameEn: "Kumru sandwich (sucuk & kaşar)", category: "turkish_cuisine", kcal100: 265, protein100: 12, carb100: 30, fat100: 11, fiber100: 1.5, sugar100: 3, sodium100: 620, satFat100: 4.5, servings: [{ label: "1 adet", grams: 250 }] },
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
  { name: "Kadayıf", nameEn: "Kadayıf (shredded pastry in syrup)", category: "turkish_cuisine", kcal100: 350, protein100: 5.5, carb100: 47, fat100: 15.5, fiber100: 1.5, sugar100: 27, sodium100: 150, satFat100: 6, servings: [{ label: "1 dilim", grams: 100 }, { label: "1 porsiyon", grams: 150 }] },
  { name: "Tulumba Tatlısı", nameEn: "Tulumba dessert (fried dough in syrup)", category: "turkish_cuisine", kcal100: 320, protein100: 3.5, carb100: 52, fat100: 11, fiber100: 0.8, sugar100: 32, sodium100: 120, satFat100: 4, servings: [{ label: "1 adet", grams: 30 }, { label: "1 porsiyon (4 adet)", grams: 120 }] },
  { name: "Revani", nameEn: "Revani (semolina cake in syrup)", category: "turkish_cuisine", kcal100: 295, protein100: 5, carb100: 50, fat100: 8.5, fiber100: 0.8, sugar100: 30, sodium100: 130, satFat100: 3.5, servings: [{ label: "1 dilim", grams: 80 }] },
  { name: "Kemalpaşa Tatlısı", nameEn: "Kemalpaşa dessert (cheese semolina in syrup)", category: "turkish_cuisine", kcal100: 345, protein100: 7, carb100: 52, fat100: 12, fiber100: 1, sugar100: 35, sodium100: 200, satFat100: 5.5, servings: [{ label: "1 adet", grams: 20 }, { label: "1 porsiyon (5 adet)", grams: 100 }] },
  { name: "Lokma", nameEn: "Lokma (fried dough balls in syrup)", category: "turkish_cuisine", kcal100: 335, protein100: 4, carb100: 50, fat100: 13, fiber100: 0.7, sugar100: 30, sodium100: 130, satFat100: 4.5, servings: [{ label: "1 adet", grams: 15 }, { label: "1 porsiyon (10 adet)", grams: 150 }] },
  { name: "Aşure", nameEn: "Aşure (wheat pudding with fruits & nuts)", category: "turkish_cuisine", kcal100: 140, protein100: 3.5, carb100: 25, fat100: 3, fiber100: 2.5, sugar100: 14, sodium100: 40, satFat100: 0.5, servings: [{ label: "1 kase", grams: 250 }] },
  { name: "Güllaç", nameEn: "Güllaç (milk dessert with rosewater)", category: "turkish_cuisine", kcal100: 115, protein100: 2.5, carb100: 20, fat100: 2.8, fiber100: 0.3, sugar100: 15, sodium100: 45, satFat100: 1.4, servings: [{ label: "1 dilim", grams: 150 }] },
  { name: "Kabak Tatlısı", nameEn: "Candied pumpkin dessert", category: "turkish_cuisine", kcal100: 115, protein100: 0.8, carb100: 25, fat100: 1.5, fiber100: 1.5, sugar100: 20, sodium100: 25, satFat100: 0.2, servings: [{ label: "1 porsiyon", grams: 150 }] },
  { name: "Ayva Tatlısı", nameEn: "Candied quince dessert", category: "turkish_cuisine", kcal100: 110, protein100: 0.5, carb100: 26, fat100: 0.3, fiber100: 2, sugar100: 22, sodium100: 10, satFat100: 0.1, servings: [{ label: "1 porsiyon (yarım ayva)", grams: 150 }] },
  { name: "Dondurma (Vanilyalı)", nameEn: "Vanilla ice cream", category: "dairy", kcal100: 207, protein100: 3.5, carb100: 24, fat100: 11, fiber100: 0, sugar100: 21, sodium100: 80, satFat100: 7, servings: [{ label: "1 küre (top)", grams: 50 }, { label: "1 porsiyon (2 küre)", grams: 100 }] },

  // ─── Türk Mutfağı — İçecekler ──────────────────────────────────────────────
  { name: "Ayran", nameEn: "Ayran (yogurt drink)", category: "drink", kcal100: 37, protein100: 1.9, carb100: 3, fat100: 1.8, fiber100: 0, sugar100: 3, sodium100: 90, satFat100: 1.1, servings: [{ label: "1 bardak", grams: 200 }, { label: "1 küçük bardak", grams: 100 }] },
  { name: "Şalgam Suyu", nameEn: "Turnip juice (şalgam)", category: "drink", kcal100: 25, protein100: 0.5, carb100: 5.5, fat100: 0.1, fiber100: 0.3, sugar100: 4, sodium100: 450, satFat100: 0, servings: [{ label: "1 bardak", grams: 200 }] },
  { name: "Limonata", nameEn: "Lemonade", category: "drink", kcal100: 40, protein100: 0.1, carb100: 10, fat100: 0, fiber100: 0, sugar100: 9.5, sodium100: 10, satFat100: 0, servings: [{ label: "1 bardak", grams: 200 }] },
  { name: "Türk Kahvesi (sade)", nameEn: "Turkish coffee (plain)", category: "drink", kcal100: 4, protein100: 0.1, carb100: 0.7, fat100: 0.1, fiber100: 0, sugar100: 0, sodium100: 2, satFat100: 0, servings: [{ label: "1 fincan", grams: 70 }] },
  { name: "Türk Kahvesi (orta şekerli)", nameEn: "Turkish coffee (medium sugar)", category: "drink", kcal100: 20, protein100: 0.1, carb100: 5, fat100: 0.1, fiber100: 0, sugar100: 4.8, sodium100: 2, satFat100: 0, servings: [{ label: "1 fincan", grams: 70 }] },
  { name: "Çay (sade)", nameEn: "Turkish tea (plain)", category: "drink", kcal100: 1, protein100: 0, carb100: 0.2, fat100: 0, fiber100: 0, sugar100: 0, sodium100: 1, satFat100: 0, servings: [{ label: "1 bardak (ince belli)", grams: 100 }, { label: "1 büyük bardak", grams: 200 }] },
  { name: "Sahlep", nameEn: "Salep drink (hot milk with orchid root)", category: "drink", kcal100: 130, protein100: 3, carb100: 19, fat100: 4.5, fiber100: 0.3, sugar100: 14, sodium100: 50, satFat100: 2.3, servings: [{ label: "1 bardak", grams: 250 }] },
  { name: "Boza", nameEn: "Boza (fermented millet drink)", category: "drink", kcal100: 90, protein100: 1.8, carb100: 19, fat100: 0.6, fiber100: 0.5, sugar100: 14, sodium100: 20, satFat100: 0.1, servings: [{ label: "1 bardak", grams: 250 }] },
  { name: "Vişne Suyu", nameEn: "Sour cherry juice", category: "drink", kcal100: 52, protein100: 0.4, carb100: 12.5, fat100: 0.1, fiber100: 0, sugar100: 12, sodium100: 8, satFat100: 0, servings: [{ label: "1 bardak", grams: 200 }] },
  { name: "Portakal Suyu (Taze)", nameEn: "Fresh orange juice", category: "drink", kcal100: 45, protein100: 0.7, carb100: 10.4, fat100: 0.2, fiber100: 0.2, sugar100: 8.4, sodium100: 1, satFat100: 0, servings: [{ label: "1 bardak", grams: 200 }, { label: "1 küçük bardak", grams: 150 }] },
  { name: "Kola", nameEn: "Cola (regular)", category: "drink", kcal100: 42, protein100: 0, carb100: 10.6, fat100: 0, fiber100: 0, sugar100: 10.6, sodium100: 4, satFat100: 0, servings: [{ label: "1 kutu (330 ml)", grams: 330 }, { label: "1 bardak", grams: 250 }] },
  { name: "Diyet Kola", nameEn: "Diet cola", category: "drink", kcal100: 0.4, protein100: 0, carb100: 0, fat100: 0, fiber100: 0, sugar100: 0, sodium100: 10, satFat100: 0, servings: [{ label: "1 kutu (330 ml)", grams: 330 }] },
  { name: "Enerji İçeceği", nameEn: "Energy drink", category: "drink", kcal100: 45, protein100: 0.4, carb100: 11, fat100: 0, fiber100: 0, sugar100: 11, sodium100: 40, satFat100: 0, servings: [{ label: "1 kutu (250 ml)", grams: 250 }] },

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
  { name: "Izgara Hindi Göğsü", nameEn: "Grilled turkey breast", category: "meat", kcal100: 135, protein100: 30, carb100: 0, fat100: 1.3, fiber100: 0, sugar100: 0, sodium100: 65, satFat100: 0.4, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 dilim", grams: 50 }] },
  { name: "Dana Kıyma (orta yağlı)", nameEn: "Ground beef (medium fat, raw)", category: "meat", kcal100: 250, protein100: 17.5, carb100: 0, fat100: 20, fiber100: 0, sugar100: 0, sodium100: 75, satFat100: 8, servings: [{ label: "1 porsiyon", grams: 150 }] },
  { name: "Dana Kuşbaşı", nameEn: "Diced beef (raw)", category: "meat", kcal100: 190, protein100: 19.5, carb100: 0, fat100: 12, fiber100: 0, sugar100: 0, sodium100: 60, satFat100: 5, servings: [{ label: "1 porsiyon", grams: 150 }] },
  { name: "Izgara Dana Biftek", nameEn: "Grilled beef steak", category: "meat", kcal100: 250, protein100: 26, carb100: 0, fat100: 16, fiber100: 0, sugar100: 0, sodium100: 70, satFat100: 6.5, servings: [{ label: "1 porsiyon", grams: 200 }, { label: "1 dilim", grams: 100 }] },
  { name: "Kuzu Pirzola", nameEn: "Lamb chops", category: "meat", kcal100: 280, protein100: 25, carb100: 0, fat100: 20, fiber100: 0, sugar100: 0, sodium100: 80, satFat100: 9, servings: [{ label: "1 adet", grams: 100 }, { label: "1 porsiyon (2 adet)", grams: 200 }] },
  { name: "Sucuk", nameEn: "Turkish sausage", category: "meat", kcal100: 460, protein100: 17, carb100: 1.5, fat100: 42, fiber100: 0, sugar100: 0.5, sodium100: 1600, satFat100: 17, servings: [{ label: "1 dilim", grams: 15 }, { label: "1 porsiyon (sahanda)", grams: 60 }] },
  { name: "Pastırma", nameEn: "Turkish cured beef (pastrami)", category: "meat", kcal100: 200, protein100: 25, carb100: 1, fat100: 10.5, fiber100: 0, sugar100: 0.5, sodium100: 2600, satFat100: 4.2, servings: [{ label: "1 dilim", grams: 15 }, { label: "1 porsiyon (kahvaltı)", grams: 60 }] },
  { name: "Kavurma (Kuzu)", nameEn: "Lamb kavurma (sautéed in own fat)", category: "meat", kcal100: 300, protein100: 22, carb100: 0, fat100: 23, fiber100: 0, sugar100: 0, sodium100: 450, satFat100: 10, servings: [{ label: "1 porsiyon", grams: 120 }] },
  { name: "Izgara Somon", nameEn: "Grilled salmon", category: "meat", kcal100: 208, protein100: 20, carb100: 0, fat100: 13, fiber100: 0, sugar100: 0, sodium100: 59, satFat100: 3.1, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 dilim", grams: 100 }] },
  { name: "Izgara Levrek", nameEn: "Grilled sea bass", category: "meat", kcal100: 125, protein100: 20, carb100: 0, fat100: 4.5, fiber100: 0, sugar100: 0, sodium100: 90, satFat100: 1, servings: [{ label: "1 porsiyon (fileto)", grams: 200 }] },
  { name: "Ton Balığı Konserve (suda)", nameEn: "Canned tuna in water", category: "meat", kcal100: 116, protein100: 26, carb100: 0, fat100: 1, fiber100: 0, sugar100: 0, sodium100: 350, satFat100: 0.3, servings: [{ label: "1 kutu (süzülmüş)", grams: 80 }] },
  { name: "Izgara Kalamar", nameEn: "Grilled calamari", category: "meat", kcal100: 110, protein100: 17, carb100: 3.5, fat100: 3.2, fiber100: 0, sugar100: 0, sodium100: 320, satFat100: 0.8, servings: [{ label: "1 porsiyon", grams: 200 }] },
  { name: "Haşlanmış Karides", nameEn: "Boiled shrimp", category: "meat", kcal100: 99, protein100: 24, carb100: 0.2, fat100: 0.3, fiber100: 0, sugar100: 0, sodium100: 111, satFat100: 0.1, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 adet (orta)", grams: 15 }] },
  { name: "Haşlanmış Midye", nameEn: "Boiled mussels", category: "meat", kcal100: 172, protein100: 24, carb100: 7.4, fat100: 4.5, fiber100: 0, sugar100: 0, sodium100: 370, satFat100: 0.9, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 adet (et)", grams: 15 }] },

  // ─── Temel — Süt Ürünleri ──────────────────────────────────────────────────
  { name: "Süt (tam yağlı)", nameEn: "Whole milk", category: "dairy", kcal100: 64, protein100: 3.3, carb100: 4.8, fat100: 3.5, fiber100: 0, sugar100: 4.8, sodium100: 43, satFat100: 2.3, servings: [{ label: "1 bardak", grams: 200 }] },
  { name: "Süt (yarım yağlı)", nameEn: "Semi-skimmed milk", category: "dairy", kcal100: 52, protein100: 3.4, carb100: 5, fat100: 1.5, fiber100: 0, sugar100: 5, sodium100: 45, satFat100: 0.9, servings: [{ label: "1 bardak", grams: 200 }] },
  { name: "Kefir", nameEn: "Kefir", category: "dairy", kcal100: 60, protein100: 3.3, carb100: 4.5, fat100: 3.3, fiber100: 0, sugar100: 4.4, sodium100: 40, satFat100: 2.1, servings: [{ label: "1 bardak", grams: 250 }] },
  { name: "Yoğurt (sade, tam yağlı)", nameEn: "Plain whole yogurt", category: "dairy", kcal100: 90, protein100: 3.5, carb100: 4.7, fat100: 4.8, fiber100: 0, sugar100: 4.7, sodium100: 55, satFat100: 3, servings: [{ label: "1 kase", grams: 200 }, { label: "1 yemek kaşığı", grams: 25 }] },
  { name: "Süzme Yoğurt", nameEn: "Strained yogurt", category: "dairy", kcal100: 110, protein100: 8, carb100: 4, fat100: 7, fiber100: 0, sugar100: 4, sodium100: 50, satFat100: 4.5, servings: [{ label: "1 kase", grams: 200 }, { label: "1 yemek kaşığı", grams: 25 }] },
  { name: "Labne", nameEn: "Labne (cream cheese spread)", category: "dairy", kcal100: 253, protein100: 6, carb100: 4, fat100: 24, fiber100: 0, sugar100: 4, sodium100: 300, satFat100: 15, servings: [{ label: "1 yemek kaşığı", grams: 25 }, { label: "1 kase", grams: 100 }] },
  { name: "Beyaz Peynir", nameEn: "White brined cheese (feta)", category: "dairy", kcal100: 264, protein100: 17, carb100: 1.9, fat100: 21, fiber100: 0, sugar100: 1.5, sodium100: 1100, satFat100: 13, servings: [{ label: "1 dilim", grams: 30 }, { label: "1 kibrit kutusu", grams: 50 }] },
  { name: "Kaşar Peyniri", nameEn: "Kashar cheese", category: "dairy", kcal100: 330, protein100: 25, carb100: 2, fat100: 25, fiber100: 0, sugar100: 1.5, sodium100: 700, satFat100: 16, servings: [{ label: "1 dilim", grams: 20 }, { label: "1 porsiyon", grams: 50 }] },
  { name: "Krem Peynir", nameEn: "Cream cheese", category: "dairy", kcal100: 342, protein100: 6, carb100: 4.1, fat100: 34, fiber100: 0, sugar100: 3.2, sodium100: 321, satFat100: 20, servings: [{ label: "1 tatlı kaşığı (sürme)", grams: 15 }, { label: "1 yemek kaşığı", grams: 30 }] },
  { name: "Lor Peyniri", nameEn: "Whey cheese (lor)", category: "dairy", kcal100: 90, protein100: 12, carb100: 3, fat100: 3.5, fiber100: 0, sugar100: 3, sodium100: 200, satFat100: 2.2, servings: [{ label: "1 porsiyon", grams: 100 }] },

  // ─── Temel — Baklagil (sade, pişmiş) ───────────────────────────────────────
  { name: "Haşlanmış Mercimek", nameEn: "Cooked lentils", category: "general", kcal100: 116, protein100: 9, carb100: 20, fat100: 0.4, fiber100: 8, sugar100: 1.8, sodium100: 2, satFat100: 0.1, servings: [{ label: "1 porsiyon", grams: 200 }] },
  { name: "Haşlanmış Nohut", nameEn: "Cooked chickpeas", category: "general", kcal100: 164, protein100: 8.9, carb100: 27, fat100: 2.6, fiber100: 7.6, sugar100: 4.7, sodium100: 7, satFat100: 0.3, servings: [{ label: "1 porsiyon", grams: 200 }] },

  // ─── Temel — Meyve ─────────────────────────────────────────────────────────
  { name: "Muz", nameEn: "Banana", category: "fruit", kcal100: 89, protein100: 1.1, carb100: 23, fat100: 0.3, fiber100: 2.6, sugar100: 12, sodium100: 1, satFat100: 0.1, servings: [{ label: "1 adet (orta)", grams: 120 }, { label: "1 adet (büyük)", grams: 150 }] },
  { name: "Elma", nameEn: "Apple", category: "fruit", kcal100: 52, protein100: 0.3, carb100: 14, fat100: 0.2, fiber100: 2.4, sugar100: 10, sodium100: 1, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 150 }, { label: "1 adet (küçük)", grams: 100 }] },
  { name: "Portakal", nameEn: "Orange", category: "fruit", kcal100: 47, protein100: 0.9, carb100: 12, fat100: 0.1, fiber100: 2.4, sugar100: 9, sodium100: 0, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 140 }] },
  { name: "Karpuz", nameEn: "Watermelon", category: "fruit", kcal100: 30, protein100: 0.6, carb100: 7.6, fat100: 0.2, fiber100: 0.4, sugar100: 6.2, sodium100: 1, satFat100: 0, servings: [{ label: "1 dilim", grams: 300 }, { label: "1 kase (küp doğranmış)", grams: 200 }] },
  { name: "Kavun", nameEn: "Cantaloupe", category: "fruit", kcal100: 34, protein100: 0.8, carb100: 8.2, fat100: 0.2, fiber100: 0.9, sugar100: 7.9, sodium100: 16, satFat100: 0, servings: [{ label: "1 dilim", grams: 150 }, { label: "1 kase", grams: 200 }] },
  { name: "Şeftali", nameEn: "Peach", category: "fruit", kcal100: 39, protein100: 0.9, carb100: 9.5, fat100: 0.3, fiber100: 1.5, sugar100: 8.4, sodium100: 0, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 150 }] },
  { name: "Kiraz", nameEn: "Sweet cherries", category: "fruit", kcal100: 63, protein100: 1.1, carb100: 16, fat100: 0.2, fiber100: 2.1, sugar100: 12.8, sodium100: 0, satFat100: 0, servings: [{ label: "1 kase", grams: 150 }, { label: "1 avuç (~15 adet)", grams: 100 }] },
  { name: "Vişne", nameEn: "Sour cherries", category: "fruit", kcal100: 50, protein100: 1, carb100: 12.2, fat100: 0.3, fiber100: 1.6, sugar100: 8.5, sodium100: 2, satFat100: 0, servings: [{ label: "1 kase", grams: 150 }] },
  { name: "Kayısı", nameEn: "Apricots (fresh)", category: "fruit", kcal100: 48, protein100: 1.4, carb100: 11.1, fat100: 0.4, fiber100: 2, sugar100: 9.2, sodium100: 1, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 40 }, { label: "1 kase", grams: 200 }] },
  { name: "İncir", nameEn: "Fresh figs", category: "fruit", kcal100: 74, protein100: 0.8, carb100: 19.2, fat100: 0.3, fiber100: 2.9, sugar100: 16.3, sodium100: 1, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 50 }] },
  { name: "Üzüm", nameEn: "Grapes", category: "fruit", kcal100: 69, protein100: 0.7, carb100: 18.1, fat100: 0.2, fiber100: 0.9, sugar100: 15.5, sodium100: 2, satFat100: 0, servings: [{ label: "1 kase (salkım)", grams: 150 }, { label: "1 avuç", grams: 80 }] },
  { name: "Nar", nameEn: "Pomegranate (arils)", category: "fruit", kcal100: 83, protein100: 1.7, carb100: 18.7, fat100: 1.2, fiber100: 4, sugar100: 13.7, sodium100: 3, satFat100: 0.1, servings: [{ label: "1 adet (taneleri)", grams: 180 }, { label: "1 kase", grams: 150 }] },
  { name: "Ayva", nameEn: "Quince", category: "fruit", kcal100: 57, protein100: 0.4, carb100: 15.3, fat100: 0.1, fiber100: 1.9, sugar100: 8.9, sodium100: 2, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 250 }, { label: "1 dilim", grams: 50 }] },
  { name: "Dut", nameEn: "Mulberries", category: "fruit", kcal100: 43, protein100: 1.4, carb100: 9.8, fat100: 0.4, fiber100: 1.7, sugar100: 8.1, sodium100: 10, satFat100: 0, servings: [{ label: "1 kase", grams: 150 }] },

  // ─── Temel — Sebze ─────────────────────────────────────────────────────────
  { name: "Domates", nameEn: "Tomato", category: "vegetable", kcal100: 18, protein100: 0.9, carb100: 3.9, fat100: 0.2, fiber100: 1.2, sugar100: 2.6, sodium100: 5, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 120 }, { label: "1 dilim", grams: 20 }] },
  { name: "Salatalık", nameEn: "Cucumber", category: "vegetable", kcal100: 15, protein100: 0.7, carb100: 3.6, fat100: 0.1, fiber100: 0.5, sugar100: 1.7, sodium100: 2, satFat100: 0, servings: [{ label: "1 adet", grams: 150 }, { label: "1 yarım", grams: 75 }] },
  { name: "Patlıcan", nameEn: "Eggplant (raw)", category: "vegetable", kcal100: 25, protein100: 1, carb100: 5.9, fat100: 0.2, fiber100: 3, sugar100: 3.5, sodium100: 2, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 300 }, { label: "1 dilim", grams: 30 }] },
  { name: "Kabak", nameEn: "Zucchini (raw)", category: "vegetable", kcal100: 17, protein100: 1.2, carb100: 3.1, fat100: 0.3, fiber100: 1, sugar100: 2.5, sodium100: 8, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 200 }] },
  { name: "Havuç", nameEn: "Carrot", category: "vegetable", kcal100: 41, protein100: 0.9, carb100: 9.6, fat100: 0.2, fiber100: 2.8, sugar100: 4.7, sodium100: 69, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 80 }] },
  { name: "Soğan", nameEn: "Onion (raw)", category: "vegetable", kcal100: 40, protein100: 1.1, carb100: 9.3, fat100: 0.1, fiber100: 1.7, sugar100: 4.2, sodium100: 4, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 110 }, { label: "1 yemek kaşığı (doğranmış)", grams: 15 }] },
  { name: "Yeşil Biber", nameEn: "Green pepper", category: "vegetable", kcal100: 20, protein100: 0.9, carb100: 4.6, fat100: 0.2, fiber100: 1.7, sugar100: 2.4, sodium100: 3, satFat100: 0, servings: [{ label: "1 adet (orta)", grams: 40 }, { label: "1 adet (dolmalık)", grams: 120 }] },
  { name: "Brokoli", nameEn: "Broccoli", category: "vegetable", kcal100: 34, protein100: 2.8, carb100: 6.6, fat100: 0.4, fiber100: 2.6, sugar100: 1.7, sodium100: 33, satFat100: 0, servings: [{ label: "1 porsiyon (pişmiş)", grams: 150 }] },
  { name: "Karnabahar", nameEn: "Cauliflower", category: "vegetable", kcal100: 25, protein100: 1.9, carb100: 5, fat100: 0.3, fiber100: 2, sugar100: 1.9, sodium100: 30, satFat100: 0, servings: [{ label: "1 porsiyon", grams: 150 }] },
  { name: "Mantar", nameEn: "Mushrooms (cultivated)", category: "vegetable", kcal100: 22, protein100: 3.1, carb100: 3.3, fat100: 0.3, fiber100: 1, sugar100: 2, sodium100: 5, satFat100: 0, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 kase (dilimlenmiş)", grams: 100 }] },
  { name: "Mısır (haşlanmış)", nameEn: "Sweet corn (boiled)", category: "vegetable", kcal100: 108, protein100: 3.2, carb100: 22.5, fat100: 1, fiber100: 2.4, sugar100: 4.5, sodium100: 2, satFat100: 0.2, servings: [{ label: "1 koçan (taneleri)", grams: 150 }] },
  { name: "Bezelye", nameEn: "Green peas (cooked)", category: "vegetable", kcal100: 84, protein100: 5.4, carb100: 15.6, fat100: 0.2, fiber100: 5.5, sugar100: 5.7, sodium100: 3, satFat100: 0, servings: [{ label: "1 porsiyon", grams: 150 }] },
  { name: "Semizotu", nameEn: "Purslane", category: "vegetable", kcal100: 16, protein100: 1.3, carb100: 3.4, fat100: 0.1, fiber100: 0.9, sugar100: 0.5, sodium100: 23, satFat100: 0, servings: [{ label: "1 porsiyon (salata)", grams: 100 }] },
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

  // ─── Atıştırmalık & Fast Food ──────────────────────────────────────────────
  { name: "Hamburger", nameEn: "Hamburger (fast food)", category: "snack", kcal100: 265, protein100: 14, carb100: 26, fat100: 11, fiber100: 1.5, sugar100: 5, sodium100: 500, satFat100: 4.5, servings: [{ label: "1 adet (orta)", grams: 200 }, { label: "1 adet (büyük)", grams: 280 }] },
  { name: "Cheeseburger", nameEn: "Cheeseburger (fast food)", category: "snack", kcal100: 285, protein100: 16, carb100: 26, fat100: 13, fiber100: 1.5, sugar100: 5, sodium100: 620, satFat100: 6, servings: [{ label: "1 adet (orta)", grams: 200 }, { label: "1 adet (çift köfte)", grams: 300 }] },
  { name: "Pizza (Margarita)", nameEn: "Margherita pizza", category: "snack", kcal100: 255, protein100: 11, carb100: 30, fat100: 9.5, fiber100: 2, sugar100: 3, sodium100: 500, satFat100: 4.5, servings: [{ label: "1 dilim", grams: 120 }, { label: "1 porsiyon (2 dilim)", grams: 240 }] },
  { name: "Patates Kızartması", nameEn: "French fries", category: "snack", kcal100: 312, protein100: 3.4, carb100: 41, fat100: 15, fiber100: 3.8, sugar100: 0.3, sodium100: 210, satFat100: 2.3, servings: [{ label: "1 orta porsiyon", grams: 115 }, { label: "1 büyük porsiyon", grams: 170 }] },
  { name: "Patates Cipsi", nameEn: "Potato chips", category: "snack", kcal100: 536, protein100: 7, carb100: 53, fat100: 34, fiber100: 4.8, sugar100: 0.6, sodium100: 525, satFat100: 3.5, servings: [{ label: "1 küçük paket", grams: 45 }, { label: "1 kase", grams: 60 }] },
  { name: "Patlamış Mısır", nameEn: "Popcorn (oil-popped)", category: "snack", kcal100: 440, protein100: 8, carb100: 60, fat100: 20, fiber100: 8, sugar100: 1, sodium100: 500, satFat100: 3, servings: [{ label: "1 kase", grams: 30 }, { label: "1 paket (büyük)", grams: 100 }] },
  { name: "Kraker", nameEn: "Crackers", category: "snack", kcal100: 460, protein100: 8, carb100: 65, fat100: 17, fiber100: 2.5, sugar100: 6, sodium100: 800, satFat100: 3.5, servings: [{ label: "1 paket", grams: 40 }] },
  { name: "Gofret", nameEn: "Chocolate wafer bar", category: "snack", kcal100: 535, protein100: 5.5, carb100: 60, fat100: 28, fiber100: 1.5, sugar100: 40, sodium100: 300, satFat100: 14, servings: [{ label: "1 adet", grams: 40 }] },
  { name: "Çikolata (Sütlü)", nameEn: "Milk chocolate", category: "snack", kcal100: 535, protein100: 7.6, carb100: 59, fat100: 30, fiber100: 3.4, sugar100: 52, sodium100: 79, satFat100: 18.8, servings: [{ label: "1 parça", grams: 10 }, { label: "1 çeyrek tablet", grams: 25 }] },
  { name: "Fındık Kreması", nameEn: "Chocolate hazelnut spread", category: "snack", kcal100: 539, protein100: 6, carb100: 57, fat100: 31, fiber100: 3.4, sugar100: 56, sodium100: 41, satFat100: 10, servings: [{ label: "1 tatlı kaşığı", grams: 10 }, { label: "1 yemek kaşığı", grams: 20 }] },
];

/**
 * SEED yemeklerini upsert eder (name+source="SEED" bazlı, idempotent).
 * Servings her koşuda yeniden oluşturulur.
 */
export async function ensureSeedFoods(client: PrismaClient): Promise<{ foods: number; servings: number }> {
  let servingCount = 0;
  for (const f of SEED_FOODS) {
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

    const existing = await client.food.findFirst({
      where: { name: f.name, source: "SEED" },
      select: { id: true },
    });

    if (existing) {
      await client.food.update({ where: { id: existing.id }, data });
      await client.serving.deleteMany({ where: { foodId: existing.id } });
      await client.serving.createMany({
        data: f.servings.map((s) => ({ foodId: existing.id, label: s.label, grams: s.grams })),
      });
    } else {
      await client.food.create({
        data: { ...data, servings: { create: f.servings } },
      });
    }
    servingCount += f.servings.length;
  }

  const foods = await client.food.count({ where: { source: "SEED" } });
  const servings = await client.serving.count({ where: { food: { source: "SEED" } } });
  if (servings !== servingCount) {
    console.warn(`[food-catalog] bu koşuda ${servingCount} porsiyon eklendi; DB toplam ${servings}.`);
  }
  return { foods, servings };
}

/**
 * Self-healing (organik tetik): DB'deki SEED gıda sayısı katalog listesinden
 * azsa eksikleri tamamlar — böylece mevcut veritabanlarına yeni eklenen
 * katalog gıdaları da kendiliğinden görünür. ensureSeedFoods idempotent
 * upsert olduğu için güvenle tekrar çalışabilir. Kontrol süreç başına bir kez
 * yapılır (modül-level memo) ve yalnızca sunucu tarafında çağrılmalıdır.
 */
let seedFoodsEnsurePromise: Promise<void> | null = null;

export function ensureSeedFoodsIfMissing(client: PrismaClient): Promise<void> {
  if (!seedFoodsEnsurePromise) {
    seedFoodsEnsurePromise = (async () => {
      const count = await client.food.count({ where: { source: "SEED", deletedAt: null } });
      if (count < SEED_FOODS.length) {
        console.warn(
          `[food-catalog] SEED kataloğu eksik (DB: ${count}/${SEED_FOODS.length}) — tohumlanıyor...`
        );
        const seeded = await ensureSeedFoods(client);
        console.warn(`[food-catalog] katalog tamamlandı: ${seeded.foods} gıda, ${seeded.servings} porsiyon.`);
      }
    })().catch((e) => {
      // Başarısız olursa memo'yu temizle ki sonraki istekte yeniden denensin
      seedFoodsEnsurePromise = null;
      throw e;
    });
  }
  return seedFoodsEnsurePromise;
}
