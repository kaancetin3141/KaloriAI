"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Timer, TimerReset, Flame, Play, Square, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";

interface FastingActive {
  id: string;
  startAt: string;
  targetHours: number;
}

interface FastingResponse {
  active: FastingActive | null;
  history: { id: string; durationHours: number | null; targetHours: number; startAt: string }[];
  stats: { completedCount: number; totalHours: number };
}

const PRESETS = [12, 14, 16, 18] as const;

function fmtElapsed(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}s ${String(m).padStart(2, "0")}dk`;
}

export function FastingCard({ index }: { index: number }) {
  const dict = useAppStore((s) => s.dict);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [preset, setPreset] = useState<number>(16);
  const [now, setNow] = useState(() => Date.now());

  const { data, isLoading } = useQuery({
    queryKey: ["fasting"],
    queryFn: () => api<FastingResponse>("/api/fasting"),
  });

  useEffect(() => {
    if (!data?.active) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [data?.active]);

  const startFast = useMutation({
    mutationFn: (hours: number) => api("/api/fasting", { body: { action: "start", targetHours: hours } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fasting"] });
      toast({ description: dict.today.fastingActive });
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const stopFast = useMutation({
    mutationFn: () => api("/api/fasting", { body: { action: "stop" } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fasting"] });
      toast({ description: dict.today.fastingDone });
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const fade = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25, delay: index * 0.05 },
  };

  if (isLoading) {
    return (
      <motion.div {...fade}>
        <Card className="p-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-3 h-10 w-full" />
        </Card>
      </motion.div>
    );
  }

  const active = data?.active ?? null;
  const elapsedMs = active ? now - new Date(active.startAt).getTime() : 0;
  const targetMs = active ? active.targetHours * 3600000 : 1;
  const pct = active ? Math.min(Math.round((elapsedMs / targetMs) * 100), 100) : 0;
  const reached = pct >= 100;

  return (
    <motion.div {...fade}>
      <Card className={`p-4 transition-colors ${active ? "border-amber-300/60 dark:border-amber-500/30" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                active ? "bg-amber-500/15" : "bg-primary/10"
              }`}
            >
              <Timer className={`h-4.5 w-4.5 ${active ? "text-amber-600 dark:text-amber-400" : "text-primary"}`} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{dict.today.fasting}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {active ? dict.today.fastingActive : dict.today.fastingIdle}
              </p>
            </div>
          </div>
          {active ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px] shrink-0 gap-1.5 rounded-full sm:min-h-9"
              onClick={() => stopFast.mutate()}
              disabled={stopFast.isPending}
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
              {dict.today.fastingStop}
            </Button>
          ) : (
            <Button
              size="sm"
              className="min-h-[44px] shrink-0 gap-1.5 rounded-full sm:min-h-9"
              onClick={() => startFast.mutate(preset)}
              disabled={startFast.isPending}
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              {dict.today.fastingStart}
            </Button>
          )}
        </div>

        {active ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium tabular-nums">
                {fmtElapsed(elapsedMs)} {dict.today.fastingElapsed}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {reached ? dict.today.fastingDone : `${active.targetHours} ${dict.today.fastingHours} ${dict.today.fastingLeft}`}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={dict.today.fasting}
            >
              <div
                className={`h-full rounded-full transition-all duration-700 ${reached ? "bg-primary" : "bg-amber-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={dict.today.fasting}>
              {PRESETS.map((h) => (
                <button
                  key={h}
                  role="radio"
                  aria-checked={preset === h}
                  onClick={() => setPreset(h)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    preset === h
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {dict.fastingPresets[h]}
                </button>
              ))}
            </div>
            {data && data.stats.completedCount > 0 && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                <span>
                  {dict.today.fastingTotal}: <strong className="tabular-nums">{data.stats.totalHours}</strong>
                  {dict.today.fastingHours} · {data.stats.completedCount}×
                </span>
              </div>
            )}
          </div>
        )}

        {data && data.history.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <TimerReset className="h-3.5 w-3.5" aria-hidden />
              {dict.today.fastingHistory}
              <Badge variant="outline" className="ml-auto gap-1 rounded-full px-2 py-0 text-[10px]">
                <Flame className="h-3 w-3 text-amber-500" aria-hidden />
                {data.stats.completedCount}
              </Badge>
            </div>
            <div className="mt-2 flex items-end gap-1.5" aria-hidden>
              {data.history
                .slice()
                .reverse()
                .map((f) => {
                  const h = f.durationHours ?? 0;
                  const barPct = Math.min(Math.round((h / Math.max(f.targetHours, 1)) * 100), 100);
                  return (
                    <div key={f.id} className="group relative flex-1" title={`${h}${dict.today.fastingHours}`}>
                      <div
                        className={`w-full rounded-t-md transition-all ${h >= f.targetHours ? "bg-primary/70" : "bg-muted-foreground/30"}`}
                        style={{ height: `${Math.max(8, barPct * 0.32)}px` }}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
