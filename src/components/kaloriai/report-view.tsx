"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Droplets,
  Flame,
  Footprints,
  Printer,
  Salad,
  Scale,
  Target,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { kgToLb } from "@/lib/units";

interface ReportData {
  ok: boolean;
  period: { start: string; end: string };
  generatedAt: string;
  user: { name: string; locale: string };
  profile: {
    sex: string | null;
    heightCm: number | null;
    weightKg: number | null;
    goalWeightKg: number | null;
    goal: string | null;
    activityLevel: string | null;
    userType: string | null;
    dietPreference: string | null;
  } | null;
  targets: { calories: number; protein: number; carbs: number; fat: number } | null;
  byDate: {
    date: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    waterMl: number;
    burned: number;
    mood?: string | null;
  }[];
  summary: {
    loggedDays: number;
    hitDays: number;
    adherencePct: number;
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    avgWaterMl: number;
    totalBurned: number;
    workoutCount: number;
  };
  body: {
    latest: { date: string; weightKg: number | null; bodyFatPct: number | null; waistCm: number | null } | null;
    weekDelta: number | null;
  };
  unitSystem?: string | null;
}

/** Mood emoji map — mirrors journal-card.tsx */
const MOOD_EMOJI: Record<string, string> = {
  great: "🤩",
  good: "🙂",
  okay: "😐",
  low: "😕",
  bad: "😣",
};

