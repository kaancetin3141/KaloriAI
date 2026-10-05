"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Wheat, Candy, Atom, Beef, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import type { Targets } from "@/lib/types";

interface MicroRow {
  key: "fiber" | "sugar" | "sodium" | "satFat";
  value: number;
  reference: number;
  isLimit: boolean;
  unit: string;
}

/** MicroBar — progress vs. reference. For limits, going over turns amber→red. */
function MicroBar({ row, label, Icon, index }: { row: MicroRow; label: string; Icon: typeof Wheat; index: number }) {
  const { dict } = useAppStore();
  const pct = row.reference > 0 ? Math.min(140, Math.round((row.value / row.reference) * 100)) : 0;
  const barPct = Math.min(100, pct);
  const over = pct > 100;
  // fiber: over = good (emerald); limits: over = amber, way over (120%+) = red
  const barColor = row.isLimit
    ? over
      ? pct >= 120
        ? "bg-destructive"
        : "bg-amber-400"
      : "bg-emerald-500"
    : pct >= 100
      ? "bg-emerald-500"
      : "bg-primary";
  // sodium unit goes to the label (value "840/2300" is too wide with unit attached)
  const unitInValue = row.key !== "sodium";
  const unit = row.key === "sodium" ? "mg" : dict.common.g;
  const refLabel = row.isLimit ? dict.diary.microsLimit : dict.diary.microsTarget;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="rounded-xl border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", over && row.isLimit ? "text-amber-500" : "text-primary")} aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <span className={cn("shrink-0 text-[11px] font-medium tabular-nums", over && row.isLimit && "text-amber-600 dark:text-amber-400")}>
          {Math.round(row.value)}
          <span className="font-normal text-muted-foreground">
            /{Math.round(row.reference)}{unitInValue ? ` ${unit}` : ""}
          </span>
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} — ${refLabel} ${Math.round(row.reference)} ${unit}`}
      >
        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${barPct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {over && row.isLimit ? dict.diary.microsOver : refLabel}
        {!unitInValue && <span> · {unit}</span>}
      </p>
    </motion.div>
  );
}

/**
 * MicronutrientsCard — Cronometer-style daily fiber/sugar/sodium/satFat panel.
 * Reference values are derived from the calorie target:
 *  - fiber: 14 g per 1000 kcal (WHO/EFSA-aligned, min 25)
 *  - sugar: ≤10% of energy / 4 kcal per g
 *  - satFat: ≤10% of energy / 9 kcal per g
 *  - sodium: 2300 mg (WHO guideline)
 */
export function MicronutrientsCard({
  totals,
  targets,
  index = 0,
}: {
  totals: { fiber: number; sugar: number; sodium: number; satFat: number };
  targets: Targets | null;
  index?: number;
}) {
  const { dict } = useAppStore();
  const kcalTarget = targets?.calories ?? 2000;

  const rows = useMemo<MicroRow[]>(() => {
    const fiberRef = Math.max(25, Math.round((14 * kcalTarget) / 1000));
    const sugarRef = Math.round((kcalTarget * 0.1) / 4);
    const satFatRef = Math.round((kcalTarget * 0.1) / 9);
    return [
      { key: "fiber", value: totals.fiber, reference: fiberRef, isLimit: false, unit: "g" },
      { key: "sugar", value: totals.sugar, reference: sugarRef, isLimit: true, unit: "g" },
      { key: "sodium", value: totals.sodium, reference: 2300, isLimit: true, unit: "mg" },
      { key: "satFat", value: totals.satFat, reference: satFatRef, isLimit: true, unit: "g" },
    ];
  }, [totals, kcalTarget]);

  const icons = { fiber: Wheat, sugar: Candy, sodium: Atom, satFat: Beef };
  const labels: Record<MicroRow["key"], string> = {
    fiber: dict.diary.fiber,
    sugar: dict.diary.sugar,
    sodium: dict.diary.sodium,
    satFat: dict.diary.satFat,
  };

  const anyOver = rows.some((r) => r.isLimit && r.value > r.reference);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.04 }}
      aria-label={dict.diary.micros}
    >
      <Card className={cn("kai-card-hover p-4", anyOver && "border-amber-400/40")}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{dict.diary.micros}</h3>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground" title={dict.diary.microsSub}>
            <Info className="h-3 w-3" aria-hidden />
            <span className="hidden sm:inline">{dict.diary.microsSub}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {rows.map((row, i) => (
            <MicroBar key={row.key} row={row} label={labels[row.key]} Icon={icons[row.key]} index={i} />
          ))}
        </div>
      </Card>
    </motion.section>
  );
}
