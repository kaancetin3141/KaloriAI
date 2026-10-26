"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Beef, Droplets, Wheat, Check, Plus, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { appToday } from "@/lib/tz";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Akıllı Eksik Analizi — günün gerçek defter verisinden kalan boşlukları
 * gösterir ve tek dokunuşla kapatma önerisi sunar. Kural tabanlıdır (AI yok):
 * GET /api/gaps anında döner; öneriler tohum kataloğundaki gerçek yiyecekler
 * ve gerçek porsiyonlardan seçilir.
 */

interface GapSuggestion {
  kind: "protein" | "fiber" | "water";
  foodId?: string;
  name: string;
  grams?: number;
  ml?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  satFat: number;
}

interface GapsResponse {
  gaps: {
    kcalRemaining: number;
    proteinRemaining: number;
    fiberRemaining: number;
    waterRemainingMl: number;
  };
  suggestions: GapSuggestion[];
}

interface SuggestionChipProps {
  s: GapSuggestion;
  detail: string;
  onDone: () => void;
  index: number;
}

function SuggestionChip({ s, detail, onDone, index }: SuggestionChipProps) {
  const { dict } = useAppStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [added, setAdded] = useState(false);

  const add = useMutation({
    mutationFn: async () => {
      if (s.kind === "water") {
        return api<{ ok: boolean }>("/api/water", { body: { deltaMl: s.ml ?? 500 } });
      }
      // Öğün seçimi saat dilimine göre: <11 kahvaltı, <15 öğle, <21 akşam, sonrası ara öğün
      const hour = new Date().getHours();
      const mealType = hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 21 ? "dinner" : "snacks";
      return api<{ ok: boolean }>("/api/diary", {
        body: {
          mealType,
          items: [
            {
              foodId: s.foodId ?? null,
              name: s.name,
              grams: s.grams ?? 0,
              kcal: s.kcal,
              protein: s.protein,
              carbs: s.carbs,
              fat: s.fat,
              fiber: s.fiber,
              sugar: s.sugar,
              sodium: s.sodium,
              satFat: s.satFat,
              source: "manual",
            },
          ],
        },
      });
    },
    onSuccess: () => {
      setAdded(true);
      toast({ title: s.kind === "water" ? dict.today.gapsWaterDone : dict.today.gapsAddDone });
      void qc.invalidateQueries({ queryKey: ["diary"] });
      void qc.invalidateQueries({ queryKey: ["gaps"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      onDone();
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, delay: index * 0.05 }}
      onClick={() => !added && !add.isPending && add.mutate()}
      disabled={added || add.isPending}
      aria-label={`${s.name} — ${detail}`}
      className={cn(
        "kai-pressable group flex min-h-[52px] items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left transition-colors",
        added
          ? "border-emerald-500/50 bg-emerald-500/10"
          : "hover:border-primary/40 hover:bg-primary/5"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          added ? "bg-emerald-500/15" : "bg-primary/10"
        )}
      >
        {add.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
        ) : added ? (
          <Check className="h-4 w-4 text-emerald-500" aria-hidden />
        ) : s.kind === "water" ? (
          <Droplets className="h-4 w-4 text-sky-500" aria-hidden />
        ) : s.kind === "fiber" ? (
          <Wheat className="h-4 w-4 text-amber-600" aria-hidden />
        ) : (
          <Beef className="h-4 w-4 text-rose-500" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{s.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
      </span>
      {!added && (
        <Plus
          className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
          aria-hidden
        />
      )}
    </motion.button>
  );
}

export function GapsCard() {
  const { dict, locale } = useAppStore();
  const date = appToday();

  const gapsQ = useQuery({
    queryKey: ["gaps", date, locale],
    queryFn: () => api<GapsResponse>(`/api/gaps?date=${date}&locale=${locale}`),
    staleTime: 30 * 1000,
  });

  const gaps = gapsQ.data?.gaps;
  const suggestions = gapsQ.data?.suggestions ?? [];

  const fmt = (tpl: string, n: number) => tpl.replace("{n}", String(n));

  const gapChips: { label: string; color: string }[] = gaps
    ? [
        {
          label: fmt(dict.today.gapsKcalLeft, gaps.kcalRemaining),
          color: "text-amber-600 dark:text-amber-400",
        },
        {
          label: fmt(dict.today.gapsProteinLeft, gaps.proteinRemaining),
          color: "text-rose-500",
        },
        {
          label: fmt(dict.today.gapsFiberLeft, gaps.fiberRemaining),
          color: "text-amber-600 dark:text-amber-400",
        },
        {
          label: fmt(dict.today.gapsWaterLeft, gaps.waterRemainingMl),
          color: "text-sky-500",
        },
      ].filter((g) => !g.label.startsWith("0"))
    : [];

  if (gapsQ.data && gapChips.length === 0 && suggestions.length === 0) {
    // Tüm hedefler tamamlandı — kutlama satırı
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        aria-busy={gapsQ.isFetching}
      >
        <Card className="kai-card-hover p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <Check className="h-4.5 w-4.5 text-emerald-500" aria-hidden />
            </span>
            <p className="text-sm font-medium">{dict.today.gapsAllGood}</p>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="kai-card-hover p-4">
        <div className="flex items-center justify-between gap-2 pb-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
              {dict.today.gapsTitle}
            </p>
            <p className="truncate text-xs text-muted-foreground">{dict.today.gapsSub}</p>
          </div>
          {gapsQ.isFetching && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>

        {gapsQ.isLoading ? (
          <div className="space-y-2 pt-1" aria-busy>
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-12 animate-pulse rounded-xl bg-muted" />
            <div className="h-12 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : gapsQ.isError ? (
          <p className="pt-1 text-xs text-muted-foreground">{dict.common.error}</p>
        ) : (
          <>
            {gapChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-2 pt-1">
                {gapChips.map((g) => (
                  <span
                    key={g.label}
                    className={cn(
                      "rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] font-medium tabular-nums",
                      g.color
                    )}
                  >
                    {g.label}
                  </span>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              {suggestions.map((s, i) => {
                const detail =
                  s.kind === "water"
                    ? `${s.ml} ml · 2× ${dict.today.waterGlass ?? ""}`
                    : `+${s.kind === "fiber" ? `${s.fiber} g fiber` : `${s.protein} g protein`} · ${s.grams} g · ${s.kcal} ${dict.common.kcal}`;
                return (
                  <SuggestionChip
                    key={`${s.kind}-${s.foodId ?? s.ml}`}
                    s={s}
                    detail={detail}
                    index={i}
                    onDone={() => gapsQ.refetch()}
                  />
                );
              })}
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
}
