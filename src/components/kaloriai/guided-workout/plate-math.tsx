"use client";

/**
 * Plate math dialog (openGym-inspired): greedy per-side plate loading for a
 * target barbell weight, with olympic/light bar toggle and nearest-loadable hints.
 */
import { useMemo, useState } from "react";
import { Disc3, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { calcPlates } from "@/lib/strength";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** prefill from the exercise's top filled set (kg); null → empty */
  initialWeight: number | null;
}

/** IPF-style plate colours (domain convention, not UI theme) */
const PLATE_STYLES: Record<string, string> = {
  "25": "bg-rose-600 text-white",
  "20": "bg-sky-700 text-white",
  "15": "bg-amber-400 text-amber-950",
  "10": "bg-emerald-600 text-white",
  "5": "bg-zinc-200 text-zinc-900 border border-zinc-400",
  "2.5": "bg-zinc-400 text-white",
  "1.25": "bg-zinc-500 text-white",
};

const num = (v: string): number => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export function PlateMathDialog({ open, onOpenChange, initialWeight }: Props) {
  const dict = useAppStore((s) => s.dict);
  // lazily initialized from props; parent remounts (key) on each open
  const [weight, setWeight] = useState(() => (initialWeight != null ? String(initialWeight) : ""));
  const [barKg, setBarKg] = useState<20 | 10>(20);
  const touched = weight.trim() !== "";

  const target = num(weight);
  const valid = Number.isFinite(target) && target > 0 && target <= 1000;
  const result = useMemo(() => (valid ? calcPlates(target, barKg) : null), [valid, target, barKg]);
  const exact = result && result.remainder === 0 && result.plates.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Disc3 className="h-4 w-4 text-primary" aria-hidden />
            {dict.guided.plates.title}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* target + bar toggle */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="plate-target" className="text-xs font-medium text-muted-foreground">
                {dict.guided.plates.target} ({dict.common.kg})
              </label>
              <Input
                id="plate-target"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value.slice(0, 6))}
                placeholder="100"
                className="min-h-[44px] tabular-nums text-center text-lg font-bold rounded-xl"
              />
            </div>
            <div className="flex rounded-xl bg-muted p-1 gap-1 shrink-0" role="group" aria-label={dict.guided.plates.bar}>
              {([20, 10] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBarKg(b)}
                  aria-pressed={barKg === b}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors min-h-[36px] ${
                    barKg === b ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b === 20 ? dict.guided.plates.barOlympic : dict.guided.plates.barLight}
                </button>
              ))}
            </div>
          </div>

          {/* result */}
          {!touched && !valid ? (
            <p className="text-sm text-muted-foreground text-center py-4">{dict.guided.plates.empty}</p>
          ) : !valid ? (
            <p className="text-sm text-muted-foreground text-center py-4">–</p>
          ) : result && result.plates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {dict.guided.plates.bar}: {barKg} {dict.common.kg}
            </p>
          ) : result ? (
            <>
              {/* per-side plate strip */}
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {dict.guided.plates.total}:{" "}
                    <span className="font-bold text-foreground tabular-nums">
                      {target} {dict.common.kg}
                    </span>
                  </span>
                  {exact ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                      <Check className="h-3 w-3" aria-hidden />
                      {dict.guided.plates.exact}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      {dict.guided.plates.nearest}: {result.nearestBelow} / {result.nearestAbove} {dict.common.kg}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5 justify-center flex-wrap py-1" aria-label={`${dict.guided.plates.perSide}: ${result.perSideTotal} kg`}>
                  {/* bar */}
                  <span className="h-12 w-2.5 rounded-sm bg-zinc-700 shrink-0" title={`${dict.guided.plates.bar} ${barKg} kg`} aria-hidden />
                  {result.plates.map((p) => (
                    <span key={p.kg} className="flex items-center gap-1.5">
                      {Array.from({ length: p.count }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-12 w-3.5 sm:w-4 rounded-full grid place-items-center text-[9px] font-black tabular-nums ${PLATE_STYLES[String(p.kg)] ?? "bg-zinc-300 text-zinc-900"}`}
                          title={`${p.kg} kg`}
                          aria-label={`${p.kg} kg`}
                          role="img"
                        >
                          {p.kg}
                        </span>
                      ))}
                    </span>
                  ))}
                  <span className="h-12 w-2.5 rounded-sm bg-zinc-700 shrink-0" aria-hidden />
                </div>

                <p className="text-center text-xs text-muted-foreground tabular-nums">
                  {result.plates.map((p) => `${p.count}×${p.kg}`).join(" + ") || "–"}{" "}
                  {dict.guided.plates.perSide} · {result.perSideTotal} {dict.common.kg}
                </p>
              </div>
            </>
          ) : null}

          {/* quick presets */}
          <div className="flex gap-1.5 justify-center flex-wrap">
            {[60, 80, 100, 120, 140, 160].map((w) => (
              <Button
                key={w}
                variant="secondary"
                size="sm"
                className="rounded-lg text-xs tabular-nums h-8 px-2.5"
                onClick={() => setWeight(String(w))}
              >
                {w}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
