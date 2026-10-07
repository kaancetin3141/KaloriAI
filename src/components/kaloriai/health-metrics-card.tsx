"use client";

import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Activity, MoveHorizontal, Percent, Scale } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { kgToLb } from "@/lib/units";

interface ProfileRow {
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
}

type BmiCat = "under" | "normal" | "over" | "obese";

/** WHO BMI kategorileri */
function bmiCategory(bmi: number): BmiCat {
  if (bmi < 18.5) return "under";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "over";
  return "obese";
}

/** Ölçek penceresi: BMI 15 → 40 */
const BMI_MIN = 15;
const BMI_MAX = 40;
const posPct = (bmi: number): number =>
  Math.min(100, Math.max(0, ((Math.min(BMI_MAX, Math.max(BMI_MIN, bmi)) - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 100));

/** Bant genişlikleri (toplamı 100): 15-18.5 | 18.5-25 | 25-30 | 30-40 */
const ZONES: { cat: BmiCat; width: string }[] = [
  { cat: "under", width: "14%" },
  { cat: "normal", width: "26%" },
  { cat: "over", width: "20%" },
  { cat: "obese", width: "40%" },
];

const ZONE_TONE: Record<BmiCat, string> = {
  under: "bg-amber-300",
  normal: "bg-emerald-500",
  over: "bg-orange-400",
  obese: "bg-red-500",
};

const BADGE_TONE: Record<BmiCat, string> = {
  under: "bg-amber-500/15 text-amber-600 dark:text-amber-500 border-amber-500/40",
  normal: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-500 border-emerald-500/40",
  over: "bg-orange-500/15 text-orange-600 dark:text-orange-500 border-orange-500/40",
  obese: "bg-red-500/15 text-red-600 dark:text-red-500 border-red-500/40",
};

function fmtNum(v: number, locale: string, digits = 1): string {
  return v.toLocaleString(locale === "en" ? "en-US" : "tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Sağlık Metrikleri kartı — VKİ (BMI), WHO kategorisi, renkli ölçek işaretçisi
 * ve boyuna göre ideal kilo aralığı. Profil verisi ["profile"] sorgusundan
 * okunur (aynı queryKey → TanStack Query cache'i sayesinde ek istek yok).
 */
export function HealthMetricsCard() {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const unitSystem = useAppStore((s) => s.user?.unitSystem ?? "metric");
  const isImperial = unitSystem === "imperial";

  const profileQ = useQuery<{ profile: ProfileRow | null }>({
    queryKey: ["profile"],
    queryFn: () => api<{ profile: ProfileRow | null }>("/api/profile"),
    staleTime: 30_000,
  });

  const prof = profileQ.data?.profile ?? null;
  const weightKg = prof?.weightKg ?? null;
  const heightCm = prof?.heightCm ?? null;
  const bodyFatPct = prof?.bodyFatPct ?? null;

  const hasBmi = weightKg != null && heightCm != null && heightCm >= 100;
  const bmi = hasBmi ? weightKg / Math.pow(heightCm / 100, 2) : null;
  const cat = bmi != null ? bmiCategory(bmi) : null;

  const minKg = heightCm != null ? 18.5 * Math.pow(heightCm / 100, 2) : null;
  const maxKg = heightCm != null ? 24.9 * Math.pow(heightCm / 100, 2) : null;

  const dispWeight = (kg: number) => (isImperial ? fmtNum(kgToLb(kg), locale, 0) : fmtNum(kg, locale, 1));
  const weightUnit = isImperial ? "lb" : "kg";

  const rangeText =
    minKg != null && maxKg != null
      ? `${dispWeight(minKg)}–${dispWeight(maxKg)} ${weightUnit}`
      : null;

  const toGoText = (() => {
    if (weightKg == null || minKg == null || maxKg == null) return null;
    const diff = weightKg < minKg ? minKg - weightKg : weightKg > maxKg ? weightKg - maxKg : null;
    if (diff == null) return dict.profile.inRange;
    return dict.profile.kgToRange.replace("{v}", dispWeight(diff)).replace("{unit}", weightUnit);
  })();

  const inRangeNow = weightKg != null && minKg != null && maxKg != null && weightKg >= minKg && weightKg <= maxKg;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0" aria-hidden>
            <Activity className="h-4 w-4 text-accent-foreground" />
          </span>
          {dict.profile.healthTitle}
        </CardTitle>
        <CardDescription>{dict.profile.healthSub}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!hasBmi ? (
          <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground" role="note">
            {dict.profile.heightMissing}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              {/* BMI büyük değer */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {dict.profile.bmiLabel}
                </span>
                <div className="flex items-end gap-2">
                  <motion.span
                    key={bmi?.toFixed(1)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-3xl font-bold tabular-nums leading-none"
                    aria-label={`${dict.profile.bmiLabel}: ${fmtNum(bmi ?? 0, locale)}`}
                  >
                    {fmtNum(bmi ?? 0, locale)}
                  </motion.span>
                  {cat && (
                    <span
                      className={cn(
                        "mb-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                        BADGE_TONE[cat]
                      )}
                    >
                      {dict.profile[cat === "under" ? "bmiUnder" : cat === "normal" ? "bmiNormal" : cat === "over" ? "bmiOver" : "bmiObese"]}
                    </span>
                  )}
                </div>
              </div>

              {/* İdeal aralık + yağ oranı */}
              <div className="flex flex-col justify-center gap-2.5">
                {rangeText && (
                  <div className="flex items-center gap-2" title={dict.profile.idealRange}>
                    <Scale className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <span className="block text-[11px] text-muted-foreground">{dict.profile.idealRange}</span>
                      <span className={cn("block truncate text-sm font-semibold tabular-nums", inRangeNow && "text-emerald-600 dark:text-emerald-500")}>
                        {rangeText}
                      </span>
                    </div>
                  </div>
                )}
                {bodyFatPct != null && (
                  <div className="flex items-center gap-2" title={dict.profile.bodyFatLabel}>
                    <Percent className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <span className="block text-[11px] text-muted-foreground">{dict.profile.bodyFatLabel}</span>
                      <span className="block text-sm font-semibold tabular-nums">{fmtNum(bodyFatPct, locale, 0)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Renkli ölçek + işaretçi */}
            {bmi != null && (
              <div>
                <div
                  className="relative h-2.5 w-full overflow-visible rounded-full"
                  role="img"
                  aria-label={`${dict.profile.bmiLabel}: ${fmtNum(bmi, locale)}`}
                >
                  <div className="flex h-full w-full overflow-hidden rounded-full" aria-hidden>
                    {ZONES.map((z) => (
                      <div key={z.cat} className={cn("h-full", ZONE_TONE[z.cat])} style={{ width: z.width }} />
                    ))}
                  </div>
                  <motion.div
                    className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                    initial={{ left: "0%" }}
                    animate={{ left: `${posPct(bmi)}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                    aria-hidden
                  >
                    <span className="block h-4 w-4 rounded-full border-2 border-background bg-foreground shadow-md" />
                  </motion.div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums" aria-hidden>
                  <span>{BMI_MIN}</span>
                  <span>18.5</span>
                  <span>25</span>
                  <span>30</span>
                  <span>{BMI_MAX}</span>
                </div>
                {toGoText && (
                  <p
                    className={cn(
                      "mt-2.5 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium",
                      inRangeNow
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-500"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500"
                    )}
                  >
                    <MoveHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {toGoText}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
