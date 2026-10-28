"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCountUp } from "@/hooks/use-count-up";
import type { Dictionary } from "@/lib/i18n";
import type { DiaryResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Zen Puanı kartı — günün DENGESİNİ ödüllendiren anlık istemci skoru (API yok).
 * Bileşenler: kalori dengesi 0-40, protein 0-25, su 0-15, lif 0-10,
 * öğün bütünlüğü 0-10 → toplam 0-100. Kısıtlamayı değil dengeli günü ödüllendirir.
 */

/** Sayıyı [min, max] aralığına sıkıştırır */
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Kalori dengesi (0-40) — parçalı doğrusal:
 * (0,0) → (0.5,16) → (0.8,40) → (1.10,40) → (1.5,20) → (2.0,0), ötesi 0.
 * x = tüketilen / hedef. %80-110 arası plato tam puan alır; aşırı alt/üst
 * tüketim lineer düşer (kısıtlama da abartı da ödüllendirilmez).
 */
function kcalBalanceScore(consumed: number, target: number): number {
  if (target <= 0) return 0;
  const x = consumed / target;
  if (x <= 0.5) return clamp((x / 0.5) * 16, 0, 16);
  if (x <= 0.8) return 16 + ((x - 0.5) / 0.3) * 24;
  if (x <= 1.1) return 40;
  if (x <= 1.5) return 40 - ((x - 1.1) / 0.4) * 20;
  if (x <= 2.0) return 20 - ((x - 1.5) / 0.5) * 20;
  return 0;
}

/** Bugün ekranındaki `fade` helper ile aynı giriş animasyonu */
const fade = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, delay: i * 0.05 },
});

interface ZenScoreCardProps {
  /** Günün defter toplamları (kcal, protein, fiber, ...) */
  totals: DiaryResponse["totals"];
  /** Günün etkili kalori bütçesi (antrenman günü farkı dahil) */
  targetKcal: number;
  /** Günün etkili protein hedefi (g) */
  targetProtein: number;
  waterMl: number;
  waterTargetMl: number;
  /** Bugün kayıt girilmiş öğün tipi sayısı (0-4) */
  loggedMealTypes: number;
  dict: Dictionary;
  /** Stagger gecikmesi için fade indeksi */
  index?: number;
}

/** Mini dairesel gösterge: 72px, chart-1→chart-2 gradyan yayı, skor sayacı animasyonlu */
function ZenGauge({ score, scoreUnit, label }: { score: number; scoreUnit: string; label: string }) {
  const animated = useCountUp(score, 900);
  const R = 33;
  const C = 2 * Math.PI * R;
  const pct = clamp(animated / 100, 0, 1);
  return (
    <div className="relative h-[72px] w-[72px] shrink-0" role="img" aria-label={label}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="kaiZenGauge" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" className="[stop-color:var(--chart-1)]" />
            <stop offset="100%" className="[stop-color:var(--chart-2)]" />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r={R} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          stroke="url(#kaiZenGauge)"
          aria-hidden
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold leading-none tabular-nums">{Math.round(animated)}</span>
        <span className="mt-1 text-[9px] leading-none text-muted-foreground">{scoreUnit}</span>
      </div>
    </div>
  );
}

export function ZenScoreCard({
  totals,
  targetKcal,
  targetProtein,
  waterMl,
  waterTargetMl,
  loggedMealTypes,
  dict,
  index = 2,
}: ZenScoreCardProps) {
  const [open, setOpen] = useState(false);

  // --- Saf istemci hesabı (API yok) ---
  const consumedKcal = totals?.kcal ?? 0;
  const consumedProtein = totals?.protein ?? 0;
  const fiber = totals?.fiber ?? 0;

  const kcalFit = clamp(kcalBalanceScore(consumedKcal, targetKcal), 0, 40);
  const proteinFit = targetProtein > 0 ? clamp(Math.min(consumedProtein / targetProtein, 1) * 25, 0, 25) : 0;
  const waterFit = waterTargetMl > 0 ? clamp(Math.min(waterMl / waterTargetMl, 1) * 15, 0, 15) : 0;
  const fiberFit = clamp(Math.min(fiber / 30, 1) * 10, 0, 10);
  const completeness = clamp((Math.min(loggedMealTypes, 4) / 4) * 10, 0, 10);
  const score = Math.round(clamp(kcalFit + proteinFit + waterFit + fiberFit + completeness, 0, 100));

  // Kademe açıklaması: <25 → kayıt yoksa desc0, varsa desc1; 25-59 desc1; 60-84 desc2; ≥85 desc3
  const nothingLogged = loggedMealTypes === 0 && consumedKcal <= 0;
  const tierDesc =
    score < 25
      ? nothingLogged
        ? dict.zenScore.desc0
        : dict.zenScore.desc1
      : score < 60
        ? dict.zenScore.desc1
        : score < 85
          ? dict.zenScore.desc2
          : dict.zenScore.desc3;

  const rows = [
    { label: dict.zenScore.kcalFit, earned: kcalFit, max: 40 },
    { label: dict.zenScore.proteinFit, earned: proteinFit, max: 25 },
    { label: dict.zenScore.waterFit, earned: waterFit, max: 15 },
    { label: dict.zenScore.fiberFit, earned: fiberFit, max: 10 },
    { label: dict.zenScore.completeness, earned: completeness, max: 10 },
  ];

  return (
    <motion.div {...fade(index)} role="complementary" aria-label={dict.zenScore.title}>
      <Card className="kai-card-hover rounded-2xl p-4">
        <p className="sr-only">
          {dict.zenScore.title}: {score} {dict.zenScore.scoreUnit} — {tierDesc}
        </p>
        <div className="flex items-center gap-4">
          {/* Sol: dairesel mini gösterge */}
          <ZenGauge
            score={score}
            scoreUnit={dict.zenScore.scoreUnit}
            label={`${dict.zenScore.title}: ${score} ${dict.zenScore.scoreUnit}`}
          />

          {/* Sağ: başlık + kademe açıklaması + döküm anahtarı */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold leading-snug">{dict.zenScore.title}</p>
              {score >= 85 && (
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {dict.zenScore.balancedDay}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{tierDesc}</p>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-1.5 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>{dict.zenScore.breakdown}</span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")}
                aria-hidden
              />
            </button>

            {open && (
              <motion.ul
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-1 space-y-2 border-t pt-2"
              >
                {rows.map((r) => {
                  const pct = Math.round(clamp((r.earned / r.max) * 100, 0, 100));
                  return (
                    <li key={r.label}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground">{r.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {Math.round(r.earned)}/{r.max}
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={r.label}
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-chart-1 to-chart-2 transition-[width] duration-500 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </motion.ul>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
