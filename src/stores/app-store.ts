"use client";

import { create } from "zustand";
import { getDict, type Dictionary, type Locale } from "@/lib/i18n";

export type Tab = "today" | "diary" | "progress" | "training" | "profile";

/* ---------- Guided strength session (openGym-style) ---------- */

/** Editing-friendly set row (string inputs while typing) */
export interface GuidedSetState {
  reps: string;
  weightKg: string;
  rir: string;
  done: boolean;
}

export interface GuidedExerciseState {
  exerciseKey: string;
  name: string;
  muscle: string;
  equipment: string | null;
  restSec: number;
  /** planned label from routine template, e.g. "8-10" */
  targetReps?: string;
  sets: GuidedSetState[];
  /** lazy-loaded history (for pre-fill + live PR detection) */
  prevBest?: number;
  lastSets?: { reps: number; weightKg: number }[];
}

export interface GuidedSessionState {
  startedAt: number; // epoch ms
  name: string;
  exercises: GuidedExerciseState[];
  soundOn: boolean;
  keepAwake: boolean;
}

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
  /* guided strength session */
  guidedSession: GuidedSessionState | null;
  guidedOpen: boolean;
  startGuidedSession: (name: string, exercises: GuidedExerciseState[]) => void;
  patchGuidedSession: (fn: (s: GuidedSessionState) => GuidedSessionState) => void;
  endGuidedSession: () => void;
  setGuidedOpen: (v: boolean) => void;
  hydrateGuidedSession: () => void;
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

  /* ---------- guided strength session ---------- */
  guidedSession: null,
  guidedOpen: false,
  startGuidedSession: (name, exercises) =>
    set(() => {
      const session: GuidedSessionState = {
        startedAt: Date.now(),
        name,
        exercises,
        soundOn: true,
        keepAwake: true,
      };
      persistGuided(session);
      return { guidedSession: session, guidedOpen: true };
    }),
  patchGuidedSession: (fn) =>
    set((s) => {
      if (!s.guidedSession) return {};
      const next = fn(s.guidedSession);
      persistGuided(next);
      return { guidedSession: next };
    }),
  endGuidedSession: () =>
    set(() => {
      if (typeof window !== "undefined") window.localStorage.removeItem(GUIDED_KEY);
      return { guidedSession: null, guidedOpen: false };
    }),
  setGuidedOpen: (v) => set({ guidedOpen: v }),
  hydrateGuidedSession: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(GUIDED_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as GuidedSessionState;
      if (
        parsed &&
        typeof parsed.startedAt === "number" &&
        Array.isArray(parsed.exercises) &&
        // 24 saatten eski seanslar restore edilmez (bayat oturum temizliği)
        Date.now() - parsed.startedAt < 24 * 60 * 60 * 1000
      ) {
        set({ guidedSession: parsed });
      } else {
        window.localStorage.removeItem(GUIDED_KEY);
      }
    } catch {
      /* bozuk kayıt — yoksay */
    }
  },
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

const GUIDED_KEY = "kaloriai_guided";

function persistGuided(s: GuidedSessionState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUIDED_KEY, JSON.stringify(s));
  } catch {
    /* quota/private mode — bellek içi state yine de geçerli */
  }
}

/** Read persisted skin (for hydration-sync scripts) */
export function getStoredSkin(): Skin {
  if (typeof window === "undefined") return "default";
  const s = window.localStorage.getItem("kaloriai_skin");
  return s === "glass" || s === "midnight" || s === "aurora" ? s : "default";
}
