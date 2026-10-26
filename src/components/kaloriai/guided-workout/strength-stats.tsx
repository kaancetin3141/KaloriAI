"use client";

/**
 * Strength stats (openGym-inspired): weekly/30-day volume per muscle group,
 * best lifts by estimated 1RM, and a PR feed.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { Trophy, TrendingUp, Dumbbell, Layers, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";

interface StatsResponse {
  days: number;
  totals: { sessions: number; sets: number; volume: number; prs: number };
  volumeByMuscle: { muscle: string; volume: number; sets: number }[];
  bestLifts: { exerciseKey: string; name: string; e1rm: number; weightKg: number; reps: number }[];
  recentPRs: { date: string; exerciseKey: string; name: string; weightKg: number; reps: number; e1rm: number }[];
}

const MUSCLE_BAR_COLORS: Record<string, string> = {
  chest: "#f43f5e",
  back: "#10b981",
  shoulders: "#f59e0b",
  biceps: "#0ea5e9",
  triceps: "#f97316",
  quads: "#8b5cf6",
  hamstrings: "#d946ef",
  glutes: "#ec4899",
  core: "#14b8a6",
  calves: "#84cc16",
  forearms: "#06b6d4",
};

export function StrengthStats() {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const [days, setDays] = useState<7 | 30>(7);

  const statsQ = useQuery<StatsResponse>({
    queryKey: ["wstats", days],
    queryFn: () => api<StatsResponse>(`/api/workouts/stats?days=${days}`),
    staleTime: 60_000,
  });

  const d = statsQ.data;
  const volumeData = (d?.volumeByMuscle ?? []).filter((v) => v.volume > 0);
  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--card-foreground)",
    fontSize: 12,
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
            {dict.guided.volumeTitle}
          </CardTitle>
          <div className="flex rounded-lg bg-muted p-0.5" role="tablist" aria-label={dict.guided.volumeTitle}>
            {([7, 30] as const).map((n) => (
              <button
                key={n}
                role="tab"
                aria-selected={days === n}
                onClick={() => setDays(n)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  days === n ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {n}d
              </button>
            ))}
          </div>
        </div>
        <CardDescription>{dict.guided.volumeSub}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {statsQ.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : !d || d.totals.sessions === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{dict.guided.noHistory}</p>
        ) : (
          <>
            {/* totals chips */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: dict.guided.sessionsCount, value: d.totals.sessions, icon: Dumbbell },
                { label: dict.guided.setsDone, value: d.totals.sets, icon: Layers },
                { label: dict.guided.volume, value: `${(d.totals.volume / 1000).toFixed(1)}${dict.guided.tonnage}`, icon: TrendingUp },
                { label: "PR", value: d.totals.prs, icon: Trophy },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl bg-muted/50 px-2 py-2 text-center space-y-0.5">
                  <Icon className="h-3.5 w-3.5 mx-auto text-muted-foreground" aria-hidden />
                  <p className="text-sm font-bold tabular-nums leading-none">{value}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{label}</p>
                </div>
              ))}
            </div>

            {/* volume by muscle */}
            {volumeData.length > 0 && (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" fontSize={10} stroke="var(--muted-foreground)" axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="muscle"
                      width={76}
                      fontSize={11}
                      stroke="var(--muted-foreground)"
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(m: string) => dict.guided.muscles[m as keyof typeof dict.guided.muscles] ?? m}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                      formatter={(value: number | string) => [`${Number(value).toLocaleString()} ${dict.common.kg}`, dict.guided.volume]}
                      labelFormatter={(m: string) => dict.guided.muscles[m as keyof typeof dict.guided.muscles] ?? m}
                    />
                    <Bar dataKey="volume" radius={[0, 6, 6, 0]} maxBarSize={16}>
                      {volumeData.map((v) => (
                        <Cell key={v.muscle} fill={MUSCLE_BAR_COLORS[v.muscle] ?? "var(--chart-1)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* best lifts */}
            {d.bestLifts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{dict.guided.bestLifts}</p>
                <ul className="space-y-1">
                  {d.bestLifts.map((l, i) => (
                    <li
                      key={l.exerciseKey}
                      className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm"
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                          i === 0 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                        }`}
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0 truncate font-medium">{l.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {l.weightKg}
                        {dict.common.kg} × {l.reps}
                      </span>
                      <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary shrink-0">
                        e1RM {Math.round(l.e1rm)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* PR feed */}
            {d.recentPRs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                  {dict.guided.prFeed}
                </p>
                <ul className="space-y-1 max-h-44 overflow-y-auto kai-scroll pr-1">
                  {d.recentPRs.map((p, i) => (
                    <li key={`${p.exerciseKey}-${i}`} className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-1.5 text-sm">
                      <Flame className="h-3 w-3 text-amber-500 shrink-0" aria-hidden />
                      <span className="flex-1 min-w-0 truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {p.weightKg > 0
                          ? `${p.weightKg}${dict.common.kg}×${p.reps} · e1RM ${Math.round(p.e1rm)}`
                          : `${p.reps}×`}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0" suppressHydrationWarning>
                        {new Date(p.date).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", { day: "numeric", month: "short" })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
