"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarRange, Flame, TrendingDown, TrendingUp, Utensils, Beef, Droplets, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ProgressSummary } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

/** Week-over-week comparison (MacroFactor-style weekly averages) */
export function WeekCard() {
  const dict = useAppStore((s) => s.dict);

  const q = useQuery({
    queryKey: ["summary-14"],
    queryFn: () => api<ProgressSummary>(`/api/progress/summary?days=14`),
  });

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-5 w-44 rounded-md" aria-hidden />
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" aria-hidden />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (q.isError || !q.data) return null;

  const byDate = q.data.byDate ?? [];
  const thisWeek = byDate.slice(-7);
  const lastWeek = byDate.slice(0, 7);
  const logged = (rows: typeof byDate) => rows.filter((d) => d.kcal > 0);
  const avg = (rows: typeof byDate, key: "kcal" | "protein" | "waterMl") => {
    const l = logged(rows);
    if (l.length === 0) return 0;
    return Math.round(l.reduce((a, d) => a + d[key], 0) / l.length);
  };

  const t = q.data.targets?.calories ?? 2000;
  const thisKcal = avg(thisWeek, "kcal");
  const lastKcal = avg(lastWeek, "kcal");
  const thisP = avg(thisWeek, "protein");
  const lastP = avg(lastWeek, "protein");
  const thisW = avg(thisWeek, "waterMl");
  const lastW = avg(lastWeek, "waterMl");
  const thisDays = logged(thisWeek).length;
  const lastDays = logged(lastWeek).length;
  const thisBurn = thisWeek.reduce((a, d) => a + d.burned, 0);
  const lastBurn = lastWeek.reduce((a, d) => a + d.burned, 0);

  const hasBoth = thisDays > 0 && lastDays > 0;

  type Row = {
    icon: typeof Flame;
    label: string;
    last: string;
    now: string;
    delta: number;
    /** direction considered favorable → colors the delta chip */
    goodWhen: "up" | "down" | "closer" | "none";
  };
  const rows: Row[] = [
    { icon: Flame, label: dict.progress.avgCalories, last: `${lastKcal}`, now: `${thisKcal}`, delta: thisKcal - lastKcal, goodWhen: "closer" },
    { icon: Beef, label: dict.progress.avgProtein, last: `${lastP}g`, now: `${thisP}g`, delta: thisP - lastP, goodWhen: "up" },
    { icon: Utensils, label: dict.progress.wowDays, last: `${lastDays}`, now: `${thisDays}`, delta: thisDays - lastDays, goodWhen: "up" },
    { icon: Droplets, label: dict.today.water, last: `${lastW}`, now: `${thisW}`, delta: thisW - lastW, goodWhen: "up" },
    { icon: Flame, label: dict.progress.wowBurned, last: `${lastBurn}`, now: `${thisBurn}`, delta: thisBurn - lastBurn, goodWhen: "up" },
  ];

  const fmtDelta = (r: Row) => {
    if (r.delta === 0) return "0";
    const abs = Math.abs(r.delta);
    return `${r.delta > 0 ? "+" : "−"}${abs >= 1000 ? `${Math.round(abs / 1000)}k` : abs}`;
  };
  const isGood = (r: Row) => {
    if (r.goodWhen === "up") return r.delta > 0;
    if (r.goodWhen === "down") return r.delta < 0;
    if (r.goodWhen === "closer") return Math.abs(thisKcal - t) < Math.abs(lastKcal - t);
    return null;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="kai-card-hover">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10" aria-hidden>
              <CalendarRange className="h-4 w-4 text-primary" />
            </span>
            {dict.progress.wowTitle}
          </CardTitle>
          <CardDescription>{dict.progress.wowSub}</CardDescription>
        </CardHeader>
        <CardContent>
          {hasBoth ? (
            <ul className="space-y-2">
              {rows.map((r, i) => {
                const good = isGood(r);
                return (
                  <motion.li
                    key={r.label}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40"
                  >
                    <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{r.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums" title={dict.progress.wowLast}>
                      {r.last}
                    </span>
                    {r.delta > 0 ? (
                      <TrendingUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    ) : r.delta < 0 ? (
                      <TrendingDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{r.now}</span>
                    <span
                      className={cn(
                        "w-14 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium tabular-nums",
                        r.delta === 0
                          ? "bg-muted text-muted-foreground"
                          : good
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {fmtDelta(r)}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-center">
              <CalendarRange className="h-7 w-7 text-muted-foreground/50" aria-hidden />
              <p className="max-w-[280px] text-xs text-muted-foreground">{dict.progress.wowEmpty}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
