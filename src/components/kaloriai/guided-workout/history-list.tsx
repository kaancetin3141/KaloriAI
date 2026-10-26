"use client";

/**
 * Strength session history (openGym-style): expandable cards showing
 * exercises with their logged sets. Saved sessions can be edited inline
 * (sets/name/duration/date) via PATCH /api/workouts/session.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Trash2, Dumbbell, Flame, Timer as TimerIcon, Trophy, X, Check, Repeat, Pencil, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore, type GuidedExerciseState } from "@/stores/app-store";
import { api } from "@/lib/api";
import { appToday } from "@/lib/tz";
import { useToast } from "@/hooks/use-toast";
import type { StrengthSessionDTO } from "@/lib/strength";
import { muscleBadgeClass } from "./exercise-picker";
import { ExerciseDetailSheet } from "./exercise-detail-sheet";

const DEFAULT_REST = 90;
const MAX_SETS_PER_EXERCISE = 20; // mirrors API zod (exerciseSchema.sets.max)

const num = (v: string): number => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/* Edit-mode draft: every field as string for the compact inputs */
type EditSetDraft = { reps: string; weightKg: string; rir: string };
type EditExerciseDraft = {
  id: string;
  exerciseKey: string;
  name: string;
  muscle: string;
  equipment: string | null;
  sets: EditSetDraft[];
};
type EditDraft = { name: string; durationMin: string; date: string; exercises: EditExerciseDraft[] };

