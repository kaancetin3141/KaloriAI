"use client";

/**
 * Strength session history (openGym-style): expandable cards showing
 * exercises with their logged sets.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Trash2, Dumbbell, Flame, Timer as TimerIcon, Trophy, X, Check, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore, type GuidedExerciseState } from "@/stores/app-store";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { StrengthSessionDTO } from "@/lib/strength";
import { muscleBadgeClass } from "./exercise-picker";
import { ExerciseDetailSheet } from "./exercise-detail-sheet";

const DEFAULT_REST = 90;

export function StrengthHistory() {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const startGuidedSession = useAppStore((s) => s.startGuidedSession);
  const qc = useQueryClient();
  const { toast } = useToast();

  const historyQ = useQuery<{ sessions: StrengthSessionDTO[] }>({
    queryKey: ["whistory"],
    queryFn: () => api<{ sessions: StrengthSessionDTO[] }>("/api/workouts/session?limit=10"),
    staleTime: 60_000,
  });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ key: string; name: string } | null>(null);

  /* openGym-inspired: repeat a past workout today, sets prefilled from last time */
  const repeatSession = (s: StrengthSessionDTO) => {
    const hasSets = s.exercises.some((e) => e.sets.length > 0);
    if (!hasSets) {
      toast({ title: dict.guided.repeat.emptySets, variant: "destructive" });
      return;
    }
    const exercises: GuidedExerciseState[] = s.exercises.map((e) => ({
      exerciseKey: e.exerciseKey,
      name: e.name,
      muscle: e.muscle,
      equipment: e.equipment,
      restSec: DEFAULT_REST,
      sets: e.sets.map((st) => ({
        reps: String(st.reps),
        weightKg: String(st.weightKg),
        rir: st.rir != null ? String(st.rir) : "",
        done: false,
      })),
    }));
    startGuidedSession(s.name || "", exercises);
    toast({ title: dict.guided.repeat.ready });
  };

  const deleteSession = useMutation({
    mutationFn: (id: string) => api(`/api/workouts/session?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistory"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["wstats"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["diary"] });
      setConfirmId(null);
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const sessions = historyQ.data?.sessions ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-primary" aria-hidden />
          {dict.guided.history}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {historyQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{dict.guided.noHistory}</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => {
              const isOpen = expanded === s.id;
              const totalSets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
              const volume = s.exercises.reduce((v, e) => v + e.sets.reduce((x, st) => x + st.reps * st.weightKg, 0), 0);
              const prCount = s.exercises.reduce((n, e) => n + e.sets.filter((st) => st.pr).length, 0);
              return (
                <li key={s.id} className="rounded-2xl border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                    aria-expanded={isOpen}
                    className="w-full text-left px-3.5 py-3 hover:bg-accent/40 transition-colors flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {s.name || (s.exercises[0]?.name ? `${dict.guided.title} · ${s.exercises[0].name}` : dict.guided.title)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        <span suppressHydrationWarning>
                          {new Date(s.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <TimerIcon className="h-3 w-3" aria-hidden />
                          {s.durationMin}
                          {dict.common.min}
                        </span>
                        {totalSets > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Dumbbell className="h-3 w-3" aria-hidden />
                            {s.exercises.length}×{totalSets}
                          </span>
                        )}
                        {volume > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Flame className="h-3 w-3 text-amber-500" aria-hidden />
                            {(volume / 1000).toFixed(1)}
                            {dict.guided.tonnage}
                          </span>
                        )}
                        <span className="text-primary">{s.calories} {dict.common.kcal}</span>
                        {prCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium">
                            <Trophy className="h-3 w-3" aria-hidden />
                            {prCount} PR
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t bg-muted/20 px-3.5 py-3 space-y-3">
                      {s.exercises.map((e) => (
                        <div key={e.id}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <button
                              onClick={() => setDetail({ key: e.exerciseKey, name: e.name })}
                              className="text-xs font-semibold hover:underline underline-offset-2 decoration-primary/50 text-left"
                              aria-label={`${e.name} — ${dict.guided.detail.openHint}`}
                              title={dict.guided.detail.openHint}
                            >
                              {e.name}
                            </button>
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${muscleBadgeClass(e.muscle)}`}>
                              {dict.guided.muscles[e.muscle as keyof typeof dict.guided.muscles] ?? e.muscle}
                            </span>
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {e.sets.map((st, i) => (
                              <span
                                key={i}
                                className={`rounded-lg px-2 py-1 text-[11px] tabular-nums border ${
                                  st.pr ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-background"
                                }`}
                              >
                                <span className="text-muted-foreground">{i + 1}:</span>{" "}
                                {st.weightKg > 0 ? `${st.weightKg}${dict.common.kg} × ` : ""}
                                {st.reps}
                                {st.rir != null && <span className="text-muted-foreground"> · RIR {st.rir}</span>}
                                {st.pr && <Trophy className="inline h-3 w-3 ml-1 -mt-0.5 text-amber-500" aria-hidden />}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                      {confirmId === s.id ? (
                        <div className="flex items-center gap-2 pt-1">
                          <p className="text-xs text-muted-foreground flex-1">{dict.guided.confirmDelete}</p>
                          <Button variant="destructive" size="sm" className="h-8 rounded-lg" onClick={() => deleteSession.mutate(s.id)} disabled={deleteSession.isPending}>
                            <Check className="h-3.5 w-3.5 mr-1" aria-hidden />
                            {dict.common.confirm}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setConfirmId(null)} aria-label={dict.common.cancel}>
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => repeatSession(s)}
                            className="h-8 rounded-lg px-2.5 font-medium"
                            title={dict.guided.repeat.ready}
                          >
                            <Repeat className="h-3.5 w-3.5 mr-1" aria-hidden />
                            {dict.guided.repeat.label}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmId(s.id)}
                            className="text-destructive hover:text-destructive h-8 rounded-lg px-2 ml-auto"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" aria-hidden />
                            {dict.guided.deleteSession}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <ExerciseDetailSheet
          exerciseKey={detail?.key ?? null}
          name={detail?.name ?? ""}
          onOpenChange={(v) => {
            if (!v) setDetail(null);
          }}
        />
      </CardContent>
    </Card>
  );
}
