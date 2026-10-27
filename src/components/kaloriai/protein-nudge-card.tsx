"use client";

import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Dumbbell, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Dictionary } from "@/lib/i18n";
import type { DiaryResponse, FoodItem, Workout } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Antrenman Sonrası Protein Kartı — bugün antrenmanı olan ve günlük protein
 * hedefine henüz ulaşmamış kullanıcıya kas onarımı hatırlatması yapar.
 * Spor bilimi: antrenman sonrası hedef = 0.4 g/kg vücut ağırlığı (~25-40 g).
 * Yüksek proteinli tohum gıdalarını tek dokunuşla "Ara öğün"e ekler
 * (POST gövdesi add-food-sheet ile birebir aynı şekli kullanır).
 */

/** Yüksek proteinli tohum gıdaları — adlar katalogdaki birebir adlar */
const PROTEIN_FOODS = ["Whey Protein Tozu", "Izgara Tavuk Göğsü", "Süzme Yoğurt"] as const;

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

interface ProteinNudgeCardProps {
  /** YYYY-MM-DD — Bugün ekranının tarihi */
  date: string;
  /** Günün defter toplamları */
  totals: DiaryResponse["totals"];
  /** Günün etkili protein hedefi (g) — antrenman günü farkı hero kartta olduğu gibi hesaplanmış */
  proteinTarget: number;
  /** Bugünün antrenmanları (kart yalnız ≥1 kayıtta görünür) */
  workouts: Workout[];
  /** Profil ağırlığı (kg) — yoksa 70 kg varsayılanı */
  weightKg?: number | null;
  dict: Dictionary;
  locale: string;
  /** Stagger gecikmesi için fade indeksi */
  index?: number;
}

