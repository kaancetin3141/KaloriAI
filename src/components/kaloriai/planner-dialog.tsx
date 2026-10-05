"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarRange,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import nextDynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ApiError, api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";

/**
 * Premium paywall (owned by another agent). Loaded lazily so the planner
 * dialog itself stays light; if the module is not part of the build yet,
 * swap this for an inline fallback panel.
 */
const PaywallDialog = nextDynamic(
  () => import("@/components/kaloriai/paywall-dialog").then((m) => ({ default: m.PaywallDialog })),
  { ssr: false, loading: () => null }
);

/** Local YYYY-MM-DD */
const fmtDate = (d = new Date()) => d.toLocaleDateString("en-CA");

interface PlannerItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
interface PlannerMeal {
  mealType: string;
  name: string;
  items: PlannerItem[];
}
interface PlannerPlan {
  meals: PlannerMeal[];
  totalKcal: number;
  shoppingList: string[];
}

const MEAL_KEYS = ["breakfast", "lunch", "dinner", "snacks"] as const;
type MealKey = (typeof MEAL_KEYS)[number];

const toMealKey = (mt: string): MealKey =>
  ((MEAL_KEYS as readonly string[]).includes(mt) ? mt : "snacks") as MealKey;

export function PlannerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dict, locale } = useAppStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const date = useMemo(() => fmtDate(), []);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const planQuery = useQuery({
    queryKey: ["planner", date],
    enabled: open,
    queryFn: () => api<{ plan: PlannerPlan | null }>(`/api/planner?date=${date}`),
  });

  const mealLabel = (mt: string, fallback: string) => {
    const key = (MEAL_KEYS as readonly string[]).includes(mt) ? (mt as MealKey) : null;
    return key ? dict.today[key] : fallback;
  };

  const generate = useMutation({
    mutationFn: () => api<{ plan: PlannerPlan }>("/api/planner", { body: { date, locale } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["planner", date] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === "PREMIUM_REQUIRED") {
        setPaywallOpen(true);
        return;
      }
      toast({ description: dict.common.error, variant: "destructive" });
    },
  });

  /** Convert plan meals → diary meal logs, invalidate, close */
  const addAll = useMutation({
    mutationFn: async (plan: PlannerPlan) => {
      const meals = plan.meals.filter((m) => m.items.length > 0);
      await Promise.all(
        meals.map((m) =>
          api("/api/diary", {
            body: {
              date,
              mealType: toMealKey(m.mealType),
              items: m.items.map((it) => ({
                name: it.name,
                grams: it.grams,
                kcal: it.kcal,
                protein: it.protein,
                carbs: it.carbs,
                fat: it.fat,
                fiber: 0,
                source: "manual",
              })),
            },
          })
        )
      );
    },
    onSuccess: () => {
      toast({ description: dict.diary.saved });
      void qc.invalidateQueries({ queryKey: ["diary"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === "PREMIUM_REQUIRED") {
        setPaywallOpen(true);
        return;
      }
      toast({ description: dict.common.error, variant: "destructive" });
    },
  });

  const plan = planQuery.data?.plan ?? null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <DialogContent className="kai-scroll max-h-[90vh] overflow-y-auto sm:max-w-lg lg:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" aria-hidden />
              {dict.planner.title}
              <Badge
                variant="outline"
                className="gap-1 border-amber-400/40 bg-amber-400/10 text-[10px] text-amber-600 dark:text-amber-400"
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                Premium
              </Badge>
            </DialogTitle>
            <DialogDescription className="tabular-nums">{date}</DialogDescription>
          </DialogHeader>

          {planQuery.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-14 w-full rounded-xl" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            </div>
          ) : plan && plan.meals.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Summary */}
              <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{dict.common.total}</p>
                  <p className="text-xl font-bold tabular-nums">
                    {Math.round(plan.totalKcal)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">{dict.common.kcal}</span>
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="gap-1 border-primary/40 bg-primary/10 text-primary"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {dict.planner.fitsTargets}
                </Badge>
              </div>

              {/* Meals */}
              <div className="grid gap-3 sm:grid-cols-2">
                {plan.meals.map((meal) => {
                  const kcal = Math.round(meal.items.reduce((a, i) => a + i.kcal, 0));
                  return (
                    <div key={`${meal.mealType}-${meal.name}`} className="rounded-xl border bg-card p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="text-sm font-semibold">{mealLabel(meal.mealType, meal.name)}</h4>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {kcal} {dict.common.kcal}
                        </span>
                      </div>
                      {meal.name && mealLabel(meal.mealType, "") !== meal.name && (
                        <p className="text-xs text-muted-foreground">{meal.name}</p>
                      )}
                      <ul className="mt-2 space-y-1.5">
                        {meal.items.map((it, i) => (
                          <li
                            key={`${it.name}-${i}`}
                            className="flex items-baseline justify-between gap-2 text-sm"
                          >
                            <span className="min-w-0 truncate">
                              {it.name}
                              {it.grams > 0 && (
                                <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                                  {Math.round(it.grams)} {dict.common.g}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {Math.round(it.kcal)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* Shopping list */}
              {plan.shoppingList.length > 0 && (
                <div className="rounded-xl border bg-card p-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <ShoppingBasket className="h-4 w-4 text-primary" aria-hidden />
                    {dict.planner.shoppingList}
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {plan.shoppingList.map((line, i) => (
                      <li key={`${line}-${i}`} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                className="min-h-[44px] w-full"
                onClick={() => addAll.mutate(plan)}
                disabled={addAll.isPending || plan.meals.length === 0}
              >
                {addAll.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden />
                )}
                {dict.planner.addAll}
              </Button>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <CalendarRange className="h-7 w-7 text-primary" aria-hidden />
              </span>
              <div>
                <p className="font-medium">{dict.planner.generate}</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">{dict.planner.premiumOnly}</p>
              </div>
              <Button
                className="min-h-[44px]"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                {dict.planner.generate}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PaywallDialog open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </>
  );
}
