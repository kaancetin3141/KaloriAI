"use client";

/**
 * Active guided workout overlay (openGym-inspired):
 * set-by-set logging, live PR badges, rest timer, pre-fill from last time,
 * session summary with PR list + save-as-routine. Survives tab switches
 * (state lives in the app store, persisted to localStorage).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Trash2, Plus, Check, Trophy, Flame, Timer as TimerIcon, Minimize2,
  BookmarkPlus, ArrowLeft, Loader2, History as HistoryIcon, Sun, Dumbbell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAppStore, type GuidedExerciseState } from "@/stores/app-store";
import { api, ApiError } from "@/lib/api";
import { estimate1RM, strengthSessionMet } from "@/lib/strength";
import { useToast } from "@/hooks/use-toast";
import { RestTimer } from "./rest-timer";
import { ExercisePicker, muscleBadgeClass, type PickedExercise } from "./exercise-picker";

interface RestState {
  endsAt: number;
  total: number;
}

const DEFAULT_REST = 90;

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const num = (v: string): number => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** A set is "loggable" when reps > 0 (weight can be 0 → bodyweight) */
function validSet(reps: string, weightKg: string): boolean {
  const r = num(reps);
  const w = num(weightKg);
  return Number.isFinite(r) && r > 0 && r <= 1000 && Number.isFinite(w) && w >= 0 && w <= 1000;
}

/** Live PR metric: e1RM for weighted, best reps for bodyweight */
function prMetric(reps: string, weightKg: string): number {
  const r = num(reps);
  const w = num(weightKg);
  if (!Number.isFinite(r) || !Number.isFinite(w) || r <= 0) return 0;
  return w > 0 ? estimate1RM(w, r) : r;
}

interface Props {
  /** today's date YYYY-MM-DD (app timezone) */
  date: string;
}

