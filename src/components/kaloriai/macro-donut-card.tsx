"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Beef } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/stores/app-store";
import type { ProgressSummary } from "@/lib/types";

/**
 * Makro Kalori Payı Donut — seçili penceredeki kayıtlı günlerin ortalama
 * makro dağılımını kalori cinsinden yüzdeselleştirir (P/C/F × 4/4/9).
 * Renkler Makrolar çubuk grafiğiyle birebir aynıdır (chart-1/2/4).
 */
export function MacroDonutCard({ summary }: { summary: ProgressSummary }) {
  const { dict } = useAppStore();

  const data = useMemo(() => {
    const logged = (summary.byDate ?? []).filter((d) => d.kcal > 0);
    if (logged.length === 0) return null;
    const avg = (key: "protein" | "carbs" | "fat") =>
      logged.reduce((a, d) => a + d[key], 0) / logged.length;
    const pG = avg("protein");
    const cG = avg("carbs");
    const fG = avg("fat");
    const pK = pG * 4;
    const cK = cG * 4;
    const fK = fG * 9;
    const total = pK + cK + fK;
    if (total <= 0) return null;
    return {
      totalKcal: Math.round(total),
      slices: [
        { key: "protein", label: dict.onboarding.protein, kcal: Math.round(pK), grams: Math.round(pG), pct: Math.round((pK / total) * 100), color: "var(--chart-1)" },
        { key: "carbs", label: dict.onboarding.carbs, kcal: Math.round(cK), grams: Math.round(cG), pct: Math.round((cK / total) * 100), color: "var(--chart-2)" },
        { key: "fat", label: dict.onboarding.fat, kcal: Math.round(fK), grams: Math.round(fG), pct: Math.round((fK / total) * 100), color: "var(--chart-4)" },
      ],
    };
  }, [summary, dict]);

  return (
    <Card className="kai-card-hover">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{dict.progress.macroDonut}</CardTitle>
        <CardDescription>{dict.progress.macroDonutSub}</CardDescription>
      </CardHeader>
      <CardContent>
        {data ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="relative h-[180px] w-[180px] shrink-0" role="img" aria-label={`${dict.progress.macroDonut}: ${data.slices.map((s) => `${s.label} ${s.pct}%`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <RechartsTooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number | string, name: string) => [`${value} ${dict.common.kcal}`, name]}
                  />
                  <Pie
                    data={data.slices}
                    dataKey="kcal"
                    nameKey="label"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={2}
                    strokeWidth={0}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {data.slices.map((s) => (
                      <Cell key={s.key} fill={s.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums">{data.totalKcal}</span>
                <span className="text-[10px] text-muted-foreground">{dict.common.kcal}</span>
              </div>
            </div>
            <ul className="w-full space-y-2">
              {data.slices.map((s) => (
                <li key={s.key} className="flex items-center gap-2.5 text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{s.grams} g</span>
                  <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">{s.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Beef className="h-8 w-8 opacity-40" aria-hidden />
            <p className="text-sm">{dict.common.emptyState}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
