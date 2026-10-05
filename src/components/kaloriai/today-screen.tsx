"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Apple,
  Beef,
  Camera,
  ChevronDown,
  ChevronRight,
  Coffee,
  Droplets,
  Dumbbell,
  Flame,
  GlassWater,
  Mic,
  Moon,
  PenLine,
  Plus,
  Footprints,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Sun,
  Utensils,
  Wheat,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore, mealLabel } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import { waterTargetMl } from "@/lib/calculations";
import { FastingCard } from "@/components/kaloriai/fasting-card";
import { JournalCard } from "@/components/kaloriai/journal-card";
import type { Dictionary } from "@/lib/i18n";
import type { AiTextResponse, DiaryResponse, ProgressSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AiCapture } from "@/components/kaloriai/ai-capture";
import { VoiceCapture } from "@/components/kaloriai/voice-capture";
import { AiResultEditor, type AiEditorResult } from "@/components/kaloriai/ai-result-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Local date → YYYY-MM-DD */
const fmtDate = (d: Date = new Date()) => d.toLocaleDateString("en-CA");

/* ---------------- Daily nutrition grade (Cronometer-style carnet) ---------------- */
interface GradeRow {
  icon: typeof Flame;
  label: string;
  value: string;
  ok: boolean;
}

function computeGrade(
  d: DiaryResponse,
  budget: number,
  proteinTarget: number,
  waterTarget: number
): { grade: string; score: number; rows: GradeRow[]; tone: string } | null {
  const t = d.totals;
  if (!t || t.kcal <= 0) return null;

  const fiberTarget = Math.max(25, (14 * budget) / 1000);
  const sugarLimit = (budget * 0.1) / 4;
  const satFatLimit = (budget * 0.1) / 9;
  const sodiumLimit = 2300;

  const kcalDiff = budget > 0 ? Math.abs(t.kcal - budget) / budget : 1;
  const kcalScore = kcalDiff <= 0.1 ? 40 : kcalDiff <= 0.2 ? 24 : kcalDiff <= 0.3 ? 14 : 4;
  const pRatio = proteinTarget > 0 ? t.protein / proteinTarget : 1;
  const pScore = pRatio >= 0.9 ? 25 : pRatio >= 0.7 ? 16 : pRatio >= 0.5 ? 9 : 3;
  const fRatio = t.fiber / fiberTarget;
  const fScore = fRatio >= 0.8 ? 15 : fRatio >= 0.5 ? 9 : 3;
  const wRatio = d.waterMl / Math.max(waterTarget, 1);
  const wScore = wRatio >= 0.7 ? 10 : wRatio >= 0.4 ? 6 : 2;
  const maxOver = Math.max(t.sugar / Math.max(sugarLimit, 1), t.sodium / sodiumLimit, t.satFat / Math.max(satFatLimit, 1));
  const lScore = maxOver > 1.2 ? 0 : maxOver > 1 ? 5 : 10;

  const score = kcalScore + pScore + fScore + wScore + lScore;
  const grade = score >= 90 ? "A" : score >= 78 ? "B" : score >= 60 ? "C" : "D";
  const tone =
    grade === "A"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : grade === "B"
        ? "border-primary/40 bg-primary/10 text-primary"
        : grade === "C"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-destructive/40 bg-destructive/10 text-destructive";

  const rows: GradeRow[] = [
    { icon: Flame, label: "gradeKcal", value: `${Math.round(t.kcal)}/${Math.round(budget)}`, ok: kcalDiff <= 0.2 },
    { icon: Beef, label: "gradeProtein", value: `${Math.round(t.protein)}/${Math.round(proteinTarget)}g`, ok: pRatio >= 0.7 },
    { icon: Wheat, label: "gradeFiber", value: `${Math.round(t.fiber)}/${Math.round(fiberTarget)}g`, ok: fRatio >= 0.5 },
    { icon: GlassWater, label: "gradeWater", value: `${d.waterMl}/${waterTarget}ml`, ok: wRatio >= 0.4 },
    { icon: ShieldAlert, label: "gradeLimits", value: maxOver > 1 ? `+%${Math.round((maxOver - 1) * 100)}` : "✓", ok: maxOver <= 1 },
  ];
  return { grade, score, rows, tone };
}

