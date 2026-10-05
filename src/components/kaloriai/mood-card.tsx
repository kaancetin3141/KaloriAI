"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartPulse, SmilePlus, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type Mood = "great" | "good" | "okay" | "low" | "bad";

const MOOD_EMOJI: Record<Mood, string> = {
  great: "🤩",
  good: "🙂",
  okay: "😐",
  low: "😕",
  bad: "😣",
};

const MOOD_BAR: Record<Mood, string> = {
  great: "bg-emerald-500",
  good: "bg-primary",
  okay: "bg-amber-500",
  low: "bg-orange-500",
  bad: "bg-rose-500",
};

const MOOD_RING: Record<Mood, string> = {
  great: "bg-emerald-500/15 ring-emerald-500/50",
  good: "bg-primary/15 ring-primary/50",
  okay: "bg-amber-500/15 ring-amber-500/50",
  low: "bg-orange-500/15 ring-orange-500/50",
  bad: "bg-rose-500/15 ring-rose-500/50",
};

const MOOD_ORDER: Mood[] = ["great", "good", "okay", "low", "bad"];

interface MoodStatDay {
  date: string;
  mood: Mood;
  kcal: number | null;
  targetPct: number | null;
}

interface MoodStatsResponse {
  ok: boolean;
  count: number;
  days: MoodStatDay[];
  moodCounts: Record<string, number>;
  positiveRate: number | null;
  negativeRate: number | null;
  samples: { positive: number; negative: number };
}

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Last N calendar days as ISO strings, oldest first. */
function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const p = (x: number) => String(x).padStart(2, "0");
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return out;
}

/**
 * Mood & nutrition insight card — shows the relation between daily mood
 * and calorie-target adherence. Mounted on the Progress screen.
 */
export function MoodCard() {
  const dict = useAppStore((s) => s.dict) as Dictionary;

  const statsQ = useQuery<MoodStatsResponse>({
    queryKey: ["mood-stats", 30],
    queryFn: () => api("/api/note/stats?days=30"),
    staleTime: 60_000,
  });

  const stripDays = useMemo(() => {
    if (!statsQ.data?.days) return [];
    const byDate = new Map(statsQ.data.days.map((d) => [d.date, d.mood]));
    return lastNDates(14).map((date) => ({ date, mood: byDate.get(date) ?? null }));
  }, [statsQ.data]);

  const maxCount = useMemo(() => {
    const counts = statsQ.data?.moodCounts;
    if (!counts) return 0;
    return Math.max(1, ...MOOD_ORDER.map((m) => counts[m] ?? 0));
  }, [statsQ.data]);

  const insight = useMemo(() => {
    const s = statsQ.data;
    if (!s || s.positiveRate === null || s.negativeRate === null) return null;
    if (s.samples.positive + s.samples.negative < 3) return null;
    if (s.positiveRate > s.negativeRate) {
      const pct = Math.round((s.positiveRate - s.negativeRate) * 100);
      if (pct >= 5) return dict.moodStats.insightPositive.replace("{pct}", String(pct));
    }
    return null;
  }, [statsQ.data, dict]);

  const isLoading = statsQ.isLoading;
  const hasData = (statsQ.data?.count ?? 0) > 0;

  return (
    <Card className="p-4" aria-label={dict.moodStats.title}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/15">
          <HeartPulse className="h-4 w-4 text-rose-500" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">{dict.moodStats.title}</h3>
          <p className="text-xs text-muted-foreground">{dict.moodStats.subtitle}</p>
        </div>
        {hasData && statsQ.data && (
          <Badge variant="secondary" className="shrink-0 text-[11px] tabular-nums">
            {statsQ.data.count} {dict.moodStats.daysWith}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2.5" aria-busy>
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4 rounded-full" />
          <Skeleton className="h-4 w-2/3 rounded-full" />
        </div>
      ) : !hasData ? (
        /* Empty state */
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center">
          <SmilePlus className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <p className="text-sm font-medium">{dict.moodStats.emptyTitle}</p>
          <p className="max-w-sm text-xs text-muted-foreground">{dict.moodStats.empty}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* 14-day mood strip */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{dict.moodStats.strip}</div>
            <div className="flex flex-wrap gap-1.5" role="list" aria-label={dict.moodStats.strip}>
              {stripDays.map(({ date, mood }) => (
                <span
                  key={date}
                  role="listitem"
                  aria-label={
                    mood
                      ? `${date} — ${dict.journal[mood]}`
                      : `${date} — ${dict.moodStats.noLog}`
                  }
                  title={date}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm ring-1",
                    mood ? MOOD_RING[mood] : "border-dashed border-border ring-transparent opacity-60"
                  )}
                >
                  {mood ? <span aria-hidden>{MOOD_EMOJI[mood]}</span> : <span aria-hidden className="h-1 w-1 rounded-full bg-muted-foreground/40" />}
                </span>
              ))}
            </div>
          </div>

          {/* Distribution bars */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{dict.moodStats.distribution}</div>
            <div className="space-y-1.5">
              {MOOD_ORDER.map((m) => {
                const count = statsQ.data?.moodCounts[m] ?? 0;
                return (
                  <div key={m} className="flex items-center gap-2">
                    <span className="w-6 text-center text-sm" aria-hidden>{MOOD_EMOJI[m]}</span>
                    <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">{dict.journal[m]}</span>
                    <div
                      className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={maxCount}
                      aria-valuenow={count}
                      aria-label={`${dict.journal[m]}: ${count}`}
                    >
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", MOOD_BAR[m])}
                        style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Insight */}
          <div
            className={cn(
              "flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs",
              insight ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted/60 text-muted-foreground"
            )}
          >
            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p>{insight ?? dict.moodStats.insightNeutral}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
