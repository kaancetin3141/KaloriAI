"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import type { ProgressSummary } from "@/lib/types";

const WEEKS = 12;

function levelFor(kcal: number, target: number): 0 | 1 | 2 | 3 | 4 {
  if (kcal <= 0) return 0;
  const ratio = target > 0 ? kcal / target : 1;
  if (ratio > 1.1) return 4; // clearly over target
  if (ratio >= 0.8) return 3; // within target band
  if (ratio >= 0.5) return 2;
  return 1;
}

const CELL_TONES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-muted",
  1: "bg-primary/20",
  2: "bg-primary/40",
  3: "bg-primary",
  4: "bg-amber-500",
};

/** GitHub-style 12-week consistency calendar colored by daily intake vs target. */
export function StreakHeatmap() {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);

  const summaryQ = useQuery<ProgressSummary>({
    queryKey: ["summary", 90],
    queryFn: () => api<ProgressSummary>("/api/progress/summary?days=90"),
    staleTime: 60_000,
  });

  const grid = useMemo(() => {
    if (!summaryQ.data) return null;
    const byKcal = new Map(summaryQ.data.byDate.map((d) => [d.date, d.kcal]));
    const target = summaryQ.data.targets?.calories ?? 0;

    // Build 12 columns (weeks) × 7 rows, ending today, weeks start Monday
    const today = new Date();
    const end = new Date(today);
    // back to Monday of the current week
    end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
    const columns: { date: string; kcal: number; future: boolean; isToday: boolean }[][] = [];
    const fmt = (d: Date) => d.toLocaleDateString("en-CA");
    const todayStr = fmt(today);

    const cursor = new Date(end);
    for (let w = 0; w < WEEKS; w++) {
      const col: { date: string; kcal: number; future: boolean; isToday: boolean }[] = [];
      for (let day = 0; day < 7; day++) {
        const dateStr = fmt(cursor);
        col.push({
          date: dateStr,
          kcal: byKcal.get(dateStr) ?? 0,
          future: cursor > today,
          isToday: dateStr === todayStr,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      columns.push(col);
    }
    return columns;
  }, [summaryQ.data]);

  const loggedCount = useMemo(() => {
    if (!grid) return 0;
    return grid.flat().filter((c) => c.kcal > 0).length;
  }, [grid]);

  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        // 2025-01-06 is a Monday
        const d = new Date(Date.UTC(2025, 0, 6 + i));
        return d.toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", { weekday: "short" });
      }),
    [locale]
  );

  // Month label per column, shown only when the month changes and with a
  // minimum gap of 3 columns to prevent overlap on narrow grids
  const monthLabels = useMemo(() => {
    if (!grid) return [];
    const labels: string[] = [];
    let lastShown = -99;
    grid.forEach((col, i) => {
      const month = new Date(col[0].date + "T00:00:00").getMonth();
      const prevMonth = i > 0 ? new Date(grid[i - 1][0].date + "T00:00:00").getMonth() : -1;
      if (month !== prevMonth && i - lastShown >= 3) {
        labels.push(
          new Date(col[0].date + "T00:00:00").toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", {
            month: "short",
          })
        );
        lastShown = i;
      } else {
        labels.push("");
      }
    });
    return labels;
  }, [grid, locale]);

  if (summaryQ.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-500" aria-hidden />
            {dict.progress.heatmap}
          </CardTitle>
        </CardHeader>
        <CardContent aria-busy>
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!grid) return null;

  return (
    <Card className="kai-card-hover">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-500" aria-hidden />
          {dict.progress.heatmap}
        </CardTitle>
        <CardDescription>{dict.progress.heatmapSub}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-1">
          <div className="inline-flex flex-col gap-1" role="img" aria-label={dict.progress.heatmap}>
            {/* month labels */}
            <div className="flex gap-[3px] pl-7">
              {monthLabels.map((m, i) => (
                <span key={i} className="w-3 text-[9px] leading-none text-muted-foreground">
                  {m}
                </span>
              ))}
            </div>
            {grid[0]?.map((_, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-[3px]">
                <span className="w-6 text-[9px] leading-none text-muted-foreground">
                  {dayIdx % 2 === 1 ? weekdayLabels[dayIdx] : ""}
                </span>
                {grid.map((col) => {
                  const cell = col[dayIdx];
                  const level = levelFor(cell.kcal, summaryQ.data?.targets?.calories ?? 0);
                  return (
                    <span
                      key={cell.date}
                      className={cn(
                        "kai-heat-cell h-3 w-3 shrink-0 rounded-[3px]",
                        CELL_TONES[level],
                        cell.future && "bg-transparent shadow-none",
                        cell.isToday && "ring-1 ring-primary ring-offset-1 ring-offset-card"
                      )}
                      title={`${cell.date}${cell.kcal > 0 ? ` · ${Math.round(cell.kcal)} kcal` : ""}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {/* legend */}
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{dict.progress.heatmapLess}</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={cn("h-2.5 w-2.5 rounded-[2px]", CELL_TONES[l as 0 | 1 | 2 | 3 | 4])} />
          ))}
          <span>{dict.progress.heatmapMore}</span>
          {loggedCount > 0 && <span className="ml-auto font-medium">{loggedCount}/84</span>}
        </div>
      </CardContent>
    </Card>
  );
}
