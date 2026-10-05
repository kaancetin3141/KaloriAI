"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import {
  Flame,
  Target,
  Utensils,
  Beef,
  TrendingUp,
  TrendingDown,
  FlameKindling,
  RefreshCw,
  Ruler,
  Lock,
  Crown,
  Download,
  FileJson,
  Loader2,
  Camera,
  Sparkles,
  AlertTriangle,
  Scale,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api, ApiError } from "@/lib/api";
import { movingAverage, waterTargetMl } from "@/lib/calculations";
import { kgToLb, lbToKg, CM_PER_IN } from "@/lib/units";
import type { ProgressSummary, Measurement, Profile } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import { PaywallDialog } from "@/components/kaloriai/paywall-dialog";
import { AchievementsCard } from "@/components/kaloriai/achievements-card";
import { WeekCard } from "@/components/kaloriai/week-card";
import { ProjectionCard } from "@/components/kaloriai/projection-card";
import { StreakHeatmap } from "@/components/kaloriai/streak-heatmap";
import { MoodCard } from "@/components/kaloriai/mood-card";
import { ReportButton } from "@/components/kaloriai/report-view";

const fmtDate = (d = new Date()) => d.toLocaleDateString("en-CA");
const dateTick = (d: string) => (typeof d === "string" ? d.slice(5).replace("-", "/") : d);

interface ProgressPhoto {
  id: string;
  date: string;
  note: string | null;
  imagePath: string;
}

type MeasFields = {
  date: string;
  weightKg: string;
  bodyFatPct: string;
  waistCm: string;
  armCm: string;
  chestCm: string;
  hipCm: string;
};

const emptyMeas = (): MeasFields => ({
  date: fmtDate(),
  weightKg: "",
  bodyFatPct: "",
  waistCm: "",
  armCm: "",
  chestCm: "",
  hipCm: "",
});

