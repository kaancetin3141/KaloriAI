"use client";

import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Loader2, Plus, RefreshCw, Sparkles, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { runAiJob } from "@/lib/ai-client";
import { useToast } from "@/hooks/use-toast";
import type { Dictionary } from "@/lib/i18n";
import type { FoodItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * "Şimdi ne yesem?" kartı — günün kalan kalorisi ve proteinine göre AI'dan
 * 4 gerçekçi öğün önerisi ister (async job: POST → jobId → GET yoklaması) ve
 * her öneriyi gıda veritabanında arayıp tek dokunuşla "Ara öğün"e ekler
 * (POST gövdesi protein-nudge-card / add-food-sheet ile birebir aynı şekil).
 */

/** AI önerisi — /api/ai/what-to-eat iş sonucu */
interface Suggestion {
  name: string;
  kcal: number;
  protein: number;
  why: string;
  searchTerm: string;
}

/** EN locale: varsa İngilizce adı göster (add-food-sheet ile aynı kural) */
function foodDisplayName(food: FoodItem, locale: string): string {
  return locale === "en" && food.nameEn ? food.nameEn : food.name;
}

/** per100 × grams/100, 1 decimal — add-food-sheet ile aynı ölçekleme */
const scaled = (per100: number, grams: number) => Math.round(((per100 * grams) / 100) * 10) / 10;

/** Bugün ekranındaki `fade` helper ile aynı giriş animasyonu */
const fade = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, delay: i * 0.05 },
});

/** Önerinin kalan kaloriye uyum yüzdesi — %5..%99 aralığına sıkıştırılır */
function fitPct(suggestKcal: number, remaining: number): number {
  const ratio = Math.abs(suggestKcal - remaining) / Math.max(remaining, 1);
  return Math.round(Math.min(Math.max(100 - ratio * 100, 5), 99));
}

interface WhatToEatCardProps {
  /** YYYY-MM-DD — Bugün ekranının tarihi */
  date: string;
  /** Bugün tüketilen kcal (etkili hedefe karşı) */
  consumedKcal: number;
  /** Günün etkili kalori bütçesi (antrenman günü farkı + hedefe eklenen yakılan dahil) */
  targetKcal: number;
  /** Bugün tüketilen protein (g) */
  consumedProtein: number;
  /** Günün etkili protein hedefi (g) */
  targetProtein: number;
  dict: Dictionary;
  locale: string;
  /** Stagger gecikmesi için fade indeksi */
  index?: number;
}