/** Clean inline-number cell for the print table */
function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-neutral-300 px-2 py-1.5 text-center tabular-nums ${className}`}>{children}</td>;
}

function StatBox({ icon: Icon, label, value, unit }: { icon: typeof Flame; label: string; value: number | string; unit?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </div>
      <p className="mt-0.5 text-lg font-bold leading-tight tabular-nums text-neutral-900">
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-neutral-500">{unit}</span>}
      </p>
    </div>
  );
}

export function ReportView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const unitSystem = useAppStore((s) => s.user?.unitSystem ?? "metric");
  const isImperial = unitSystem === "imperial";
  const dispWeight = (kg: number | null) =>
    kg == null ? null : isImperial ? Math.round(kgToLb(kg) * 10) / 10 : Math.round(kg * 10) / 10;
  const weightUnit = isImperial ? dict.common.lb : dict.common.kg;
  const dateFmt = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    day: "numeric",
    month: "short",
  });

  const reportQ = useQuery({
    queryKey: ["report"],
    enabled: open,
    queryFn: () => api<ReportData>("/api/report"),
  });

  const r = reportQ.data;
  const bmi =
    r?.profile?.heightCm && r.body.latest?.weightKg
      ? r.body.latest.weightKg / Math.pow(r.profile.heightCm / 100, 2)
      : null;
  const bmiLabel =
    bmi == null
      ? ""
      : bmi < 18.5
        ? dict.progress.bmiUnder
        : bmi < 25
          ? dict.progress.bmiNormal
          : bmi < 30
            ? dict.progress.bmiOver
            : dict.progress.bmiObese;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="kai-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg lg:max-w-2xl">
        <DialogTitle className="sr-only">{dict.report.title}</DialogTitle>
        {reportQ.isLoading || !r ? (
          <div className="space-y-3 py-4" aria-busy>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            {/* Dialog controls (never printed) */}
            <div className="kai-no-print absolute right-4 top-4 flex gap-2">
              <Button size="sm" className="min-h-[36px]" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" aria-hidden />
                {dict.report.print}
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onClose} aria-label={dict.report.close}>
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            {/* Printable report */}
            <div
              className="kai-print-area rounded-xl border border-neutral-200 bg-white p-5 text-neutral-900"
              role="article"
              aria-label={dict.report.title}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b-2 border-neutral-900 pb-3">
                <div>
                  <h2 className="text-xl font-bold">{dict.report.title}</h2>
                  <p className="mt-0.5 text-xs text-neutral-500 tabular-nums">
                    {dict.report.period}: {dateFmt.format(new Date(`${r.period.start}T12:00:00`))} –{" "}
                    {dateFmt.format(new Date(`${r.period.end}T12:00:00`))} · {r.user.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-700">KaloriAI</p>
                  <p className="text-[10px] text-neutral-500">{r.generatedAt.slice(0, 10)}</p>
                </div>
              </div>

              {/* Nutrition summary */}
              <section className="mt-4" aria-label={dict.report.nutrition}>
                <h3 className="flex items-center gap-1.5 text-sm font-bold">
                  <Salad className="h-4 w-4" aria-hidden />
                  {dict.report.nutrition} — {dict.report.dailyAvg}
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatBox icon={Flame} label={dict.progress.avgCalories} value={r.summary.avgCalories} unit={dict.common.kcal} />
                  <StatBox icon={Target} label={dict.onboarding.protein} value={r.summary.avgProtein} unit={dict.common.g} />
                  <StatBox icon={Target} label={dict.onboarding.carbs} value={r.summary.avgCarbs} unit={dict.common.g} />
                  <StatBox icon={Target} label={dict.onboarding.fat} value={r.summary.avgFat} unit={dict.common.g} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <StatBox icon={Droplets} label={dict.report.avgWater} value={r.summary.avgWaterMl} unit={dict.common.ml} />
                  <StatBox icon={Flame} label={dict.report.totalBurned} value={r.summary.totalBurned} unit={dict.common.kcal} />
                  <StatBox icon={Activity} label={dict.report.workoutCount} value={r.summary.workoutCount} />
                </div>
                {r.targets && (
                  <p className="mt-2 text-xs text-neutral-600 tabular-nums">
                    {dict.report.targets}: {r.targets.calories} {dict.common.kcal} · P{r.targets.protein} / C
                    {r.targets.carbs} / F{r.targets.fat} · {dict.report.adherence}:{" "}
                    {r.summary.adherencePct}% ({r.summary.hitDays}/{r.summary.loggedDays})
                  </p>
                )}
              </section>

              {/* Day-by-day table */}
              <section className="mt-4" aria-label={dict.report.dayByDay}>
                <h3 className="flex items-center gap-1.5 text-sm font-bold">
                  <Footprints className="h-4 w-4" aria-hidden />
                  {dict.report.dayByDay}
                </h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-xs">
                    <thead>
                      <tr className="bg-neutral-100 text-[11px] uppercase tracking-wide text-neutral-600">
                        <th className="border border-neutral-300 px-2 py-1.5 text-left">{dict.report.period}</th>
                        <th className="border border-neutral-300 px-2 py-1.5">{dict.common.kcal}</th>
                        <th className="border border-neutral-300 px-2 py-1.5">{dict.onboarding.protein} (g)</th>
                        <th className="border border-neutral-300 px-2 py-1.5">{dict.onboarding.carbs} (g)</th>
                        <th className="border border-neutral-300 px-2 py-1.5">{dict.onboarding.fat} (g)</th>
                        <th className="border border-neutral-300 px-2 py-1.5">{dict.today.water} ({dict.common.ml})</th>
                        <th className="border border-neutral-300 px-2 py-1.5">{dict.training.caloriesBurned}</th>
                        <th className="border border-neutral-300 px-2 py-1.5">{dict.journal.moodLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.byDate.map((d) => (
                        <tr key={d.date} className={d.kcal === 0 ? "text-neutral-400" : ""}>
                          <Cell className="!text-left">{dateFmt.format(new Date(`${d.date}T12:00:00`))}</Cell>
                          <Cell>{d.kcal || "—"}</Cell>
                          <Cell>{d.kcal ? d.protein : "—"}</Cell>
                          <Cell>{d.kcal ? d.carbs : "—"}</Cell>
                          <Cell>{d.kcal ? d.fat : "—"}</Cell>
                          <Cell>{d.waterMl || "—"}</Cell>
                          <Cell>{d.burned || "—"}</Cell>
                          <Cell aria-label={d.mood ?? undefined}>
                            {d.mood && MOOD_EMOJI[d.mood] ? MOOD_EMOJI[d.mood] : "—"}
                          </Cell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Body section */}
              <section className="mt-4" aria-label={dict.report.body}>
                <h3 className="flex items-center gap-1.5 text-sm font-bold">
                  <Scale className="h-4 w-4" aria-hidden />
                  {dict.report.body}
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatBox
                    icon={Scale}
                    label={dict.report.weight}
                    value={r.body.latest?.weightKg != null ? (dispWeight(r.body.latest.weightKg) ?? "—") : "—"}
                    unit={r.body.latest?.weightKg != null ? weightUnit : undefined}
                  />
                  <StatBox
                    icon={Scale}
                    label={dict.progress.bodyFat}
                    value={r.body.latest?.bodyFatPct != null ? r.body.latest.bodyFatPct : "—"}
                    unit={r.body.latest?.bodyFatPct != null ? "%" : undefined}
                  />
                  <StatBox
                    icon={Scale}
                    label={dict.progress.waist}
                    value={r.body.latest?.waistCm != null ? Math.round(r.body.latest.waistCm * 10) / 10 : "—"}
                    unit={r.body.latest?.waistCm != null ? dict.common.cm : undefined}
                  />
                  <StatBox
                    icon={Activity}
                    label={dict.progress.bmi}
                    value={bmi != null ? Math.round(bmi * 10) / 10 : "—"}
                    unit={bmiLabel}
                  />
                </div>
                {r.body.weekDelta != null && (
                  <p className="mt-2 text-xs text-neutral-600 tabular-nums">
                    {dict.progress.weightChange}:{" "}
                    {(() => {
                      const v = dispWeight(Math.abs(r.body.weekDelta));
                      if (v == null) return "—";
                      const sign = r.body.weekDelta > 0 ? "+" : r.body.weekDelta < 0 ? "−" : "";
                      return `${sign}${v} ${weightUnit}`;
                    })()}
                  </p>
                )}
              </section>

              {/* Footer disclaimer */}
              <p className="mt-4 border-t border-neutral-200 pt-2 text-[10px] text-neutral-400">
                {dict.report.generatedBy}
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReportButton() {
  const dict = useAppStore((s) => s.dict);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="kai-card-hover min-h-[44px]" onClick={() => setOpen(true)}>
        <Printer className="h-4 w-4" aria-hidden />
        {dict.progress.printReport}
      </Button>
      <ReportView open={open} onClose={() => setOpen(false)} />
    </>
  );
}