export function ProteinNudgeCard({
  date,
  totals,
  proteinTarget,
  workouts,
  weightKg,
  dict,
  locale,
  index = 2,
}: ProteinNudgeCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [justHitGoal, setJustHitGoal] = useState(false);
  const [addedFoodId, setAddedFoodId] = useState<string | null>(null);

  const proteinTotal = totals?.protein ?? 0;
  const weight = weightKg && weightKg > 0 ? weightKg : 70; // fallback: 0.4 × 70
  const postWorkoutTarget = Math.round(weight * 0.4);
  const remaining = Math.max(Math.round(proteinTarget - proteinTotal), 0);
  const pct = proteinTarget > 0 ? Math.min(Math.round((proteinTotal / proteinTarget) * 100), 100) : 0;

  const visible = workouts.length > 0 && !dismissed && (remaining > 0 || justHitGoal);

  // Tohum kataloğundan yüksek proteinli üç gıda — kart görünürken paralel aranır.
  const foodsQ = useQueries({
    queries: PROTEIN_FOODS.map((name) => ({
      queryKey: ["proteinNudgeFood", name],
      queryFn: () =>
        api<{ foods: FoodItem[]; source: string }>(`/api/foods/search?q=${encodeURIComponent(name)}&limit=5`),
      staleTime: 10 * 60 * 1000,
      retry: 1,
      enabled: visible,
    })),
  });

  const addFood = useMutation({
    // Gövde şekli add-food-sheet.tsx'teki ekleme isteğiyle birebir aynı.
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
      // Bu ekleme hedefi kapattıysa: kısa kutlama göster, sonra kartı bu
      // oturum için gizle (kapanışları onSuccess'te belirleriz — effect yok).
      if (proteinTotal + scaled(v.food.protein100, v.grams) >= proteinTarget) {
        setJustHitGoal(true);
        window.setTimeout(() => {
          setJustHitGoal(false);
          setDismissed(true);
        }, 3200);
      }
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  interface Chip {
    name: string;
    loading: boolean;
    food: FoodItem | null;
    grams: number;
    protein: number;
    kcal: number;
  }

  const chips: Chip[] = foodsQ.map((q, i) => {
    const food = q.data?.foods.find((f) => f.name === PROTEIN_FOODS[i]) ?? q.data?.foods[0] ?? null;
    const grams = food?.servings[0]?.grams ?? 100;
    return {
      name: PROTEIN_FOODS[i],
      loading: q.isLoading,
      food,
      grams,
      protein: food ? Math.round((food.protein100 * grams) / 100) : 0,
      kcal: food ? Math.round((food.kcal100 * grams) / 100) : 0,
    };
  });

  if (!visible) return null;

  /* ---- Hedefe ulaşıldı: kısa kutlama durumu ---- */
  if (justHitGoal) {
    return (
      <motion.div {...fade(index)} role="complementary" aria-label={dict.proteinNudge.goalReached}>
        <Card className="kai-card-hover rounded-2xl border-l-4 border-l-emerald-500 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Check className="h-4.5 w-4.5 text-emerald-500" aria-hidden />
            </span>
            <p className="min-w-0 flex-1 text-sm font-semibold">{dict.proteinNudge.goalReached}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDismissed(true)}
              aria-label={dict.proteinNudge.dismiss}
              className="h-11 w-11 shrink-0 rounded-full"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  /* ---- Normal durum ---- */
  return (
    <motion.div {...fade(index)} role="complementary" aria-label={dict.proteinNudge.title}>
      <Card className="kai-card-hover rounded-2xl border-l-4 border-l-primary p-4">
        {/* Başlık satırı: rozet + başlık/alt başlık + kapat */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Dumbbell className="h-4.5 w-4.5 text-primary" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{dict.proteinNudge.title}</p>
              <p className="text-xs text-muted-foreground">{dict.proteinNudge.subtitle}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDismissed(true)}
            aria-label={dict.proteinNudge.dismiss}
            className="h-11 w-11 shrink-0 rounded-full"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        {/* Günlük ilerleme + antrenman sonrası hedef */}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium">{dict.proteinNudge.dailyProgress}</span>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(proteinTotal)}/{Math.round(proteinTarget)} {dict.common.g}
              </span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={dict.proteinNudge.dailyProgress}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xl font-bold tabular-nums">
              {remaining}
              <span className="ml-1 text-sm font-semibold text-muted-foreground">
                {dict.common.g} {dict.proteinNudge.remaining}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-2.5 text-center sm:min-w-[128px]">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {dict.proteinNudge.postTarget}
            </p>
            <p className="text-2xl font-bold leading-tight tabular-nums text-primary">
              {postWorkoutTarget} <span className="text-sm font-semibold">{dict.common.g}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">{dict.proteinNudge.postTargetHint}</p>
          </div>
        </div>

        {/* Hızlı ekle — yüksek proteinli tohum gıdaları */}
        {(chips.some((c) => c.loading) || chips.some((c) => c.food)) && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{dict.proteinNudge.quickAdd}</p>
            <div className="grid gap-1.5">
              {chips.map((c, i) => {
                const food = c.food;
                if (c.loading) {
                  return <div key={c.name} className="h-[52px] animate-pulse rounded-xl bg-muted" aria-hidden />;
                }
                if (!food) return null;
                const added = addedFoodId === food.id;
                const pending = addFood.isPending && addFood.variables?.food.id === food.id;
                return (
                  <motion.button
                    key={c.name}
                    type="button"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18, delay: i * 0.05 }}
                    onClick={() => addFood.mutate({ food, grams: c.grams })}
                    disabled={addFood.isPending}
                    aria-label={`${foodDisplayName(food, locale)} — +${c.protein} ${dict.common.g} ${dict.onboarding.protein}, ${c.grams} ${dict.common.g}, ${c.kcal} ${dict.common.kcal}`}
                    className={cn(
                      "kai-pressable flex min-h-[52px] items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left transition-colors disabled:opacity-60",
                      added ? "border-emerald-500/50 bg-emerald-500/10" : "hover:border-primary/40 hover:bg-primary/5"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        added ? "bg-emerald-500/15" : "bg-primary/10"
                      )}
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                      ) : added ? (
                        <Check className="h-4 w-4 text-emerald-500" aria-hidden />
                      ) : (
                        <Plus className="h-4 w-4 text-primary" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{foodDisplayName(food, locale)}</span>
                      <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
                        +{c.protein} {dict.common.g} {dict.onboarding.protein} · {c.grams} {dict.common.g} ·{" "}
                        {c.kcal} {dict.common.kcal}
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
