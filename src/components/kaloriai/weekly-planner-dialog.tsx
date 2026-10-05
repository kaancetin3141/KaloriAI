"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Utensils,
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
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ApiError, api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";

const PaywallDialog = nextDynamic(
  () => import("@/components/kaloriai/paywall-dialog").then((m) => ({ default: m.PaywallDialog })),
  { ssr: false, loading: () => null }
);

const fmtDate = (d: Date) => d.toLocaleDateString("en-CA");

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

const MEAL_DOTS: Record<string, string> = {
  breakfast: "bg-amber-400",
  lunch: "bg-primary",
  dinner: "bg-rose-400",
  snacks: "bg-chart-2",
};

export function WeeklyPlannerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dict, locale } = useAppStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [addingDay, setAddingDay] = useState<string | null>(null);

  const weekOf = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
    d.setHours(12, 0, 0, 0);
    return d;
  }, [weekOffset]);

  const dates = useMemo(() => {
    const out: string[] = [];
    const d = new Date(weekOf);
    for (let i = 0; i < 7; i++) {
      out.push(fmtDate(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [weekOf]);

  const weekQuery = useQuery({
    queryKey: ["planner-week", dates[0]],
    enabled: open,
    queryFn: () =>
      api<{ ok: boolean; plans: Record<string, PlannerPlan | undefined>; dates: string[] }>(
        `/api/planner?week=${dates[0]}`
      ),
  });

  const plans = weekQuery.data?.plans ?? {};
  const plannedDays = dates.filter((d) => plans[d] && plans[d]!.meals.length > 0);

  const generate = useMutation({
    mutationFn: () => api("/api/planner", { body: { date: dates[0], locale, scope: "week" } }),
    onSuccess: () => {
      toast({ description: dict.planner.planSavedAll });
      void qc.invalidateQueries({ queryKey: ["planner-week", dates[0]] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === "PREMIUM_REQUIRED") {
        setPaywallOpen(true);
        return;
      }
      toast({ description: dict.common.error, variant: "destructive" });
    },
  });

  const addDay = useMutation({
    mutationFn: async ({ date, plan }: { date: string; plan: PlannerPlan }) => {
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
      toast({ description: dict.planner.dayAdded });
      void qc.invalidateQueries({ queryKey: ["diary"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      setAddingDay(null);
    },
    onError: (e: unknown) => {
      setAddingDay(null);
      if (e instanceof ApiError && e.code === "PREMIUM_REQUIRED") {
        setPaywallOpen(true);
        return;
      }
      toast({ description: dict.common.error, variant: "destructive" });
    },
  });

  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { weekday: "short" }),
    [locale]
  );
  const dayNumFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short" }),
    [locale]
  );
  const rangeFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long" }),
    [locale]
  );

  const todayStr = fmtDate(new Date());
  const isCurrentWeek = weekOffset === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="kai-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg lg:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
              {dict.planner.weekView}
              <Badge
                variant="outline"
                className="gap-1 border-amber-400/40 bg-amber-400/10 text-[10px] text-amber-600 dark:text-amber-400"
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                Premium
              </Badge>
            </DialogTitle>
            <DialogDescription>{dict.planner.weekViewSub}</DialogDescription>
          </DialogHeader>

          {/* Week navigation */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setWeekOffset((w) => w - 1)}
              aria-label={dict.common.back}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <p className="text-sm font-medium tabular-nums">
              {rangeFmt.format(weekOf)} –{" "}
              {(() => {
                const end = new Date(weekOf);
                end.setDate(end.getDate() + 6);
                return rangeFmt.format(end);
              })()}
              {isCurrentWeek && (
                <span className="ml-2 text-xs text-muted-foreground">({dict.common.today})</span>
              )}
            </p>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setWeekOffset((w) => w + 1)}
              aria-label={dict.common.next}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          {weekQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-36 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* 7-day grid */}
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {dates.map((date, i) => {
                  const plan = plans[date];
                  const hasPlan = plan && plan.meals.length > 0;
                  const kcal = hasPlan ? Math.round(plan.totalKcal) : 0;
                  const isToday = date === todayStr;
                  return (
                    <div
                      key={date}
                      className={cn(
                        "rounded-xl border bg-card p-3 transition-shadow hover:shadow-md",
                        isToday && "ring-1 ring-primary/50"
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-1.5">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {dayFmt.format(new Date(`${date}T12:00:00`))}
                          </span>
                          <p className="text-sm font-medium leading-tight tabular-nums">
                            {dayNumFmt.format(new Date(`${date}T12:00:00`))}
                            {isToday && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-label={dict.common.today} />}
                          </p>
                        </div>
                        {hasPlan ? (
                          <Badge variant="secondary" className="text-[10px] tabular-nums">
                            {kcal} {dict.common.kcal}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">{dict.planner.noPlanYet}</span>
                        )}
                      </div>

                      {hasPlan && (
                        <ul className="mt-2 space-y-1">
                          {plan.meals.slice(0, 4).map((m, j) => {
                            const key = toMealKey(m.mealType);
                            const first = m.items[0];
                            return (
                              <li key={`${m.mealType}-${j}`} className="flex items-center gap-1.5 text-xs">
                                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", MEAL_DOTS[key] ?? "bg-muted-foreground")} aria-hidden />
                                <span className="min-w-0 flex-1 truncate">
                                  {dict.today[key]}
                                  {first ? ` · ${m.items.length}× ${first.name}` : ""}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {Math.round(m.items.reduce((a, it) => a + it.kcal, 0))}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {hasPlan && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2.5 min-h-[36px] w-full text-xs"
                          disabled={addingDay === date}
                          onClick={() => {
                            setAddingDay(date);
                            addDay.mutate({ date, plan: plan! });
                          }}
                        >
                          {addingDay === date ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {dict.planner.applyDay}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Generate / regenerate */}
              <Button
                className="kai-pressable min-h-[44px] w-full"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {dict.common.loading}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden />
                    {plannedDays.length > 0 ? dict.planner.regenWeek : dict.planner.generateWeek}
                  </>
                )}
              </Button>

              {/* Merged shopping list (from Monday plan) */}
              {(() => {
                const mondayPlan = plans[dates[0]];
                const list = mondayPlan?.shoppingList ?? [];
                if (list.length === 0) return null;
                return (
                  <motion.section
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="rounded-xl border bg-card p-4"
                    aria-label={dict.planner.shoppingList}
                  >
                    <h4 className="flex items-center gap-2 text-sm font-semibold">
                      <ShoppingBasket className="h-4 w-4 text-primary" aria-hidden />
                      {dict.planner.shoppingList}
                      <Badge variant="secondary" className="text-[10px] tabular-nums">
                        {list.length}
                      </Badge>
                    </h4>
                    <ul className="mt-2.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                      {list.map((line, i) => (
                        <li key={`${line}-${i}`} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.section>
                );
              })()}

              {/* Week stats strip */}
              {plannedDays.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    {
                      label: dict.planner.weekAvg,
                      value: Math.round(
                        plannedDays.reduce((a, d) => a + (plans[d]?.totalKcal ?? 0), 0) / plannedDays.length
                      ),
                      unit: dict.common.kcal,
                      icon: Utensils,
                    },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl border bg-muted/40 p-3 text-center">
                      <p className="text-lg font-bold tabular-nums">
                        {c.value}
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">{c.unit}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">{c.label}</p>
                    </div>
                  ))}
                  <div className="rounded-xl border bg-muted/40 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">{plannedDays.length}/7</p>
                    <p className="text-[10px] text-muted-foreground">{dict.planner.week}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/40 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">{generate.isPending ? "…" : plans[dates[0]]?.shoppingList.length ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">{dict.planner.shoppingList}</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Regenerate hint (subtle refresh row) */}
          {plannedDays.length > 0 && !generate.isPending && (
            <button
              type="button"
              onClick={() => generate.mutate()}
              className="mx-auto flex min-h-[36px] items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              {dict.planner.regenWeek}
            </button>
          )}
        </DialogContent>
      </Dialog>

      <PaywallDialog open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </>
  );
}
