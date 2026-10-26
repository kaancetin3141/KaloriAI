"use client";

/**
 * Exercise detail sheet (openGym-inspired): e1RM/rep progress curve,
 * best lift, session count, total volume and the last session's sets.
 * Opens from the active session's exercise cards and from history rows.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Trophy, History as HistoryIcon, TrendingUp, Layers, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { EXERCISE_MAP } from "@/lib/exercise-catalog";
import { muscleBadgeClass } from "./exercise-picker";

interface HistoryEntry {
  date: string;
  sets: { reps: number; weightKg: number; rir?: number; pr?: boolean }[];
  best1RM: number;
  metric: number;
}

interface Props {
  exerciseKey: string | null;
  name: string;
  onOpenChange: (v: boolean) => void;
}

export function ExerciseDetailSheet({ exerciseKey, name, onOpenChange }: Props) {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);

  const open = exerciseKey !== null;

  const histQ = useQuery<{ history: HistoryEntry[]; best: number; bestMetric: number; last: HistoryEntry["sets"] | null }>({
    queryKey: ["exdetail", exerciseKey],
    queryFn: () =>
      api(`/api/workouts/exercise?exerciseKey=${encodeURIComponent(exerciseKey ?? "")}`),
    enabled: open && !!exerciseKey && !exerciseKey.startsWith("custom:"),
    staleTime: 60_000,
  });

  const cat = exerciseKey ? EXERCISE_MAP[exerciseKey] : undefined;
  const isCustom = !!exerciseKey?.startsWith("custom:");
  const weighted = (histQ.data?.history ?? []).some((h) => h.sets.some((s) => s.weightKg > 0));

  const chartData = useMemo(() => {
    const rows = (histQ.data?.history ?? []).slice().reverse(); // oldest → newest
    return rows.map((h, i) => ({
      idx: i + 1,
      value: h.metric,
      date: new Date(h.date).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", {
        day: "numeric",
        month: "short",
      }),
    }));
  }, [histQ.data, locale]);

  const history = histQ.data?.history ?? [];
  const totalVolume = history.reduce((v, h) => v + h.sets.reduce((x, s) => x + s.reps * s.weightKg, 0), 0);
  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--card-foreground)",
    fontSize: 12,
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] max-h-[85vh] p-0 rounded-t-3xl sm:max-w-lg sm:mx-auto sm:rounded-3xl sm:border flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base flex-wrap">
            <span className="truncate">{name}</span>
            {cat && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${muscleBadgeClass(cat.muscle)}`}>
                {dict.guided.muscles[cat.muscle]}
              </span>
            )}
          </SheetTitle>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            {cat ? (dict.guided.equipment[cat.equipment] + (cat.compound ? " · ★ " + dict.guided.detail.curve : "")) : dict.guided.custom}
            {isCustom && <span className="text-[10px]">({dict.guided.detail.noData})</span>}
          </p>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto kai-scroll p-4 space-y-4">
          {isCustom ? (
            <p className="text-sm text-muted-foreground text-center py-8">{dict.guided.detail.noData}</p>
          ) : histQ.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{dict.guided.detail.noData}</p>
          ) : (
            <>
              {/* stat chips */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: dict.guided.detail.bestMetric, value: Math.round(histQ.data?.bestMetric ?? 0), icon: Trophy },
                  { label: dict.guided.detail.sessions, value: history.length, icon: HistoryIcon },
                  {
                    label: dict.guided.detail.totalVolume,
                    value: `${(totalVolume / 1000).toFixed(1)}${dict.guided.tonnage}`,
                    icon: Layers,
                  },
                  {
                    label: dict.guided.lastTime,
                    value: (() => {
                      const l = histQ.data?.last?.[0];
                      return l ? (l.weightKg > 0 ? `${l.weightKg}${dict.common.kg}` : `${l.reps}×`) : "–";
                    })(),
                    icon: TrendingUp,
                  },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-xl bg-muted/50 px-2 py-2 text-center space-y-0.5">
                    <Icon className="h-3.5 w-3.5 mx-auto text-muted-foreground" aria-hidden />
                    <p className="text-sm font-bold tabular-nums leading-none">{value}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{label}</p>
                  </div>
                ))}
              </div>

              {/* progress curve */}
              <div className="rounded-2xl border bg-card p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {weighted ? dict.guided.detail.curveE1rm : dict.guided.detail.curveReps}
                </p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="idx" fontSize={10} stroke="var(--muted-foreground)" axisLine={false} tickLine={false} />
                      <YAxis fontSize={10} stroke="var(--muted-foreground)" axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number | string) => [
                          `${Number(value).toLocaleString()}${weighted ? " e1RM" : " ×"}`,
                          weighted ? dict.guided.detail.curveE1rm : dict.guided.detail.curveReps,
                        ]}
                        labelFormatter={(i: number) => chartData[Number(i) - 1]?.date ?? ""}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--chart-2)"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "var(--chart-2)" }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* last performance sets */}
              <div className="rounded-2xl border bg-card p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{dict.guided.detail.lastPerf}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(histQ.data?.last ?? []).map((s, i) => (
                    <span
                      key={i}
                      className={`rounded-lg px-2 py-1 text-[11px] tabular-nums border ${
                        s.pr ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-background"
                      }`}
                    >
                      <span className="text-muted-foreground">{i + 1}:</span>{" "}
                      {s.weightKg > 0 ? `${s.weightKg}${dict.common.kg} × ` : ""}
                      {s.reps}
                      {s.rir != null && <span className="text-muted-foreground"> · RIR {s.rir}</span>}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