export function ActiveSession({ date }: Props) {
  const dict = useAppStore((s) => s.dict);
  const session = useAppStore((s) => s.guidedSession);
  const open = useAppStore((s) => s.guidedOpen);
  const setOpen = useAppStore((s) => s.setGuidedOpen);
  const patch = useAppStore((s) => s.patchGuidedSession);
  const endSession = useAppStore((s) => s.endGuidedSession);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<"train" | "summary">("train");
  const [rest, setRest] = useState<RestState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* elapsed clock */
  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [open]);

  /* reset local state on new session */
  useEffect(() => {
    if (session) {
      setStep("train");
      setRest(null);
      setSaveErr(null);
    }
  }, [session?.startedAt]);

  /* screen wake lock (openGym: "the screen stays awake while you train") */
  const keepAwake = session?.keepAwake ?? false;
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    let cancelled = false;
    if (open && keepAwake && nav.wakeLock) {
      nav.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      lock?.release().catch(() => {});
    };
  }, [open, keepAwake]);

  /* ---------- session mutations (pure store patches) ---------- */
  const addExercise = useCallback(
    (picked: PickedExercise) => {
      patch((s) => ({
        ...s,
        exercises: [
          ...s.exercises,
          {
            exerciseKey: picked.exerciseKey,
            name: picked.name,
            muscle: picked.muscle,
            equipment: picked.equipment,
            restSec: DEFAULT_REST,
            sets: [{ reps: "", weightKg: "", rir: "", done: false }],
          },
        ],
      }));
      // lazy-load history for pre-fill + PR baseline
      if (!picked.exerciseKey.startsWith("custom:")) {
        api<{ history: { sets: { reps: number; weightKg: number }[] }[]; best: number; last: { reps: number; weightKg: number }[] | null }>(
          `/api/workouts/exercise?exerciseKey=${encodeURIComponent(picked.exerciseKey)}`,
        )
          .then((res) => {
            patch((s) => ({
              ...s,
              exercises: s.exercises.map((ex) =>
                ex.exerciseKey === picked.exerciseKey
                  ? {
                      ...ex,
                      prevBest: res.best,
                      lastSets: res.last ?? undefined,
                      sets:
                        !res.last || res.last.length === 0
                          ? ex.sets
                          : // pre-fill first empty set from last performance
                            ex.sets.map((set, i) =>
                              i === 0 && !set.reps && !set.weightKg
                                ? { ...set, reps: String(res.last![0].reps), weightKg: String(res.last![0].weightKg) }
                                : set,
                            ),
                    }
                  : ex,
              ),
            }));
          })
          .catch(() => {});
      }
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    },
    [patch],
  );

  const removeExercise = (idx: number) => {
    patch((s) => ({ ...s, exercises: s.exercises.filter((_, i) => i !== idx) }));
  };

  const addSet = (exIdx: number) => {
    patch((s) => ({
      ...s,
      exercises: s.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        const last = ex.sets[ex.sets.length - 1];
        const lastPerf = ex.lastSets?.[0];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              reps: last?.reps || (lastPerf ? String(lastPerf.reps) : ""),
              weightKg: last?.weightKg || (lastPerf ? String(lastPerf.weightKg) : ""),
              rir: "",
              done: false,
            },
          ],
        };
      }),
    }));
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    patch((s) => ({
      ...s,
      exercises: s.exercises.map((ex, i) =>
        i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex,
      ),
    }));
  };

  const updateSet = (exIdx: number, setIdx: number, field: "reps" | "weightKg" | "rir", value: string) => {
    patch((s) => ({
      ...s,
      exercises: s.exercises.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((set, j) => (j === setIdx ? { ...set, [field]: value.slice(0, 6) } : set)) }
          : ex,
      ),
    }));
  };

  const toggleSet = (exIdx: number, setIdx: number) => {
    const ex = session?.exercises[exIdx];
    const set = ex?.sets[setIdx];
    if (!ex || !set) return;
    if (!set.done && !validSet(set.reps, set.weightKg)) {
      toast({ title: dict.guided.emptySession, variant: "destructive" });
      return;
    }
    const willDone = !set.done;
    patch((s) => ({
      ...s,
      exercises: s.exercises.map((e, i) =>
        i === exIdx ? { ...e, sets: e.sets.map((st, j) => (j === setIdx ? { ...st, done: willDone } : st)) } : e,
      ),
    }));
    // openGym behaviour: completing a set starts the rest timer
    if (willDone) {
      setRest({ endsAt: Date.now() + ex.restSec * 1000, total: ex.restSec });
    }
  };

  /* ---------- derived ---------- */
  const exercises = session?.exercises ?? [];
  const doneSets = exercises.flatMap((e) => e.sets).filter((s) => s.done && validSet(s.reps, s.weightKg));
  const volume = doneSets.reduce((v, s) => v + num(s.reps) * num(s.weightKg), 0);
  const allSets = exercises.flatMap((e) => e.sets).filter((s) => validSet(s.reps, s.weightKg));
  const loggable = exercises.filter((e) => e.sets.some((s) => validSet(s.reps, s.weightKg)));
  const elapsedMs = session ? now - session.startedAt : 0;
  const estKcal = useMemo(() => {
    if (!session) return 0;
    const met = strengthSessionMet(
      loggable.map((e) => ({ exerciseKey: e.exerciseKey, name: e.name, muscle: e.muscle, equipment: e.equipment, sets: e.sets.filter((s) => validSet(s.reps, s.weightKg)).map((s) => ({ reps: num(s.reps), weightKg: num(s.weightKg) })) })),
    );
    // rough: ~5 kcal/min at MET 5 for a 70kg trainee, scaled by MET
    return Math.round(((met * 3.5 * 70) / 200) * Math.max(1, Math.round(elapsedMs / 60000)));
  }, [session, loggable, elapsedMs]);

  /* ---------- save ---------- */
  const saveSession = useMutation({
    mutationFn: () => {
      const payload = {
        date,
        name: session?.name?.trim() || null,
        durationMin: Math.max(1, Math.round(elapsedMs / 60000)),
        exercises: loggable.map((e) => ({
          exerciseKey: e.exerciseKey,
          name: e.name,
          muscle: e.muscle,
          equipment: e.equipment,
          sets: e.sets
            .filter((s) => validSet(s.reps, s.weightKg))
            .map((s) => {
              const rir = num(s.rir);
              return {
                reps: Math.round(num(s.reps)),
                weightKg: Math.round(num(s.weightKg) * 10) / 10,
                ...(Number.isFinite(rir) && s.rir.trim() !== "" ? { rir: Math.round(rir) } : {}),
              };
            }),
        })),
      };
      return api<{ ok: boolean; prs: { name: string; isPr: boolean; newBest: number }[] }>("/api/workouts/session", { body: payload });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["wstats"] });
      qc.invalidateQueries({ queryKey: ["whistory"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["diary"] });
      const prs = (res.prs ?? []).filter((p) => p.isPr);
      endSession();
      toast({
        title: dict.guided.saved,
        description: prs.length > 0 ? `${dict.guided.prCongrats} (${prs.map((p) => p.name).join(", ")})` : undefined,
      });
    },
    onError: (e) => {
      setSaveErr(e instanceof ApiError && e.status === 429 ? dict.errors.validation : dict.common.error);
    },
  });

  /* save current session as a reusable routine (catalog exercises only) */
  const saveRoutine = useMutation({
    mutationFn: () => {
      // weekday from the session date string (timezone-safe parse)
      const d = new Date(`${date}T12:00:00`);
      const dow = d.getDay(); // 0=Sun
      const day = dow === 0 ? 7 : dow;
      const items = loggable
        .filter((e) => !e.exerciseKey.startsWith("custom:"))
        .map((e) => ({
          exerciseKey: e.exerciseKey,
          sets: Math.max(1, e.sets.filter((s) => validSet(s.reps, s.weightKg)).length),
          reps: e.targetReps ?? e.sets.find((s) => validSet(s.reps, s.weightKg))?.reps ?? "8",
          restSec: e.restSec,
        }));
      return api("/api/workouts/routines", {
        body: { name: session?.name?.trim() || dict.guided.routines, days: [{ day, title: session?.name?.trim() || "", items }] },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routines"] });
      toast({ title: dict.guided.routineSaved });
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const routineSavable = loggable.some((e) => !e.exerciseKey.startsWith("custom:"));

  if (!session || !open) return null;

  const exCount = loggable.length;
  const totalVolume = allSets.reduce((v, s) => v + num(s.reps) * num(s.weightKg), 0);
  const sessionName = (
    <input
      value={session.name}
      onChange={(e) => patch((s) => ({ ...s, name: e.target.value.slice(0, 60) }))}
      placeholder={dict.guided.sessionNamePh}
      aria-label={dict.guided.sessionName}
      className="bg-transparent border-none outline-none focus:ring-0 text-lg font-bold w-full min-w-0 placeholder:text-muted-foreground/60 px-0"
    />
  );

  return (
    <AnimatePresence>
      <motion.div
        key="guided-overlay"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="fixed inset-0 z-[60] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        role="dialog"
        aria-modal="true"
        aria-label={dict.guided.active}
      >
        <div className="h-full max-w-2xl mx-auto flex flex-col">
          {/* Header */}
          <div className="shrink-0 border-b bg-card/60 backdrop-blur px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-xl shrink-0" aria-label="Minimize" title="Minimize">
              <Minimize2 className="h-4 w-4" aria-hidden />
            </Button>
            <div className="flex-1 min-w-0">{sessionName}</div>
            <div className="flex items-center gap-1.5 shrink-0 text-sm">
              <TimerIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="font-bold tabular-nums">{fmtElapsed(elapsedMs)}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => patch((s) => ({ ...s, keepAwake: !s.keepAwake }))}
              className={`rounded-xl shrink-0 ${keepAwake ? "text-amber-500" : "text-muted-foreground"}`}
              aria-label={dict.guided.keepAwake}
              title={dict.guided.keepAwake}
            >
              <Sun className="h-4 w-4" aria-hidden />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl shrink-0 text-destructive" aria-label={dict.guided.discard} title={dict.guided.discard}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{dict.guided.discard}</AlertDialogTitle>
                  <AlertDialogDescription>{dict.guided.discardConfirm}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => endSession()}
                  >
                    {dict.common.delete}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {step === "train" ? (
            <>
              {/* Exercise list */}
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 kai-scroll">
                {exercises.length === 0 && (
                  <div className="text-center py-12 space-y-2">
                    <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground/50" aria-hidden />
                    <p className="text-sm text-muted-foreground">{dict.guided.sub}</p>
                  </div>
                )}
                {exercises.map((ex, exIdx) => (
                  <ExerciseCard
                    key={`${ex.exerciseKey}-${exIdx}`}
                    ex={ex}
                    exIdx={exIdx}
                    dict={dict}
                    onRemove={() => removeExercise(exIdx)}
                    onAddSet={() => addSet(exIdx)}
                    onRemoveSet={(setIdx) => removeSet(exIdx, setIdx)}
                    onUpdateSet={(setIdx, field, value) => updateSet(exIdx, setIdx, field, value)}
                    onToggleSet={(setIdx) => toggleSet(exIdx, setIdx)}
                  />
                ))}
                <button
                  onClick={() => setPickerOpen(true)}
                  className="w-full rounded-2xl border-2 border-dashed py-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent/50 transition-colors flex items-center justify-center gap-2 min-h-[56px]"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {dict.guided.addExercise}
                </button>
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t bg-card/60 backdrop-blur px-4 py-3 space-y-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <AnimatePresence>
                  {rest && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
                      <RestTimer
                        rest={rest}
                        onDone={() => setRest(null)}
                        onAdd15={() => setRest((r) => (r ? { endsAt: r.endsAt + 15_000, total: r.total + 15 } : r))}
                        onSkip={() => setRest(null)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0 text-xs text-muted-foreground space-y-0.5">
                    <p className="tabular-nums">
                      {exCount} {dict.guided.exercisesDone} · {doneSets.length} {dict.guided.setsDone}
                      {totalVolume > 0 && ` · ${Math.round(totalVolume).toLocaleString()} ${dict.common.kg}`}
                    </p>
                    <p className="tabular-nums flex items-center gap-1">
                      <Flame className="h-3 w-3 text-amber-500" aria-hidden />
                      ≈ {estKcal} {dict.common.kcal}
                    </p>
                  </div>
                  <Button
                    onClick={() => setStep("summary")}
                    disabled={loggable.length === 0}
                    className="rounded-xl min-h-[44px] px-6 font-semibold shadow-sm shadow-primary/25"
                  >
                    {dict.guided.finish}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* ---------- Summary step ---------- */
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 kai-scroll">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("train")} className="rounded-lg">
                  <ArrowLeft className="h-4 w-4 mr-1" aria-hidden />
                  {dict.common.back}
                </Button>
                <h2 className="text-lg font-bold">{dict.guided.summary}</h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: dict.guided.duration, value: fmtElapsed(elapsedMs), icon: TimerIcon },
                  { label: dict.guided.exercisesDone, value: exCount, icon: Dumbbell },
                  { label: dict.guided.setsDone, value: doneSets.length, icon: Check },
                  { label: dict.guided.volume, value: `${(Math.round(totalVolume) / 1000).toFixed(1)} ${dict.guided.tonnage}`, icon: HistoryIcon },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-2xl border bg-card p-3 space-y-1">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Icon className="h-3 w-3" aria-hidden />
                      {label}
                    </p>
                    <p className="text-xl font-bold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border bg-card p-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-500" aria-hidden />
                  {dict.guided.estCalories}
                </p>
                <p className="text-lg font-bold tabular-nums">
                  ≈ {estKcal} {dict.common.kcal}
                </p>
              </div>

              {/* Live PR candidates */}
              {(() => {
                const prCandidates = exercises
                  .map((ex) => {
                    const metric = ex.sets.reduce((m, s) => Math.max(m, prMetric(s.reps, s.weightKg)), 0);
                    return { name: ex.name, metric, prev: ex.prevBest ?? null };
                  })
                  .filter((p) => p.prev != null && p.prev > 0 && p.metric > p.prev);
                if (prCandidates.length === 0) return null;
                return (
                  <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                    <p className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <Trophy className="h-4 w-4" aria-hidden />
                      {dict.guided.prNew}
                    </p>
                    <ul className="space-y-1 text-sm">
                      {prCandidates.map((p) => (
                        <li key={p.name} className="flex justify-between gap-2">
                          <span className="font-medium truncate">{p.name}</span>
                          <span className="tabular-nums text-muted-foreground shrink-0">
                            {p.prev} → <span className="font-bold text-foreground">{p.metric}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {saveErr && <p className="text-sm text-destructive">{saveErr}</p>}

              <div className="flex flex-col sm:flex-row gap-2 pt-1 pb-2">
                <Button
                  variant="outline"
                  onClick={() => saveRoutine.mutate()}
                  disabled={!routineSavable || saveRoutine.isPending}
                  className="rounded-xl flex-1 min-h-[44px]"
                >
                  {saveRoutine.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BookmarkPlus className="h-4 w-4 mr-2" aria-hidden />}
                  {dict.guided.saveRoutine}
                </Button>
                <Button
                  onClick={() => saveSession.mutate()}
                  disabled={saveSession.isPending}
                  className="rounded-xl flex-1 min-h-[44px] font-semibold shadow-sm shadow-primary/25"
                >
                  {saveSession.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden /> : null}
                  {dict.guided.save}
                </Button>
              </div>
            </div>
          )}
        </div>
        {pickerOpen && (
          <ExercisePicker open onOpenChange={setPickerOpen} onPick={addExercise} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------- */

interface ExerciseCardProps {
  ex: GuidedExerciseState;
  exIdx: number;
  dict: ReturnType<typeof useAppStore.getState>["dict"];
  onRemove: () => void;
  onAddSet: () => void;
  onRemoveSet: (setIdx: number) => void;
  onUpdateSet: (setIdx: number, field: "reps" | "weightKg" | "rir", value: string) => void;
  onToggleSet: (setIdx: number) => void;
}

function ExerciseCard({ ex, exIdx, dict, onRemove, onAddSet, onRemoveSet, onUpdateSet, onToggleSet }: ExerciseCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const lastPerf = ex.lastSets?.[0];

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="p-3 flex items-start gap-2 border-b bg-muted/30">
        <span className="text-xs font-bold text-muted-foreground tabular-nums pt-1">{exIdx + 1}.</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{ex.name}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge variant="secondary" className={`text-[10px] ${muscleBadgeClass(ex.muscle)}`}>
              {dict.guided.muscles[ex.muscle as keyof typeof dict.guided.muscles] ?? ex.muscle}
            </Badge>
            {ex.targetReps && (
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {ex.targetReps}
              </Badge>
            )}
            {ex.prevBest != null && ex.prevBest > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
                <Trophy className="h-3 w-3 text-amber-500" aria-hidden />
                {dict.guided.prevBest}: {ex.prevBest}
              </span>
            )}
            {lastPerf && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {dict.guided.lastTime}: {lastPerf.weightKg > 0 ? `${lastPerf.weightKg}${dict.common.kg}×` : ""}
                {lastPerf.reps}
              </span>
            )}
          </div>
        </div>
        {confirmRemove ? (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="destructive" size="sm" className="h-7 text-xs rounded-lg px-2" onClick={onRemove}>
              {dict.common.confirm}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg px-2" onClick={() => setConfirmRemove(false)}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setConfirmRemove(true)} className="rounded-lg h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label={dict.common.delete}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>

      {/* header row */}
      <div className="grid grid-cols-[2rem_1fr_1fr_2.6rem_2.6rem] gap-1.5 px-3 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide select-none" aria-hidden>
        <span className="text-center">#</span>
        <span>{dict.guided.weight} ({dict.common.kg})</span>
        <span>{dict.guided.reps}</span>
        <span className="text-center">{dict.guided.rir}</span>
        <span className="text-center">✓</span>
      </div>

      <div className="px-3 pb-2 space-y-1.5">
        {ex.sets.map((set, setIdx) => {
          const metric = prMetric(set.reps, set.weightKg);
          const isLivePr = ex.prevBest != null && ex.prevBest > 0 && metric > ex.prevBest;
          return (
            <div
              key={setIdx}
              className={`grid grid-cols-[2rem_1fr_1fr_2.6rem_2.6rem] gap-1.5 items-center rounded-xl transition-colors ${
                set.done ? "bg-primary/10" : isLivePr ? "bg-amber-500/10" : "hover:bg-accent/50"
              }`}
            >
              <button
                onClick={() => onRemoveSet(setIdx)}
                className="text-xs font-bold tabular-nums text-muted-foreground hover:text-destructive transition-colors min-h-[36px] w-full"
                aria-label={`${dict.guided.removeSet} ${setIdx + 1}`}
                title={dict.guided.removeSet}
              >
                {setIdx + 1}
              </button>
              <Input
                inputMode="decimal"
                value={set.weightKg}
                onChange={(e) => onUpdateSet(setIdx, "weightKg", e.target.value)}
                placeholder="0"
                aria-label={`${dict.guided.weight} — ${dict.guided.set} ${setIdx + 1}`}
                className="h-9 rounded-lg tabular-nums text-center text-sm"
              />
              <Input
                inputMode="numeric"
                value={set.reps}
                onChange={(e) => onUpdateSet(setIdx, "reps", e.target.value)}
                placeholder={ex.targetReps ?? "0"}
                aria-label={`${dict.guided.reps} — ${dict.guided.set} ${setIdx + 1}`}
                className="h-9 rounded-lg tabular-nums text-center text-sm"
              />
              <Input
                inputMode="numeric"
                value={set.rir}
                onChange={(e) => onUpdateSet(setIdx, "rir", e.target.value)}
                placeholder="–"
                title={dict.guided.rirHint}
                aria-label={`${dict.guided.rir} — ${dict.guided.set} ${setIdx + 1}`}
                className="h-9 rounded-lg tabular-nums text-center text-xs"
              />
              <button
                onClick={() => onToggleSet(setIdx)}
                aria-label={`${dict.guided.set} ${setIdx + 1} — ${set.done ? "undo" : "done"}`}
                aria-pressed={set.done}
                className={`h-9 w-9 mx-auto rounded-lg flex items-center justify-center transition-all min-h-[36px] ${
                  set.done
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                    : "border bg-background hover:bg-accent"
                } ${isLivePr && !set.done ? "ring-2 ring-amber-400" : ""}`}
              >
                {set.done ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : isLivePr ? (
                  <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
                ) : (
                  <Check className="h-4 w-4 text-muted-foreground/60" aria-hidden />
                )}
              </button>
            </div>
          );
        })}
        <button
          onClick={onAddSet}
          className="w-full rounded-xl border border-dashed py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center gap-1 min-h-[32px]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {dict.guided.addSet}
        </button>
      </div>
    </div>
  );
}