export function WhatToEatCard({
  date,
  consumedKcal,
  targetKcal,
  consumedProtein,
  targetProtein,
  dict,
  locale,
  index = 3,
}: WhatToEatCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [addedFoodId, setAddedFoodId] = useState<string | null>(null);

  const remaining = Math.round(targetKcal - consumedKcal);
  const remainingProtein = Math.max(Math.round(targetProtein - consumedProtein), 0);

  /* ---- AI önerileri: async job (POST jobId → GET yoklaması) ---- */
  const ask = useMutation({
    mutationFn: () =>
      runAiJob<{ suggestions?: Suggestion[] }>("/api/ai/what-to-eat", {
        body: { locale: locale === "en" ? "en" : "tr" },
      }),
    onSuccess: (data) => setSuggestions(data.suggestions ?? []),
    onError: () => toast({ title: dict.whatToEat.failed, variant: "destructive" }),
  });

  /* ---- Öneri başına gıda arama: yalnız öneriler görünürken çalışır ---- */
  const foodQueries = useQueries({
    queries: (suggestions ?? []).map((s) => ({
      queryKey: ["whatToEatFood", s.searchTerm],
      queryFn: () =>
        api<{ foods: FoodItem[]; source: string }>(
          `/api/foods/search?q=${encodeURIComponent(s.searchTerm)}&limit=5`
        ),
      staleTime: 10 * 60 * 1000,
      retry: 1,
      enabled: suggestions != null,
    })),
  });

  /* ---- Deftere ekleme: gövde şekli protein-nudge-card ile birebir aynı ---- */
  const addFood = useMutation({
    mutationFn: ({ food, grams }: { food: FoodItem; grams: number }) =>
      api<{ ok: boolean }>("/api/diary", {
        body: {
          date,
          mealType: "snacks",
          items: [
            {
              foodId: food.id.startsWith("off_") ? undefined : food.id,
              name: foodDisplayName(food, locale),
              grams,
              kcal: scaled(food.kcal100, grams),
              protein: scaled(food.protein100, grams),
              carbs: scaled(food.carb100, grams),
              fat: scaled(food.fat100, grams),
              fiber: scaled(food.fiber100, grams),
              sugar: scaled(food.sugar100, grams),
              sodium: scaled(food.sodium100, grams),
              satFat: scaled(food.satFat100, grams),
              source: "manual",
            },
          ],
        },
      }),
    onSuccess: (_res, v) => {
      setAddedFoodId(v.food.id);
      window.setTimeout(() => setAddedFoodId((cur) => (cur === v.food.id ? null : cur)), 1500);
      toast({ title: `${foodDisplayName(v.food, locale)} ${dict.proteinNudge.added}` });
      void queryClient.invalidateQueries({ queryKey: ["diary"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  // Gün tamamlandıysa (≤50 kcal kaldı) kart hiç render edilmez —
  // hook'lardan SONRA erken return (React kuralı: hook'lar koşulsuz çağrılır).
  if (remaining <= 50) return null;

  return (
    <motion.div {...fade(index)} role="complementary" aria-label={dict.whatToEat.title}>
      <Card className="kai-card-hover rounded-2xl p-4">
        {/* Başlık satırı: rozet + başlık/alt başlık + yenile */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <UtensilsCrossed className="h-4.5 w-4.5 text-primary" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{dict.whatToEat.title}</p>
              <p className="text-xs text-muted-foreground">{dict.whatToEat.subtitle}</p>
            </div>
          </div>
          {suggestions != null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => ask.mutate()}
              disabled={ask.isPending}
              aria-label={dict.whatToEat.regenerate}
              className="h-11 shrink-0 gap-1.5 rounded-full px-3"
            >
              <RefreshCw className={cn("h-4 w-4", ask.isPending && "animate-spin")} aria-hidden />
              <span className="hidden sm:inline">{dict.whatToEat.regenerate}</span>
            </Button>
          )}
        </div>

        {/* Kalan kalori / protein çipleri */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium tabular-nums text-primary">
            {remaining} {dict.whatToEat.kcalLeft}
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
            {remainingProtein} {dict.whatToEat.proteinLeft}
          </span>
        </div>

        {/* Gövde: henüz istenmediyse "Öneri al"; beklerken iskelet; bitince liste */}
        {ask.isPending ? (
          <div className="mt-3 space-y-2" aria-live="polite" aria-label={dict.whatToEat.thinking}>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" aria-hidden />
              {dict.whatToEat.thinking}
            </p>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : suggestions == null ? (
          <Button
            onClick={() => ask.mutate()}
            className="mt-3 h-11 w-full gap-2 rounded-xl"
            aria-label={dict.whatToEat.ask}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {dict.whatToEat.ask}
          </Button>
        ) : (
          <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto" aria-label={dict.whatToEat.subtitle}>
            {suggestions.map((s, i) => {
              const q = foodQueries[i];
              const food = q?.data?.foods[0] ?? null;
              const grams = food?.servings[0]?.grams ?? 100;
              const pendingThis = addFood.isPending && addFood.variables?.food.id === food?.id;
              const added = food != null && addedFoodId === food.id;
              const pct = fitPct(s.kcal, remaining);
              return (
                <motion.li
                  key={`${s.name}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.06 }}
                  className="rounded-xl border bg-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {s.kcal} {dict.common.kcal} · P{s.protein}
                        {dict.common.g}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      %{pct} {dict.whatToEat.fitChip}
                    </span>
                  </div>
                  <p className="mt-1 text-xs italic leading-snug text-muted-foreground">{s.why}</p>

                  {/* Gıda veritabanında ara ve tek dokunuşla ekle */}
                  <div className="mt-2">
                    {q?.isLoading ? (
                      <Skeleton className="h-11 w-full rounded-xl" />
                    ) : food ? (
                      <Button
                        variant="outline"
                        onClick={() => addFood.mutate({ food, grams })}
                        disabled={addFood.isPending}
                        aria-label={`${dict.whatToEat.searchAdd}: ${foodDisplayName(food, locale)}, ${grams} ${dict.common.g}, ${Math.round((food.kcal100 * grams) / 100)} ${dict.common.kcal}`}
                        className="h-11 w-full justify-start gap-2 rounded-xl"
                      >
                        {pendingThis ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                        ) : added ? (
                          <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        )}
                        <span className="truncate text-xs font-medium">
                          + {foodDisplayName(food, locale)} ({grams} {dict.common.g})
                        </span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled
                        aria-label={dict.whatToEat.searchAdd}
                        className="h-11 w-full justify-start gap-2 rounded-xl"
                      >
                        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate text-xs text-muted-foreground">
                          {dict.whatToEat.searchAdd}
                        </span>
                      </Button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </Card>
    </motion.div>
  );
}
