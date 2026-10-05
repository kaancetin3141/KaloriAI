"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Info, TrendingDown, TrendingUp, Trophy, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { projectGoalWeight } from "@/lib/calculations";
import { kgToLb } from "@/lib/units";
import type { ProgressSummary } from "@/lib/types";

interface ProfileLean {
  profile: {
    goalWeightKg?: number | null;
    weeklyRateKg?: number | null;
    goal?: string | null;
  } | null;
}

/**
 * Goal weight projection — MacroFactor-style trend extrapolation.
 * Uses the last 14 weigh-ins (90-day summary cache) + profile goal.
 */
export function ProjectionCard() {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const unitSystem = useAppStore((s) => s.user?.unitSystem ?? "metric");
  const isImperial = unitSystem === "imperial";
  const weightUnit = isImperial ? dict.common.lb : dict.common.kg;
  const toDisp = (kg: number) => (isImperial ? Math.round(kgToLb(kg) * 100) / 100 : Math.round(kg * 100) / 100);

  const summaryQ = useQuery<ProgressSummary>({
    queryKey: ["summary", 90],
    queryFn: () => api<ProgressSummary>("/api/progress/summary?days=90"),
    staleTime: 60_000,
  });

  const profileQ = useQuery<ProfileLean>({
    queryKey: ["profile-lean"],
    queryFn: () => api<ProfileLean>("/api/profile"),
    staleTime: 5 * 60_000,
  });

  const projection = useMemo(() => {
    const weights = (summaryQ.data?.measurements ?? [])
      .filter((m) => m.weightKg != null)
      .map((m) => ({ date: m.date, weightKg: m.weightKg as number }));
    const p = profileQ.data?.profile;
    return projectGoalWeight({
      weights,
      goalWeightKg: p?.goalWeightKg ?? null,
      weeklyRateKg: p?.weeklyRateKg ?? 0.5,
      goal: p?.goal ?? null,
    });
  }, [summaryQ.data, profileQ.data]);

  const etaLabel = useMemo(() => {
    if (!projection.etaDate) return "";
    try {
      return new Date(projection.etaDate + "T00:00:00").toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return projection.etaDate;
    }
  }, [projection.etaDate, locale]);

  if (summaryQ.isLoading || profileQ.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
            {dict.progress.projection}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" aria-busy>
          <Skeleton className="h-10 w-2/3 rounded-xl" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  const trend = projection.trendKgPerWeek;

  return (
    <Card className="kai-card-hover">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
          {dict.progress.projection}
        </CardTitle>
        <CardDescription>{dict.progress.projectionSub}</CardDescription>
      </CardHeader>
      <CardContent>
        {projection.status === "on_track" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground">{dict.progress.projectionEta}</p>
              <p className="kai-gradient-text mt-1 text-2xl font-bold tracking-tight tabular-nums">{etaLabel}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-primary/5">
                  {projection.weeksLeft} {dict.progress.projectionWeeksLeft}
                </Badge>
                {trend != null && (
                  <Badge variant="outline" className="gap-1 bg-primary/5">
                    {trend < 0 ? <TrendingDown className="h-3 w-3" aria-hidden /> : <TrendingUp className="h-3 w-3" aria-hidden />}
                    {Math.abs(toDisp(trend)).toFixed(2)} {weightUnit} {dict.progress.projectionPerWeek}
                  </Badge>
                )}
              </div>
            </div>
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
                projection.trendFromData ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}
              aria-hidden
            >
              <CalendarClock className="h-8 w-8" />
            </div>
          </div>
        )}

        {projection.status === "reached" && (
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-chart-2/10 text-chart-2" aria-hidden>
              <Trophy className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium">{dict.progress.projectionGoalReached}</p>
          </div>
        )}

        {projection.status === "off_track" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{dict.progress.projectionOffTrack}</p>
            </div>
            {trend != null && (
              <Badge variant="outline" className="w-fit gap-1">
                {trend < 0 ? <TrendingDown className="h-3 w-3" aria-hidden /> : <TrendingUp className="h-3 w-3" aria-hidden />}
                {dict.progress.projectionTrend}: {toDisp(trend).toFixed(2)} {weightUnit} {dict.progress.projectionPerWeek}
              </Badge>
            )}
          </div>
        )}

        {projection.status === "no_data" && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            <p className="text-sm">{dict.progress.projectionNoData}</p>
          </div>
        )}

        {projection.status === "no_goal" && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            <p className="text-sm">{dict.progress.projectionNoGoal}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
