import { tr, type Dictionary } from "./tr";
import { en } from "./en";

export type Locale = "tr" | "en";
export type { Dictionary };

export const dictionaries: Record<Locale, Dictionary> = { tr, en };

export function getDict(locale: Locale | string | undefined): Dictionary {
  return locale === "en" ? en : tr;
}