type PatchSessionBody = {
  id: string;
  name: string | null;
  durationMin: number;
  date?: string;
  exercises: {
    exerciseKey: string;
    name: string;
    muscle: string;
    equipment: string | null;
    sets: { reps: number; weightKg: number; rir?: number }[];
  }[];
};

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  /* openGym-inspired: fix mistakes in a saved session (sets/name/duration/date) */
  const startEdit = (s: StrengthSessionDTO) => {
    setConfirmId(null);
    setEditingId(s.id);
    setEditDraft({
      name: s.name ?? "",
      durationMin: String(s.durationMin),
      date: s.date,
      exercises: s.exercises.map((e) => ({
        id: e.id,
        exerciseKey: e.exerciseKey,
        name: e.name,
        muscle: e.muscle,
        equipment: e.equipment,
        sets: e.sets.map((st) => ({
          reps: String(st.reps),
          weightKg: st.weightKg > 0 ? String(st.weightKg) : "",
          rir: st.rir != null ? String(st.rir) : "",
        })),
      })),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const updDraftSet = (exIdx: number, setIdx: number, field: keyof EditSetDraft, value: string) => {
    setEditDraft((d) => {
      if (!d) return d;
      const exercises = d.exercises.map((e, i) => {
        if (i !== exIdx) return e;
        const sets = e.sets.map((st, si) => {
          if (si !== setIdx) return st;
          const next: EditSetDraft =
            field === "reps"
              ? { ...st, reps: value }
              : field === "weightKg"
                ? { ...st, weightKg: value }
                : { ...st, rir: value };
          return next;
        });
        return { ...e, sets };
      });
      return { ...d, exercises };
    });
  };

  const removeDraftSet = (exIdx: number, setIdx: number) => {
    setEditDraft((d) => {
      if (!d) return d;
      const exercises = d.exercises.map((e, i) =>
        i === exIdx ? { ...e, sets: e.sets.filter((_, si) => si !== setIdx) } : e,
      );
      return { ...d, exercises };
    });
  };

  /* add a set copying the last one's values (openGym-style quick add) */
  const addDraftSet = (exIdx: number) => {
    setEditDraft((d) => {
      if (!d) return d;
      const exercises = d.exercises.map((e, i) => {
        if (i !== exIdx || e.sets.length >= MAX_SETS_PER_EXERCISE) return e;
        const last = e.sets[e.sets.length - 1];
        const next: EditSetDraft = last ? { ...last } : { reps: "", weightKg: "", rir: "" };
        return { ...e, sets: [...e.sets, next] };
      });
      return { ...d, exercises };
    });
  };

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

  const saveEdit = useMutation({
    mutationFn: (body: PatchSessionBody) => api("/api/workouts/session", { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistory"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["wstats"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["diary"] });
      toast({ title: dict.guided.edit.updated });
      cancelEdit();
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const onSaveEdit = (s: StrengthSessionDTO) => {
    if (!editDraft) return;
    if (editDraft.date && editDraft.date > appToday()) {
      toast({ title: dict.guided.edit.futureDate, variant: "destructive" });
      return;
    }
    // any filled-in reps that is ≤0 / garbage → user must fix or delete that row
    for (const e of editDraft.exercises) {
      for (const st of e.sets) {
        if (st.reps.trim() === "") continue;
        const reps = num(st.reps);
        if (!Number.isFinite(reps) || reps <= 0) {
          toast({ title: dict.guided.edit.invalid, variant: "destructive" });
          return;
        }
      }
    }
    // only sets with reps > 0 are sent; exercises without any valid set drop out
    const exercises = editDraft.exercises
      .map((e) => {
        const sets = e.sets
          .map((st) => {
            const r = num(st.reps);
            const w = num(st.weightKg);
            const rir = num(st.rir);
            return {
              reps: Math.round(Number.isFinite(r) ? r : 0) || 0,
              weightKg: Math.max(0, Math.round((Number.isFinite(w) ? w : 0) * 10) / 10),
              ...(st.rir.trim() !== "" && Number.isFinite(rir) ? { rir: Math.max(0, Math.min(10, Math.round(rir))) } : {}),
            };
          })
          .filter((st) => st.reps > 0);
        return {
          exerciseKey: e.exerciseKey,
          name: e.name,
          muscle: e.muscle,
          equipment: e.equipment,
          sets,
        };
      })
      .filter((e) => e.sets.length > 0);
    if (exercises.length === 0) {
      toast({ title: dict.guided.edit.emptySets, variant: "destructive" });
      return;
    }
    const duration = num(editDraft.durationMin);
    const durationMin = Math.min(
      600,
      Math.max(1, Math.round(Number.isFinite(duration) && duration >= 1 ? duration : s.durationMin)),
    );
    saveEdit.mutate({
      id: s.id,
      name: editDraft.name.trim() || null,
      durationMin,
      ...(editDraft.date ? { date: editDraft.date } : {}),
      exercises,
    });
  };

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
                      {editingId === s.id && editDraft ? (
                        <>
                          <div>
                            <p className="text-xs font-semibold">{dict.guided.edit.title}</p>
                            <p className="text-[11px] text-muted-foreground">{dict.guided.edit.hint}</p>
                          </div>
                          <div className="grid gap-1.5">
                            <Input
                              value={editDraft.name}
                              onChange={(e) => setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                              placeholder={dict.guided.edit.name}
                              aria-label={dict.guided.edit.name}
                              maxLength={80}
                              className="h-8 rounded-lg text-sm"
                            />
                            <div className="grid grid-cols-2 gap-1.5">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={600}
                                value={editDraft.durationMin}
                                onChange={(e) => setEditDraft((d) => (d ? { ...d, durationMin: e.target.value } : d))}
                                placeholder={dict.guided.edit.duration}
                                aria-label={dict.guided.edit.duration}
                                className="h-8 rounded-lg tabular-nums text-sm"
                              />
                              <Input
                                type="date"
                                max={appToday()}
                                value={editDraft.date}
                                onChange={(e) => setEditDraft((d) => (d ? { ...d, date: e.target.value } : d))}
                                aria-label={dict.guided.edit.date}
                                className="h-8 rounded-lg text-sm"
                                suppressHydrationWarning
                              />
                            </div>
                          </div>
                          {editDraft.exercises.map((e, exIdx) => (
                            <div key={e.id} className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold truncate">{e.name}</span>
                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium shrink-0 ${muscleBadgeClass(e.muscle)}`}>
                                  {dict.guided.muscles[e.muscle as keyof typeof dict.guided.muscles] ?? e.muscle}
                                </span>
                              </div>
                              {e.sets.map((st, setIdx) => (
                                <div key={setIdx} className="flex items-center gap-1">
                                  <span className="w-4 text-center text-[11px] font-bold tabular-nums text-muted-foreground shrink-0">
                                    {setIdx + 1}
                                  </span>
                                  <Input
                                    inputMode="decimal"
                                    value={st.weightKg}
                                    onChange={(ev) => updDraftSet(exIdx, setIdx, "weightKg", ev.target.value)}
                                    placeholder="0"
                                    aria-label={`${dict.guided.weight} — ${dict.guided.set} ${setIdx + 1}`}
                                    className="h-8 w-16 rounded-lg tabular-nums text-center text-sm"
                                  />
                                  <span className="text-[10px] text-muted-foreground shrink-0">{dict.common.kg}</span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">×</span>
                                  <Input
                                    inputMode="numeric"
                                    value={st.reps}
                                    onChange={(ev) => updDraftSet(exIdx, setIdx, "reps", ev.target.value)}
                                    placeholder="0"
                                    aria-label={`${dict.guided.reps} — ${dict.guided.set} ${setIdx + 1}`}
                                    className="h-8 w-14 rounded-lg tabular-nums text-center text-sm"
                                  />
                                  <span className="text-[10px] text-muted-foreground shrink-0">RIR</span>
                                  <Input
                                    inputMode="numeric"
                                    value={st.rir}
                                    onChange={(ev) => updDraftSet(exIdx, setIdx, "rir", ev.target.value)}
                                    placeholder="–"
                                    title={dict.guided.rirHint}
                                    aria-label={`${dict.guided.rir} — ${dict.guided.set} ${setIdx + 1}`}
                                    className="h-8 w-10 rounded-lg tabular-nums text-center text-xs"
                                  />
                                  <button
                                    onClick={() => removeDraftSet(exIdx, setIdx)}
                                    aria-label={`${dict.guided.removeSet} ${setIdx + 1}`}
                                    title={dict.guided.removeSet}
                                    className="h-8 w-7 mx-auto rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                  >
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addDraftSet(exIdx)}
                                disabled={e.sets.length >= MAX_SETS_PER_EXERCISE}
                                className="h-7 rounded-lg px-2 text-xs font-medium"
                              >
                                <Plus className="h-3 w-3 mr-0.5" aria-hidden />
                                {dict.guided.addSet}
                              </Button>
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              onClick={() => onSaveEdit(s)}
                              disabled={saveEdit.isPending}
                              className="h-8 rounded-lg px-3 font-medium"
                            >
                              <Check className="h-3.5 w-3.5 mr-1" aria-hidden />
                              {dict.guided.edit.save}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={cancelEdit}
                              className="h-8 rounded-lg px-3 font-medium"
                            >
                              {dict.common.cancel}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
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
                            <div className="flex items-center gap-2 pt-1 flex-wrap">
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
                                variant="outline"
                                size="sm"
                                onClick={() => startEdit(s)}
                                className="h-8 rounded-lg px-2.5 font-medium"
                                title={dict.guided.edit.title}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" aria-hidden />
                                {dict.guided.edit.label}
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
                        </>
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