export function ProgressScreen() {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const unitSystem = useAppStore((s) => s.user?.unitSystem ?? "metric");
  const isImperial = unitSystem === "imperial";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [measOpen, setMeasOpen] = useState(false);
  const [measForm, setMeasForm] = useState<MeasFields>(emptyMeas);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ---------- queries ---------- */
  const summaryQ = useQuery<ProgressSummary>({
    queryKey: ["summary", days],
    queryFn: () => api<ProgressSummary>(`/api/progress/summary?days=${days}`),
  });

  const insightQ = useQuery<{ insight: string }>({
    queryKey: ["insight", locale],
    queryFn: () => api<{ insight: string }>(`/api/ai/insights?locale=${locale}`),
  });

  const photosQ = useQuery<{ photos: ProgressPhoto[] }>({
    queryKey: ["pphotos"],
    queryFn: () => api<{ photos: ProgressPhoto[] }>("/api/progress-photos"),
    retry: false,
  });
  const photosLocked = photosQ.error instanceof ApiError && photosQ.error.status === 402;

  const profileQ = useQuery<{ profile: Profile | null }>({
    queryKey: ["profile-lean"],
    queryFn: () => api<{ profile: Profile | null }>("/api/profile"),
    staleTime: 5 * 60 * 1000,
  });

  /* ---------- derived ---------- */
  const summary = summaryQ.data;
  const byDate = useMemo(() => summary?.byDate ?? [], [summary]);
  const hasIntake = byDate.some((d) => d.kcal > 0);
  const hasWater = byDate.some((d) => d.waterMl > 0);
  const targets = summary?.targets ?? null;

  const weightData = useMemo(() => {
    const ms = summary?.measurements ?? [];
    const series = ms.map((m: Measurement) => ({
      date: m.date,
      value: m.weightKg != null ? (isImperial ? Math.round(kgToLb(m.weightKg) * 10) / 10 : m.weightKg) : null,
    }));
    return movingAverage(series, 7);
  }, [summary, isImperial]);

  const measTrendData = useMemo(() => {
    const ms = summary?.measurements ?? [];
    const cv = isImperial ? (cm: number) => Math.round((cm / CM_PER_IN) * 10) / 10 : (cm: number) => cm;
    return ms
      .filter((m) => m.waistCm != null || m.armCm != null || m.chestCm != null || m.hipCm != null)
      .map((m) => ({
        date: m.date,
        waist: m.waistCm != null ? cv(m.waistCm) : null,
        arm: m.armCm != null ? cv(m.armCm) : null,
        chest: m.chestCm != null ? cv(m.chestCm) : null,
        hip: m.hipCm != null ? cv(m.hipCm) : null,
      }));
  }, [summary, isImperial]);

  /* ---------- mutations ---------- */
  const addMeas = useMutation({
    mutationFn: () => {
      const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
      const toMetric = (v: string, conv: (n: number) => number) => {
        const n = num(v);
        return n === undefined ? undefined : Math.round(conv(n) * 10) / 10;
      };
      return api("/api/measurements", {
        body: {
          date: measForm.date || fmtDate(),
          weightKg: isImperial ? toMetric(measForm.weightKg, lbToKg) : num(measForm.weightKg),
          bodyFatPct: num(measForm.bodyFatPct),
          waistCm: isImperial ? toMetric(measForm.waistCm, (n) => n * CM_PER_IN) : num(measForm.waistCm),
          armCm: isImperial ? toMetric(measForm.armCm, (n) => n * CM_PER_IN) : num(measForm.armCm),
          chestCm: isImperial ? toMetric(measForm.chestCm, (n) => n * CM_PER_IN) : num(measForm.chestCm),
          hipCm: isImperial ? toMetric(measForm.hipCm, (n) => n * CM_PER_IN) : num(measForm.hipCm),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["diary"] });
      setMeasOpen(false);
      setMeasForm(emptyMeas());
      toast({ title: dict.diary.saved });
    },
    onError: () => toast({ title: dict.errors.validation, variant: "destructive" }),
  });

  const recalc = useMutation({
    mutationFn: (calories: number) =>
      api("/api/targets", { method: "PATCH", body: { calories } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["diary"] });
      toast({ title: dict.progress.recalcTargets });
    },
    onError: (e) => {
      const msg = e instanceof ApiError && e.code === "CALORIE_FLOOR" ? dict.profile.healthDisclaimerText : dict.common.error;
      toast({ title: msg, variant: "destructive" });
    },
  });

  const uploadPhoto = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("image", file);
      return api("/api/progress-photos", { form: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pphotos"] });
      toast({ title: dict.diary.saved });
    },
    onError: (e) => {
      const msg = e instanceof ApiError && e.status === 402 ? dict.progress.photosPremium : dict.common.error;
      toast({ title: msg, variant: "destructive" });
    },
  });

  /* ---------- loading / error states ---------- */
  if (summaryQ.isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (summaryQ.isError || !summary) {
    return (
      <Card>
        <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
          <p className="text-sm text-muted-foreground">{dict.common.error}</p>
          <Button variant="outline" onClick={() => summaryQ.refetch()}>
            {dict.common.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const s = summary.summary;
  const weightChangeRounded = isImperial
    ? Math.round(kgToLb(s.weightChange) * 10) / 10
    : Math.round(s.weightChange * 10) / 10;

  const statCards = [
    {
      label: dict.progress.streakTitle,
      value: `${s.streak}`,
      icon: Flame,
      tone: "text-amber-500 bg-amber-500/10",
    },
    {
      label: dict.progress.adherencePct,
      value: `${s.adherencePct}%`,
      icon: Target,
      tone: "text-primary bg-primary/10",
    },
    {
      label: dict.progress.avgCalories,
      value: `${Math.round(s.avgCalories)}`,
      unit: dict.common.kcal,
      icon: Utensils,
      tone: "text-primary bg-primary/10",
    },
    {
      label: dict.progress.avgProtein,
      value: `${Math.round(s.avgProtein)}`,
      unit: dict.common.g,
      icon: Beef,
      tone: "text-primary bg-primary/10",
    },
    {
      label: dict.progress.weightChange,
      value: `${weightChangeRounded > 0 ? "+" : ""}${weightChangeRounded}`,
      unit: isImperial ? dict.common.lb : dict.common.kg,
      icon: weightChangeRounded <= 0 ? TrendingDown : TrendingUp,
      tone: weightChangeRounded <= 0 ? "text-primary bg-primary/10" : "text-amber-500 bg-amber-500/10",
    },
    {
      label: dict.training.caloriesBurned,
      value: `${Math.round(s.totalBurned)}`,
      unit: dict.common.kcal,
      icon: FlameKindling,
      tone: "text-amber-500 bg-amber-500/10",
    },
  ];

  const latestMeas: Measurement | undefined =
    summary.measurements.length > 0 ? summary.measurements[summary.measurements.length - 1] : undefined;

  const measChips: { label: string; value: string }[] = latestMeas
    ? [
        {
          label: dict.progress.weightChart,
          value:
            latestMeas.weightKg != null
              ? isImperial
                ? `${Math.round(kgToLb(latestMeas.weightKg) * 10) / 10} ${dict.common.lb}`
                : `${latestMeas.weightKg} ${dict.common.kg}`
              : "",
        },
        { label: dict.progress.bodyFat, value: latestMeas.bodyFatPct != null ? `${latestMeas.bodyFatPct}%` : "" },
        {
          label: dict.progress.waist,
          value: latestMeas.waistCm != null ? `${isImperial ? Math.round((latestMeas.waistCm / CM_PER_IN) * 10) / 10 : latestMeas.waistCm} ${isImperial ? dict.common.inch : dict.common.cm}` : "",
        },
        {
          label: dict.progress.arm,
          value: latestMeas.armCm != null ? `${isImperial ? Math.round((latestMeas.armCm / CM_PER_IN) * 10) / 10 : latestMeas.armCm} ${isImperial ? dict.common.inch : dict.common.cm}` : "",
        },
        {
          label: dict.progress.chest,
          value: latestMeas.chestCm != null ? `${isImperial ? Math.round((latestMeas.chestCm / CM_PER_IN) * 10) / 10 : latestMeas.chestCm} ${isImperial ? dict.common.inch : dict.common.cm}` : "",
        },
        {
          label: dict.progress.hip,
          value: latestMeas.hipCm != null ? `${isImperial ? Math.round((latestMeas.hipCm / CM_PER_IN) * 10) / 10 : latestMeas.hipCm} ${isImperial ? dict.common.inch : dict.common.cm}` : "",
        },
      ].filter((c) => c.value !== "")
    : [];

  /* ---------- health metrics ---------- */
  const heightCm = profileQ.data?.profile?.heightCm ?? null;
  const bmiValue =
    heightCm && latestMeas?.weightKg != null
      ? Math.round((latestMeas.weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10
      : null;
  const bmiTone =
    bmiValue == null
      ? "text-muted-foreground bg-muted"
      : bmiValue < 18.5
        ? "text-chart-2 bg-chart-2/10"
        : bmiValue < 25
          ? "text-primary bg-primary/10"
          : bmiValue < 30
            ? "text-amber-500 bg-amber-500/10"
            : "text-destructive bg-destructive/10";
  const bmiLabel =
    bmiValue == null
      ? ""
      : bmiValue < 18.5
        ? dict.progress.bmiUnder
        : bmiValue < 25
          ? dict.progress.bmiNormal
          : bmiValue < 30
            ? dict.progress.bmiOver
            : dict.progress.bmiObese;

  const whtrValue =
    heightCm && latestMeas?.waistCm != null && heightCm > 0
      ? Math.round((latestMeas.waistCm / heightCm) * 100) / 100
      : null;

  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--card-foreground)",
    fontSize: 12,
  };

  return (
    <div className="space-y-5 pb-4">
      {/* Header + range */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{dict.progress.title}</h1>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 7 | 30 | 90)}>
          <TabsList aria-label={dict.progress.title}>
            <TabsTrigger value="7" className="min-h-[36px] px-4">{dict.progress.rangeWeek}</TabsTrigger>
            <TabsTrigger value="30" className="min-h-[36px] px-4">{dict.progress.rangeMonth}</TabsTrigger>
            <TabsTrigger value="90" className="min-h-[36px] px-4">{dict.progress.range90}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary stat cards */}
      <section aria-label={dict.progress.summary} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {statCards.map((c) => (
          <Card key={c.label} className="p-4 gap-2">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${c.tone}`} aria-hidden>
              <c.icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xl font-bold leading-tight">
                {c.value}
                {c.unit && <span className="text-xs font-medium text-muted-foreground ml-1">{c.unit}</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
            </div>
          </Card>
        ))}
      </section>

      {/* Achievements (top level card) */}
      <AchievementsCard />

      {/* Week-over-week comparison */}
      <WeekCard />

      {/* Goal weight projection (MacroFactor-style) */}
      <ProjectionCard />

      {/* Mood ↔ nutrition correlation */}
      <MoodCard />

      {/* Empty state */}
      {s.loggedDays === 0 ? (
        <Card>
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <Scale className="h-10 w-10 text-muted-foreground/50" aria-hidden />
            <p className="text-sm text-muted-foreground">{dict.common.emptyState}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Calories chart */}
          <Card className="kai-card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{dict.progress.caloriesChart}</CardTitle>
              {targets && (
                <CardDescription>{dict.progress.avgCalories}: {Math.round(s.avgCalories)} / {targets.calories} {dict.common.kcal}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {hasIntake ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={byDate} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" tickFormatter={dateTick} fontSize={11} minTickGap={20} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                    <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
                    <Bar dataKey="kcal" name={dict.progress.caloriesChart} fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                    {targets && (
                      <ReferenceLine
                        y={targets.calories}
                        stroke="#f59e0b"
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                        label={{ value: String(targets.calories), position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Utensils className="h-8 w-8 opacity-40" aria-hidden />
                  <p className="text-sm">{dict.common.emptyState}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Macros chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{dict.progress.macrosChart}</CardTitle>
            </CardHeader>
            <CardContent>
              {hasIntake ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={byDate} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" tickFormatter={dateTick} fontSize={11} minTickGap={20} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                    <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
                    <Bar dataKey="protein" name={dict.onboarding.protein} stackId="m" fill="var(--chart-1)" maxBarSize={28} />
                    <Bar dataKey="carbs" name={dict.onboarding.carbs} stackId="m" fill="var(--chart-2)" maxBarSize={28} />
                    <Bar dataKey="fat" name={dict.onboarding.fat} stackId="m" fill="var(--chart-4)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Beef className="h-8 w-8 opacity-40" aria-hidden />
                  <p className="text-sm">{dict.common.emptyState}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Weight chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{dict.progress.weightChart}</CardTitle>
          <CardDescription>{dict.progress.weightTrend}</CardDescription>
        </CardHeader>
        <CardContent>
          {weightData.length >= 1 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={weightData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" tickFormatter={dateTick} fontSize={11} minTickGap={20} stroke="var(--muted-foreground)" />
                <YAxis
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={dict.progress.weightChart}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  name={dict.progress.weightTrend}
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Scale className="h-8 w-8 opacity-40" aria-hidden />
              <p className="text-sm">{dict.common.emptyState}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Water chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{dict.progress.waterChart}</CardTitle>
        </CardHeader>
        <CardContent>
          {hasWater ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byDate} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" tickFormatter={dateTick} fontSize={11} minTickGap={20} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
                <Bar dataKey="waterMl" name={dict.progress.waterChart} fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <ReferenceLine y={waterTargetMl(null)} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Sparkles className="h-8 w-8 opacity-40" aria-hidden />
              <p className="text-sm">{dict.common.emptyState}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consistency heatmap (12-week logging habit) */}
      <StreakHeatmap />

      {/* AI Insights */}
      <Card>
        <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
              {dict.progress.insights}
            </CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[36px]"
            onClick={() => insightQ.refetch()}
            disabled={insightQ.isFetching}
            aria-label={dict.progress.generate}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${insightQ.isFetching ? "animate-spin" : ""}`} aria-hidden />
            {dict.progress.generate}
          </Button>
        </CardHeader>
        <CardContent>
          {insightQ.isLoading ? (
            <div className="space-y-2" aria-busy>
              <span className="sr-only">{dict.progress.insightsLoading}</span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : insightQ.data?.insight ? (
            <p className="text-sm leading-relaxed whitespace-pre-line">{insightQ.data.insight}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{dict.progress.insightsEmpty}</p>
          )}
        </CardContent>
      </Card>

      {/* Adaptive TDEE */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{dict.progress.adaptiveTdee}</CardTitle>
          <CardDescription>{dict.progress.adaptiveSub}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold">{summary.adaptiveTdee.value}</span>
            <span className="text-xs text-muted-foreground">{dict.common.kcal}</span>
            <Badge variant="secondary" className="capitalize">{summary.adaptiveTdee.confidence}</Badge>
          </div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="sm:ml-auto">
                  <Button
                    className="min-h-[44px] sm:ml-auto"
                    onClick={() => summary.adaptiveTdee.value > 0 && recalc.mutate(summary.adaptiveTdee.value)}
                    disabled={targets?.manuallyOverridden || recalc.isPending || summary.adaptiveTdee.value <= 0}
                  >
                    {recalc.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Target className="h-4 w-4" aria-hidden />}
                    {dict.progress.recalcTargets}
                  </Button>
                </span>
              </TooltipTrigger>
              {targets?.manuallyOverridden && (
                <TooltipContent>{dict.profile.manualOverride}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Measurements + health metrics */}
      <Card className="kai-card-hover">
        <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="h-4 w-4 text-primary" aria-hidden />
              {dict.progress.measurements}
            </CardTitle>
            <CardDescription>{dict.progress.measTrendSub}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[36px]"
            onClick={() => {
              setMeasForm(emptyMeas());
              setMeasOpen(true);
            }}
          >
            {dict.progress.addMeasurement}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* BMI + WHtR indicator cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className={`rounded-xl border p-3 ${bmiTone}`}>
              <p className="text-xs font-medium text-muted-foreground">
                {dict.progress.bmi} <span className="hidden sm:inline">({dict.progress.bmiSub})</span>
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">{bmiValue ?? "—"}</span>
                {bmiLabel && <Badge variant="secondary" className="text-[10px]">{bmiLabel}</Badge>}
              </div>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{dict.progress.bmiNote}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs font-medium text-muted-foreground">{dict.progress.whtr}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">{whtrValue ?? "—"}</span>
                {whtrValue != null && (
                  <Badge
                    variant="secondary"
                    className={`text-[10px] ${whtrValue <= 0.5 ? "text-primary" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {whtrValue <= 0.5 ? dict.progress.whtrOk : dict.progress.whtrHigh}
                  </Badge>
                )}
              </div>
              {whtrValue == null && (
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{dict.progress.whtrNo}</p>
              )}
            </div>
          </div>

          {measChips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {measChips.map((c) => (
                <Badge key={c.label} variant="secondary" className="text-xs font-medium py-1.5 px-3">
                  {c.label}: {c.value}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{dict.common.emptyState}</p>
          )}

          {/* Measurement trend chart */}
          {measTrendData.length >= 2 ? (
            <div className="rounded-xl border p-3">
              <p className="text-xs font-semibold text-muted-foreground">{dict.progress.measTrend}</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={measTrendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={dateTick} fontSize={11} minTickGap={16} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--muted-foreground)" domain={["auto", "auto"]} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="waist" name={dict.progress.waist} stroke="var(--chart-5)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey="chest" name={dict.progress.chest} stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey="hip" name={dict.progress.hip} stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey="arm" name={dict.progress.arm} stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Export + print report */}
      <Card className="kai-card-hover">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" aria-hidden />
            {dict.profile.data}
          </CardTitle>
          <CardDescription>{dict.progress.printReportSub}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2.5">
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => window.open("/api/export?format=csv", "_blank")}
          >
            <Download className="h-4 w-4" aria-hidden />
            {dict.progress.exportCsv}
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => window.open("/api/export?format=json", "_blank")}
          >
            <FileJson className="h-4 w-4" aria-hidden />
            {dict.profile.exportData}
          </Button>
          <div className="col-span-2">
            <ReportButton />
          </div>
        </CardContent>
      </Card>

      {/* Progress photos (premium) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{dict.progress.progressPhotos}</CardTitle>
        </CardHeader>
        <CardContent>
          {photosLocked ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center" aria-hidden>
                <Lock className="h-6 w-6 text-amber-500" />
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">{dict.progress.photosPremium}</p>
              <Button onClick={() => setPaywallOpen(true)} className="min-h-[44px] bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold">
                <Crown className="h-4 w-4" aria-hidden />
                {dict.profile.upgrade}
              </Button>
            </div>
          ) : photosQ.isLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : photosQ.isError ? (
            <p className="text-sm text-muted-foreground">{dict.common.error}</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {(photosQ.data?.photos ?? []).map((p) => (
                <figure key={p.id} className="relative group">
                  <img
                    src={`/api/files/${p.imagePath}`}
                    alt={`${dict.progress.progressPhotos} — ${p.date}`}
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover rounded-xl border"
                  />
                  <figcaption className="absolute inset-x-1 bottom-1 rounded-md bg-black/55 text-white text-[10px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.date}
                  </figcaption>
                </figure>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="aspect-[3/4] rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/40 flex flex-col items-center justify-center gap-1.5 text-muted-foreground text-xs transition-colors min-h-[44px]"
                aria-label={dict.progress.addPhoto}
              >
                <Camera className="h-5 w-5" aria-hidden />
                {dict.progress.addPhoto}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label={dict.progress.addPhoto}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhoto.mutate(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Measurement dialog */}
      <Dialog open={measOpen} onOpenChange={setMeasOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby="meas-desc">
          <DialogHeader>
            <DialogTitle>{dict.progress.addMeasurement}</DialogTitle>
            <DialogDescription id="meas-desc">{dict.progress.measurements}</DialogDescription>
          </DialogHeader>
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              addMeas.mutate();
            }}
          >
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="meas-date">{dict.progress.measurements}</Label>
              <Input
                id="meas-date"
                type="date"
                value={measForm.date}
                max={fmtDate()}
                onChange={(e) => setMeasForm((f) => ({ ...f, date: e.target.value }))}
                required
                className="min-h-[44px]"
              />
            </div>
            {(
              [
                ["weightKg", `${dict.onboarding.weight} (${isImperial ? dict.common.lb : dict.common.kg})`],
                ["bodyFatPct", dict.progress.bodyFat],
                ["waistCm", `${dict.progress.waist} (${isImperial ? dict.common.inch : dict.common.cm})`],
                ["armCm", `${dict.progress.arm} (${isImperial ? dict.common.inch : dict.common.cm})`],
                ["chestCm", `${dict.progress.chest} (${isImperial ? dict.common.inch : dict.common.cm})`],
                ["hipCm", `${dict.progress.hip} (${isImperial ? dict.common.inch : dict.common.cm})`],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`meas-${field}`}>{label}</Label>
                <Input
                  id={`meas-${field}`}
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder={dict.common.optional}
                  value={measForm[field]}
                  onChange={(e) => setMeasForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="min-h-[44px]"
                />
              </div>
            ))}
            <DialogFooter className="col-span-2 gap-2 sm:gap-0">
              <Button type="button" variant="ghost" className="min-h-[44px]" onClick={() => setMeasOpen(false)}>
                {dict.common.cancel}
              </Button>
              <Button type="submit" className="min-h-[44px]" disabled={addMeas.isPending}>
                {addMeas.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {dict.common.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PaywallDialog open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}
