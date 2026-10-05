"use client";

import { create } from "zustand";
import { getDict, type Dictionary, type Locale } from "@/lib/i18n";

export type Tab = "today" | "diary" | "progress" | "training" | "profile";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  unitSystem: string;
  isPremium: boolean;
  onboarded: boolean;
}

export type MealKey = "breakfast" | "lunch" | "dinner" | "snacks";
export type MealNames = Partial<Record<MealKey, string>>;

/** Appearance skins (premium tiers gated in profile settings) */
export type Skin = "default" | "glass" | "midnight" | "aurora";
export const PREMIUM_SKINS: readonly Skin[] = ["glass", "midnight", "aurora"];
const SKIN_CLASSES: readonly Skin[] = ["default", "glass", "midnight", "aurora"];

/** Apply the skin class on <html> (idempotent) */
function applySkinClass(skin: Skin): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const s of SKIN_CLASSES) {
    if (s !== "default") root.classList.remove(`skin-${s}`);
  }
  if (skin !== "default") root.classList.add(`skin-${skin}`);
}

interface AppState {
  locale: Locale;
  dict: Dictionary;
  tab: Tab;
  user: SessionUser | null;
  authChecked: boolean;
  coachOpen: boolean;
  mealNames: MealNames | null;
  skin: Skin;
  setSkin: (s: Skin) => void;
  setLocale: (l: Locale) => void;
  setTab: (t: Tab) => void;
  setUser: (u: SessionUser | null) => void;
  setAuthChecked: (v: boolean) => void;
  setCoachOpen: (v: boolean) => void;
  setMealNames: (m: MealNames | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  locale: "tr",
  dict: getDict("tr"),
  tab: "today",
  user: null,
  authChecked: false,
  coachOpen: false,
  mealNames: null,
  skin: "default",
  setSkin: (s) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kaloriai_skin", s);
    }
    applySkinClass(s);
    set({ skin: s });
  },
  setLocale: (l) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kaloriai_locale", l);
      document.documentElement.lang = l;
    }
    set({ locale: l, dict: getDict(l) });
  },
  setTab: (t) => set({ tab: t }),
  setUser: (u) => {
    const locale = (u?.locale as Locale) || "tr";
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kaloriai_locale", locale);
      document.documentElement.lang = locale;
    }
    set((s) => ({
      user: u,
      locale,
      dict: getDict(locale),
      // Kimlik değişince (giriş/çıkış/demo geçişi) bugün ekranına dön
      ...(s.user?.id !== (u?.id ?? null) ? { tab: "today" as const } : {}),
    }));
  },
  setAuthChecked: (v) => set({ authChecked: v }),
  setCoachOpen: (v) => set({ coachOpen: v }),
  setMealNames: (m) => set({ mealNames: m }),
}));

/** Effective meal label: custom name if set, else i18n default */
export function mealLabel(dict: Dictionary, names: MealNames | null, key: MealKey): string {
  const custom = names?.[key]?.trim();
  return custom || dict.today[key];
}

/** Client-side helper to read stored locale before session loads */
export function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "tr";
  return (window.localStorage.getItem("kaloriai_locale") as Locale) || "tr";
}

/** Read persisted skin (for hydration-sync scripts) */
export function getStoredSkin(): Skin {
  if (typeof window === "undefined") return "default";
  const s = window.localStorage.getItem("kaloriai_skin");
  return s === "glass" || s === "midnight" || s === "aurora" ? s : "default";
}
