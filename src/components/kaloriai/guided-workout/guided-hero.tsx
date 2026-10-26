"use client";

/**
 * Guided workout hero card (training screen) + floating mini-bar
 * (any other tab) for an in-progress session.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Dumbbell, Timer as TimerIcon, Flame, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import type { StrengthSessionDTO } from "@/lib/strength";

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Props {
  onStartEmpty: () => void;
}

export function GuidedHero({ onStartEmpty }: Props) {
  const dict = useAppStore((s) => s.dict);
  const session = useAppStore((s) => s.guidedSession);
  const setGuidedOpen = useAppStore((s) => s.setGuidedOpen);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!session) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [session]);

  const lastQ = useQuery<{ sessions: StrengthSessionDTO[] }>({
    queryKey: ["whistory"],
    queryFn: () => api<{ sessions: StrengthSessionDTO[] }>("/api/workouts/session?limit=1"),
    staleTime: 60_000,
  });
  const last = lastQ.data?.sessions[0];

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="kai-pulse-ring relative h-11 w-11 rounded-2xl bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/30">
            <Dumbbell className="h-5 w-5 text-primary-foreground" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold leading-tight">{dict.guided.title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{dict.guided.sub}</p>
          </div>
        </div>

        {session ? (
          /* continue card */
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
            <TimerIcon className="h-5 w-5 text-primary shrink-0 animate-pulse" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{session.name || dict.guided.active}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {fmtElapsed(now - session.startedAt)} · {session.exercises.length} {dict.guided.exercisesDone}
              </p>
            </div>
            <Button onClick={() => setGuidedOpen(true)} className="rounded-xl font-semibold shadow-sm shadow-primary/25 shrink-0">
              <Play className="h-4 w-4 mr-1.5" aria-hidden />
              {dict.guided.start}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Button
              onClick={onStartEmpty}
              size="lg"
              className="rounded-2xl font-semibold text-base shadow-md shadow-primary/25 flex-1 min-h-[52px]"
            >
              <Play className="h-5 w-5 mr-2" aria-hidden />
              {dict.guided.startEmpty}
            </Button>
            {last && (
              <div className="text-xs text-muted-foreground space-y-0.5 sm:text-right">
                <p className="font-medium text-foreground truncate">{last.name || dict.guided.title}</p>
                <p className="flex items-center gap-2 sm:justify-end flex-wrap">
                  <span className="inline-flex items-center gap-0.5">
                    <Flame className="h-3 w-3 text-amber-500" aria-hidden />
                    {last.calories} {dict.common.kcal}
                  </span>
                  <span>
                    {last.exercises.reduce((n, e) => n + e.sets.length, 0)} {dict.guided.setsDone}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Trophy className="h-3 w-3 text-amber-500" aria-hidden />
                    {last.exercises.reduce((n, e) => n + e.sets.filter((st) => st.pr).length, 0)}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Floating pill for an in-progress session on tabs other than Training */
export function GuidedMiniBar() {
  const dict = useAppStore((s) => s.dict);
  const tab = useAppStore((s) => s.tab);
  const session = useAppStore((s) => s.guidedSession);
  const setTab = useAppStore((s) => s.setTab);
  const setGuidedOpen = useAppStore((s) => s.setGuidedOpen);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!session) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [session]);

  const visible = !!session && tab !== "training";

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          onClick={() => {
            setTab("training");
            setGuidedOpen(true);
          }}
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur shadow-lg shadow-primary/10 pl-4 pr-3 py-2.5 flex items-center gap-3 hover:shadow-xl transition-shadow"
          aria-label={dict.guided.active}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <span className="text-sm font-semibold">{session!.name || dict.guided.active}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{fmtElapsed(now - session!.startedAt)}</span>
          <span className="rounded-xl bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1.5 shrink-0">
            {dict.guided.start}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