function GradeChip({ grade, dict }: { grade: NonNullable<ReturnType<typeof computeGrade>>; dict: Dictionary }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${dict.today.gradeTitle}: ${grade.grade}`}
          className={cn(
            "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border px-2.5 text-sm font-bold tabular-nums transition-transform hover:scale-105 active:scale-95",
            grade.tone
          )}
        >
          {grade.grade}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{dict.today.gradeTitle}</p>
          <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold", grade.tone)}>
            {grade.grade}
          </span>
        </div>
        <p className="mb-2.5 text-[11px] text-muted-foreground">{dict.today.gradeSoFar}</p>
        <ul className="space-y-1.5">
          {grade.rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-xs">
              <r.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex-1 text-muted-foreground">{dict.today[r.label as "gradeKcal"]}</span>
              <span className="tabular-nums">{r.value}</span>
              <span
                aria-hidden
                className={cn("ml-1 h-2 w-2 shrink-0 rounded-full", r.ok ? "bg-emerald-500" : "bg-amber-500")}
              />
              <span className="sr-only">{r.ok ? "✓" : "!"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 border-t pt-2 text-[10px] leading-snug text-muted-foreground">{dict.today.gradeHint}</p>
      </PopoverContent>
    </Popover>
  );
}

const MEALS = [
  { key: "breakfast", icon: Coffee },
  { key: "lunch", icon: Sun },
  { key: "dinner", icon: Moon },
  { key: "snacks", icon: Apple },
] as const;

function guessMealType(): string {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 17) return "lunch";
  if (h < 22) return "dinner";
  return "snacks";
}

function CalorieRing({
  consumed,
  budget,
  dict,
}: {
  consumed: number;
  budget: number;
  dict: Dictionary;
}) {
  const over = consumed > budget;
  const remaining = Math.round(Math.abs(budget - consumed));
  const R = 54;
  const C = 2 * Math.PI * R;
  const pct = budget > 0 ? Math.min(consumed / budget, 1) : 0;

  return (
    <div
      className="relative h-32 w-32 shrink-0"
      role="img"
      aria-label={`${consumed} / ${budget} ${dict.common.kcal}`}
    >
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="kaiRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" className={over ? "[stop-color:var(--destructive)]" : "[stop-color:var(--primary)]"} />
            <stop offset="100%" className={over ? "[stop-color:var(--destructive)]" : "[stop-color:var(--chart-2)]"} />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          stroke="url(#kaiRing)"
          className="transition-[stroke-dasharray] duration-700 ease-out drop-shadow-[0_0_6px_var(--primary)]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-2xl font-bold tabular-nums drop-shadow-sm", over && "text-destructive")}>
          {remaining}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {dict.common.kcal} {over ? dict.today.over : dict.today.left}
        </span>
      </div>
    </div>
  );
}

function MacroBar({
  label,
  value,
  target,
  colorClass,
  dict,
}: {
  label: string;
  value: number;
  target: number;
  colorClass: string;
  dict: Dictionary;
}) {
  const pct = target > 0 ? Math.min(Math.round((value / target) * 100), 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {Math.round(value)}/{Math.round(target)}
          {dict.common.g}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-8 w-52" />
      <Card className="p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <Skeleton className="h-32 w-32 rounded-full" />
          <div className="w-full space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="kai-shimmer h-2 w-full" />
            <Skeleton className="kai-shimmer h-2 w-full" />
            <Skeleton className="h-2 w-5/6" />
          </div>
        </div>
      </Card>
      <Skeleton className="kai-shimmer h-24 w-full rounded-2xl" />
      <Card className="space-y-3 p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </Card>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

const fade = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, delay: i * 0.05 },
});

export function TodayScreen() {
  const { dict, locale, user, setTab, setCoachOpen, mealNames } = useAppStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const date = useMemo(() => fmtDate(), []);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [waterCustomOpen, setWaterCustomOpen] = useState(false);
  const [waterCustomMl, setWaterCustomMl] = useState("");
  const [textValue, setTextValue] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickKcal, setQuickKcal] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingResult, setPendingResult] = useState<AiEditorResult | null>(null);
  const [pendingMeal, setPendingMeal] = useState("lunch");

  const diaryQ = useQuery({
    queryKey: ["diary", date],
    queryFn: () => api<DiaryResponse>(`/api/diary?date=${date}`),
  });
  const summaryQ = useQuery({
    queryKey: ["summary", 7],
    queryFn: () => api<ProgressSummary>("/api/progress/summary?days=7"),
  });
  const insightQ = useQuery({
    queryKey: ["insight", locale],
    queryFn: () => api<{ insight: string }>(`/api/ai/insights?locale=${locale}`),
  });
  const stepsQ = useQuery({
    queryKey: ["steps", 1],
    queryFn: () => api<{ days: { date: string; count: number }[] }>("/api/steps?days=1"),
  });
  const todaySteps = stepsQ.data?.days?.[0]?.count ?? 0;

  const invalidateLogs = () => {
    queryClient.invalidateQueries({ queryKey: ["diary"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  const parseText = useMutation({
    mutationFn: (text: string) =>
      api<AiTextResponse>("/api/ai/parse-text", { body: { text, locale } }),
    onSuccess: (res) => {
      setPendingResult({
        items: res.items,
        overallConfidence: res.overallConfidence,
        clarifyingQuestion: res.clarifyingQuestion,
      });
      setPendingMeal(guessMealType());
      setTextOpen(false);
      setTextValue("");
      setEditorOpen(true);
    },
    onError: () => toast({ title: dict.ai.failed, variant: "destructive" }),
  });

  const quickAdd = useMutation({
    mutationFn: (kcal: number) =>
      api("/api/diary", { body: { date, mealType: "snacks", quickAddKcal: kcal } }),
    onSuccess: () => {
      toast({ title: dict.diary.saved });
      invalidateLogs();
      setQuickOpen(false);
      setQuickKcal("");
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const applyTemplate = useMutation({
    mutationFn: (templateId: string) =>
      api("/api/diary/template", { method: "PUT", body: { templateId, date } }),
    onSuccess: () => {
      toast({ title: dict.diary.saved });
      invalidateLogs();
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const waterAdd = useMutation({
    mutationFn: (ml: number) => api("/api/water", { body: { deltaMl: ml } }),
    onMutate: async (ml: number) => {
      await queryClient.cancelQueries({ queryKey: ["diary", date] });
      const prev = queryClient.getQueryData<DiaryResponse>(["diary", date]);
      if (prev) {
        queryClient.setQueryData<DiaryResponse>(["diary", date], {
          ...prev,
          waterMl: prev.waterMl + ml,
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["diary", date], ctx.prev);
      toast({ title: dict.common.error, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["diary"] });
      queryClient.invalidateQueries({ queryKey: ["water"] });
    },
  });

  if (diaryQ.isLoading) return <TodaySkeleton />;

  if (diaryQ.isError || !diaryQ.data) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
        </span>
        <p className="text-sm font-medium">{dict.errors.network}</p>
        <Button
          variant="outline"
          onClick={() => diaryQ.refetch()}
          className="min-h-[44px] gap-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {dict.common.retry}
        </Button>
      </Card>
    );
  }

  const d = diaryQ.data;
  const targets = d.targets;
  const isTrainingDay =
    d.profile?.userType === "athlete" && d.workouts.length > 0 && targets?.trainCalories != null;
  const calorieTarget = (isTrainingDay ? targets?.trainCalories : targets?.calories) ?? 0;
  const budget = calorieTarget + (d.addedBurned ?? 0);
  const consumed = d.totals?.kcal ?? 0;
  const proteinTarget = (isTrainingDay ? targets?.trainProtein : targets?.protein) ?? 0;
  const carbsTarget = (isTrainingDay ? targets?.trainCarbs : targets?.carbs) ?? 0;
  const fatTarget = (isTrainingDay ? targets?.trainFat : targets?.fat) ?? 0;
  const waterTarget = waterTargetMl(d.profile?.weightKg);
  const waterPct = Math.min(Math.round((d.waterMl / waterTarget) * 100), 100);

  const mealStats = MEALS.map(({ key }) => {
    const logs = d.logs.filter((l) => l.mealType === key);
    const items = logs.reduce((acc, l) => acc + l.items.length, 0);
    const kcal = Math.round(logs.reduce((acc, l) => acc + l.items.reduce((a, i) => a + i.kcal, 0), 0));
    return { key, items, kcal };
  });

  const streak = summaryQ.data?.summary.streak ?? 0;
  const adherence = summaryQ.data?.summary.adherencePct ?? 0;
  const gradeInfo = computeGrade(d, budget, proteinTarget, waterTarget);

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <motion.header {...fade(0)} className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">
          {dict.today.greeting}
          {user?.name ? `, ${user.name}` : ""}
        </h1>
        <div className="flex items-center gap-2">
          {gradeInfo && <GradeChip grade={gradeInfo} dict={dict} />}
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            <Flame className="h-3.5 w-3.5" aria-hidden />
            {streak} {dict.today.streak}
          </Badge>
          <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
            {adherence}% {dict.today.adherence}
          </Badge>
        </div>
      </motion.header>

      {/* Hero calorie card */}
      <motion.div {...fade(1)}>
        <Card className="p-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <CalorieRing consumed={consumed} budget={budget} dict={dict} />
            <div className="w-full flex-1 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {dict.today.calorieBudget}: {Math.round(budget)} {dict.common.kcal}
                </span>
                {isTrainingDay && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  >
                    <Dumbbell className="h-3.5 w-3.5" aria-hidden />
                    {dict.training.trainingDay}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                  <Utensils className="h-3.5 w-3.5" aria-hidden />
                  {dict.today.eaten}: {Math.round(consumed)} {dict.common.kcal}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <Flame className="h-3.5 w-3.5" aria-hidden />
                  {dict.today.burned}: {Math.round(d.burned)} {dict.common.kcal}
                </span>
                {todaySteps > 0 && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-chart-3/15 px-3 py-1.5 text-xs font-medium text-chart-3"
                    title={dict.steps.title}
                  >
                    <Footprints className="h-3.5 w-3.5" aria-hidden />
                    {todaySteps.toLocaleString()} {dict.steps.title}
                  </span>
                )}
              </div>
              {d.addedBurned > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {dict.today.burnedAdded} (+{Math.round(d.addedBurned)} {dict.common.kcal})
                </p>
              )}

              <div className="space-y-2.5">
                <p className="text-xs font-medium text-muted-foreground">{dict.today.macroPlan}</p>
                <MacroBar
                  label={dict.onboarding.protein}
                  value={d.totals?.protein ?? 0}
                  target={proteinTarget}
                  colorClass="bg-primary"
                  dict={dict}
                />
                <MacroBar
                  label={dict.onboarding.carbs}
                  value={d.totals?.carbs ?? 0}
                  target={carbsTarget}
                  colorClass="bg-amber-500"
                  dict={dict}
                />
                <MacroBar
                  label={dict.onboarding.fat}
                  value={d.totals?.fat ?? 0}
                  target={fatTarget}
                  colorClass="bg-rose-500"
                  dict={dict}
                />
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Action grid */}
      <motion.section {...fade(2)} aria-label={dict.today.takePhoto} className="space-y-3">
        <Button
          onClick={() => setCaptureOpen(true)}
          className="h-auto w-full flex-col items-center gap-1 rounded-2xl bg-gradient-to-br from-primary to-primary/80 py-4 shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
        >
          <Camera className="h-6 w-6" aria-hidden />
          <span className="text-base font-semibold">{dict.today.takePhoto}</span>
          <span className="text-xs font-normal opacity-80">{dict.today.takePhotoSub}</span>
        </Button>
        <div className="grid grid-cols-3 gap-3">
          <Button
            variant="outline"
            onClick={() => setVoiceOpen(true)}
            className="kai-pressable h-auto min-h-[44px] flex-col gap-1 rounded-2xl py-3"
          >
            <Mic className="h-5 w-5 text-destructive" aria-hidden />
            <span className="text-sm font-medium">{dict.voice.title}</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setTextOpen(true)}
            className="kai-pressable h-auto min-h-[44px] flex-col gap-1 rounded-2xl py-3"
          >
            <PenLine className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-sm font-medium">{dict.today.textEntry}</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setQuickOpen(true)}
            className="kai-pressable h-auto min-h-[44px] flex-col gap-1 rounded-2xl py-3"
          >
            <Zap className="h-5 w-5 text-amber-500" aria-hidden />
            <span className="text-sm font-medium">{dict.today.quickAdd}</span>
            <span className="hidden text-[11px] font-normal text-muted-foreground sm:block">
              {dict.today.quickAddSub}
            </span>
          </Button>
        </div>
      </motion.section>

      {/* Meals */}
      <motion.div {...fade(3)}>
        <Card className="kai-card-hover p-2">
          <p className="px-4 pb-1 pt-3 text-sm font-semibold">{dict.today.meals}</p>
          <div className="divide-y">
            {mealStats.map((m) => {
              const Icon = MEALS.find((x) => x.key === m.key)!.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setTab("diary")}
                  aria-label={`${dict.today[m.key]} — ${dict.nav.diary}`}
                  className="kai-pressable flex min-h-[44px] w-full items-center gap-3 rounded-lg px-4 py-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-4.5 w-4.5 text-primary" aria-hidden />
                  </span>
                  <span className="flex-1 text-sm font-medium">{mealLabel(dict, mealNames, m.key)}</span>
                  {m.kcal > 0 && (
                    <span className="text-sm font-semibold tabular-nums">
                      {m.kcal} {dict.common.kcal}
                    </span>
                  )}
                  {m.items > 0 ? (
                    <span className="text-xs tabular-nums text-muted-foreground">{m.items}×</span>
                  ) : (
                    <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Water */}
      <motion.div {...fade(4)}>
        <Card className="kai-card-hover p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Droplets className="h-4.5 w-4.5 text-primary" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{dict.today.water}</p>
                {waterPct < 100 && (
                  <p className="truncate text-[11px] text-muted-foreground">{dict.today.waterSub}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => waterAdd.mutate(250)}
                disabled={waterAdd.isPending}
                aria-label={dict.today.addWater}
                className="min-h-[44px] shrink-0 gap-1.5 rounded-full sm:min-h-9"
              >
                <GlassWater className="h-4 w-4" aria-hidden />
                +250 {dict.common.ml}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-full"
                    aria-label={dict.today.waterCustom}
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {[200, 330, 500].map((ml) => (
                    <DropdownMenuItem key={ml} onClick={() => waterAdd.mutate(ml)} className="min-h-[44px]">
                      <GlassWater className="h-4 w-4 text-primary" aria-hidden />
                      {ml === 200
                        ? dict.today.waterGlass
                        : ml === 330
                          ? dict.today.waterSmallBottle
                          : dict.today.waterBottle}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() => {
                      setWaterCustomMl("");
                      setWaterCustomOpen(true);
                    }}
                    className="min-h-[44px]"
                  >
                    <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {dict.today.waterCustom}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={waterPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={dict.today.water}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-chart-2 to-primary transition-all duration-500"
                style={{ width: `${waterPct}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {d.waterMl}/{waterTarget} {dict.common.ml}
            </span>
          </div>
        </Card>
      </motion.div>

      {/* Intermittent fasting */}
      <FastingCard index={5} />

      {/* Daily journal + mood */}
      <JournalCard index={6} />

      {/* AI insight teaser */}
      <motion.div {...fade(7)}>
        <Card className="border-primary/25 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Sparkles className="h-4.5 w-4.5 text-primary" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{dict.today.insight}</p>
              {insightQ.isLoading ? (
                <Skeleton className="mt-2 h-4 w-3/4" />
              ) : insightQ.isError ? (
                <button
                  type="button"
                  onClick={() => insightQ.refetch()}
                  className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-xs text-destructive sm:min-h-0"
                >
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                  {dict.common.retry}
                </button>
              ) : insightQ.data?.insight ? (
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                  {insightQ.data.insight}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{dict.progress.insightsEmpty}</p>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => setCoachOpen(true)}
              aria-label={dict.today.aiCoach}
              className="min-h-[44px] shrink-0 gap-1.5 rounded-full sm:min-h-9"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{dict.today.aiCoach}</span>
            </Button>
          </div>
        </Card>
      </motion.div>

      {/* Quick templates */}
      {d.templates.length > 0 && (
        <motion.section {...fade(7)} aria-label={dict.diary.templates} className="space-y-2">
          <p className="text-sm font-semibold">{dict.diary.templates}</p>
          <div className="kai-scroll flex gap-2 overflow-x-auto pb-1">
            {d.templates.map((t) => {
              const kcal = Math.round(t.items.reduce((a, i) => a + i.kcal, 0));
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate.mutate(t.id)}
                  disabled={applyTemplate.isPending}
                  aria-label={`${dict.diary.applyTemplate} ${t.name ?? ""}`}
                  className="min-h-[44px] shrink-0 rounded-full border bg-card px-4 py-2 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50 sm:min-h-0"
                >
                  {t.name || dict.diary.templates}
                  <span className="ml-1.5 text-muted-foreground">
                    {kcal} {dict.common.kcal}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Dialogs */}
      <Dialog open={textOpen} onOpenChange={setTextOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dict.today.textEntry}</DialogTitle>
            <DialogDescription>{dict.common.estimateWarning}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder={dict.today.textEntryPh}
            aria-label={dict.today.textEntryPh}
            className="min-h-[88px]"
          />
          <Button
            onClick={() => parseText.mutate(textValue.trim())}
            disabled={!textValue.trim() || parseText.isPending}
            className="min-h-[44px] w-full gap-2"
          >
            {parseText.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {dict.today.analyze}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dict.diary.quickAddTitle}</DialogTitle>
            <DialogDescription>{dict.today.quickAddSub}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={quickKcal}
                onChange={(e) => setQuickKcal(e.target.value)}
                placeholder="0"
                aria-label={dict.diary.caloriesOnly}
                className="pr-14 text-lg"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {dict.common.kcal}
              </span>
            </div>
            <Button
              onClick={() => quickAdd.mutate(Number(quickKcal))}
              disabled={!quickKcal || Number(quickKcal) <= 0 || quickAdd.isPending}
              className="min-h-[44px] w-full"
            >
              {dict.common.add}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Water custom dialog */}
      <Dialog open={waterCustomOpen} onOpenChange={setWaterCustomOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{dict.today.waterCustomTitle}</DialogTitle>
            <DialogDescription className="sr-only">{dict.today.water}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                min={50}
                max={3000}
                value={waterCustomMl}
                onChange={(e) => setWaterCustomMl(e.target.value)}
                placeholder="300"
                aria-label={dict.today.waterAmount}
                autoFocus
                className="pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {dict.common.ml}
              </span>
            </div>
            <Button
              onClick={() => {
                const ml = Number(waterCustomMl);
                if (ml >= 50 && ml <= 3000) {
                  waterAdd.mutate(ml);
                  setWaterCustomOpen(false);
                }
              }}
              disabled={
                !waterCustomMl || Number(waterCustomMl) < 50 || Number(waterCustomMl) > 3000 || waterAdd.isPending
              }
              className="min-h-[44px] w-full"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {dict.common.add}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI photo flow */}
      <AiCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <VoiceCapture open={voiceOpen} onClose={() => setVoiceOpen(false)} />

      {/* AI result editor (text flow) */}
      {pendingResult && (
        <AiResultEditor
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setPendingResult(null);
          }}
          result={pendingResult}
          mealType={pendingMeal}
          date={date}
        />
      )}
    </div>
  );
}
