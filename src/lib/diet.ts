/**
 * KaloriAI — diyet tercihi filtresi.
 *
 * Kategori bazlı eleme (meat/dairy) katalogda "turkish_cuisine" gibi karışık
 * kategorilerde et/süt içeren yemekleri kaçırdığı için (ör. "Et Döner",
 * "Izgara Köfte", "Ayran") isim bazlı ikinci bir tarama uygular. Amaç:
 * vejetaryene asla et/balık, vegana asla et/süt/ymurta/bal içeren öneri
 * gitmemesi. Buna karşılık yumurta lakto-ovo vejetaryen için uygundur.
 */

/** Vejetaryen için serbest (yumurta bazlı) — category:meat içinde yaşar. */
const EGG_ONLY_RE = /(yumurta|menemen|çılbır|cilbir|omlet|egg)\b/i;

/** Et / balık içeren ad kalıpları (Türkçe + İngilizce). */
const MEAT_PATTERNS: RegExp[] = [
  /\betli\b/i,
  /\bet\b/i,
  /döner/i,
  /tavuk/i,
  /kuzu/i,
  /\bdana\b/i,
  /balık|baligi/i,
  /somon|levrek|çupra|cupra|midye|kalamar|karides|ton\b/i,
  /sucuk|pastırma|pastirma|kokoreç|kokorec/i,
  /lahmacun|kebap|kebab/i,
  /köfte|koftesi|kıyma|kiyma|kavurma/i,
  /kuşbaşı|kusbasi/i,
  /biftek|bonfile|pirzola|kanat/i,
  /işkembe|iskembe|içli köfte|manti\b|mantı\b/i,
  /şiş\b/i,
  /burger|schnitzel|şinitzel|kokteyl|hot ?dog|bacon|salam|jambon/i,
  /chicken|beef|lamb|pork|steak|tuna|salmon|shrimp|meatball|sausage/i,
  /\bmeat\b|\bham\b|\bfish\b|\bgrill\b/i,
];

/** Vegan için ayrıca hariç tutulacak (süt/ymurta/bal) kalıplar. */
const NONVEGAN_PATTERNS: RegExp[] = [
  /peynir|kaşar|kasar|mozzarella|margarita|margherita|pizza|kaymak|tereyağ|tereyag|lor\b|butter/i,
  /yoğurt|yogurt|ayran|kefir/i,
  /süt|sütlü|sütlaç|sutlac/i,
  /yumurta|menemen|çılbır|cilbir|omlet|mücveri|mucveri|egg\b/i,
  /dondurma|muhallebi|keşkül|keskul|krema|kremalı|kreması|cream|milk\b/i,
  /sahlep|salep|tarhana/i,
  /\bbal\b/i,
];

/** Deseni et/yumurta içermesine rağmen vegan (ör. mercimek köftesi). */
const VEGAN_EXCEPTION_RE = /mercimek köftesi/i;

export type DietPreference = "any" | "vegetarian" | "vegan";

/**
 * Yiyecek bu diyet tercihi için önerilemez mi?
 * `true` = eleme uygulanmalı.
 */
export function excludedByDiet(
  food: { name: string; nameEn?: string | null; category: string },
  diet: string | null | undefined
): boolean {
  const d = (diet ?? "any") as DietPreference;
  if (d !== "vegetarian" && d !== "vegan") return false;

  const hay = `${food.name} ${food.nameEn ?? ""}`.toLocaleLowerCase("tr");
  if (VEGAN_EXCEPTION_RE.test(hay)) return false;

  const isEggOnly = EGG_ONLY_RE.test(hay);
  const hasMeat =
    food.category === "meat" && !isEggOnly ? true : MEAT_PATTERNS.some((re) => re.test(hay));

  // Vejetaryen: et/balık yok, yumurta serbest
  if (d === "vegetarian") return hasMeat;

  // Vegan: et/balık + süt ürünleri + yumurta + bal hariç
  return hasMeat || food.category === "dairy" || NONVEGAN_PATTERNS.some((re) => re.test(hay));
}
