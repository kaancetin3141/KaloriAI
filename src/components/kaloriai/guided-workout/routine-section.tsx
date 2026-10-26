"use client";

/**
 * Routines section (openGym-inspired): today's plan card, the four starter
 * templates (browse any day), and the user's saved routines.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, Play, Trash2, Layers, X, Check, Repeat, Plus, Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore, type GuidedExerciseState } from "@/stores/app-store";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ROUTINE_TEMPLATES, type RoutineTemplate, type RoutineTemplateDay } from "@/lib/routine-templates";
import { EXERCISE_MAP } from "@/lib/exercise-catalog";
import type { RoutineDTO } from "@/lib/strength";
import { RoutineEditor } from "./routine-editor";

const LEVEL_VARIANT: Record<string, string> = {
  beginner: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  intermediate: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  advanced: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

const TPL_KEY = "kaloriai_routine_tpl";

/** weekday 1=Mon..7=Sun from a YYYY-MM-DD string */
function weekdayOf(date: string): number {
  const d = new Date(`${date}T12:00:00`);
  const dow = d.getDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
}

interface Props {
  date: string;
  onStart: (name: string, exercises: GuidedExerciseState[]) => void;
}

export function RoutineSection({ date, onStart }: Props) {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const qc = useQueryClient();
  const { toast } = useToast();
  const todayDow = weekdayOf(date);

  const [selectedTpl, setSelectedTpl] = useState<string>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(TPL_KEY) || "push_pull_legs" : "push_pull_legs",
  );
  const [openTpl, setOpenTpl] = useState<string | null>(null);
  const [confirmRm, setConfirmRm] = useState<string | null>(null);
  // undefined = editor closed, null = create mode, routine = edit mode
  const [editorRoutine, setEditorRoutine] = useState<RoutineDTO | null | undefined>(undefined);

  const routinesQ = useQuery<{ routines: RoutineDTO[] }>({
    queryKey: ["routines"],
    queryFn: () => api("/api/workouts/routines"),
    staleTime: 5 * 60_000,
  });

  const deleteRoutine = useMutation({
    mutationFn: (id: string) => api(`/api/workouts/routines?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routines"] });
      toast({ title: dict.guided.routineDeleted });
      setConfirmRm(null);
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const tpl: RoutineTemplate | undefined = ROUTINE_TEMPLATES.find((t) => t.key === selectedTpl);
  const todayDay = tpl?.days.find((d) => d.day === todayDow);

  const exName = (key: string) => {
    const ex = EXERCISE_MAP[key];
    return ex ? (locale === "tr" ? ex.nameTr : ex.name) : key;
  };

  /** template day → guided exercises with planned empty set rows */
  const dayToExercises = (day: RoutineTemplateDay): GuidedExerciseState[] =>
    day.items
      .map((item) => {
        const ex = EXERCISE_MAP[item.exerciseKey];
        return {
          exerciseKey: item.exerciseKey,
          name: exName(item.exerciseKey),
          muscle: ex?.muscle ?? "core",
          equipment: ex?.equipment ?? null,
          restSec: item.restSec,
          targetReps: item.reps,
          sets: Array.from({ length: item.sets }, () => ({
            reps: "",
            weightKg: "",
            rir: "",
            done: false,
          })),
        };
      });

  const startDay = (day: RoutineTemplateDay, name: string) => {
    onStart(name, dayToExercises(day));
  };

  const chooseTpl = (key: string) => {
    setSelectedTpl(key);
    if (typeof window !== "undefined") window.localStorage.setItem(TPL_KEY, key);
  };

  /* today's plan from active template */
  const todayPlan = useMemo(() => {
    if (!tpl || !todayDay) return null;
    return { tpl, day: todayDay };
  }, [tpl, todayDay]);

  const savedRoutines = routinesQ.data?.routines ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" aria-hidden />
          {dict.guided.routines}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Today's plan */}
        {todayPlan ? (
          <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-transparent to-transparent p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" aria-hidden />
                  {dict.guided.todayPlan}
                </p>
                <p className="font-bold mt-0.5">{todayPlan.day.title}</p>
                <p className="text-xs text-muted-foreground">
                  {locale === "tr" ? todayPlan.tpl.nameTr : todayPlan.tpl.name}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => startDay(todayPlan.day, todayPlan.day.title)}
                className="rounded-xl shrink-0 font-semibold shadow-sm shadow-primary/25"
              >
                <Play className="h-3.5 w-3.5 mr-1" aria-hidden />
                {dict.guided.start}
              </Button>
            </div>
            <ul className="space-y-1">
              {todayPlan.day.items.slice(0, 5).map((item) => (
                <li key={item.exerciseKey} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 min-w-0 truncate font-medium">{exName(item.exerciseKey)}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {item.sets}×{item.reps}
                  </span>
                </li>
              ))}
              {todayPlan.day.items.length > 5 && (
                <li className="text-xs text-muted-foreground">+{todayPlan.day.items.length - 5}…</li>
              )}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
            {dict.guided.restDayTitle} 🧘
          </div>
        )}

        {/* Starter plans */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{dict.guided.starterPlans}</p>
          <div className="grid grid-cols-2 gap-2">
            {ROUTINE_TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  chooseTpl(t.key);
                  setOpenTpl(openTpl === t.key ? null : t.key);
                }}
                className={`rounded-2xl border p-3 text-left transition-all hover:shadow-md active:scale-[0.98] ${
                  selectedTpl === t.key ? "border-primary/50 bg-primary/5 ring-1 ring-primary/25" : "bg-card"
                }`}
                aria-expanded={openTpl === t.key}
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="text-sm font-semibold leading-tight">{dict.guided.templates[t.key as keyof typeof dict.guided.templates] ?? t.name}</p>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${LEVEL_VARIANT[t.level]}`}>
                    {t.daysPerWeek}d
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                  {locale === "tr" ? t.descTr : t.desc}
                </p>
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Layers className="h-3 w-3" aria-hidden />
                  {t.days.length} gün · {t.days.reduce((n, d) => n + d.items.length, 0)} egzersiz
                </div>
              </button>
            ))}
          </div>

          {/* Template day detail */}
          {tpl && openTpl === tpl.key && (
            <div className="rounded-2xl border bg-card p-3 space-y-2 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">{locale === "tr" ? tpl.nameTr : tpl.name}</p>
                <button onClick={() => setOpenTpl(null)} className="text-muted-foreground hover:text-foreground" aria-label={dict.common.close}>
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <ul className="space-y-1.5">
                {tpl.days.map((day) => (
                  <li key={day.day} className="rounded-xl bg-muted/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold">{day.title}</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 rounded-lg text-xs px-2.5 shrink-0"
                        onClick={() => startDay(day, day.title)}
                      >
                        <Play className="h-3 w-3 mr-1" aria-hidden />
                        {dict.guided.usePlan}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {day.items.map((i) => exName(i.exerciseKey)).slice(0, 4).join(" · ")}
                      {day.items.length > 4 ? " ·…" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* My routines */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">{dict.guided.myRoutines}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg text-xs px-2.5 text-primary hover:text-primary"
              onClick={() => setEditorRoutine(null)}
            >
              <Plus className="h-3.5 w-3.5 mr-0.5" aria-hidden />
              {dict.guided.editor.newTitle}
            </Button>
          </div>
          {routinesQ.isLoading ? (
            <Skeleton className="h-14 w-full rounded-xl" />
          ) : savedRoutines.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2 rounded-xl border border-dashed">
              {dict.common.emptyState}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {savedRoutines.map((r) => {
                const todayItems = r.days.find((d) => d.day === todayDow);
                return (
                  <li key={r.id} className="rounded-2xl border bg-card px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.days.length} gün ·{" "}
                          {todayItems
                            ? `${dict.guided.todayPlan}: ${todayItems.title || todayItems.items.length + " egzersiz"}`
                            : dict.guided.restDayTitle}
                        </p>
                      </div>
                      {todayItems && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 rounded-lg text-xs shrink-0"
                          onClick={() =>
                            onStart(
                              todayItems.title || r.name,
                              todayItems.items.map((item) => {
                                const ex = EXERCISE_MAP[item.exerciseKey];
                                return {
                                  exerciseKey: item.exerciseKey,
                                  name: exName(item.exerciseKey),
                                  muscle: ex?.muscle ?? "core",
                                  equipment: ex?.equipment ?? null,
                                  restSec: item.restSec,
                                  targetReps: item.reps,
                                  sets: Array.from({ length: item.sets }, () => ({
                                    reps: "",
                                    weightKg: "",
                                    rir: "",
                                    done: false,
                                  })),
                                };
                              }),
                            )
                          }
                        >
                          <Play className="h-3 w-3 mr-1" aria-hidden />
                          {dict.guided.start}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary shrink-0"
                        onClick={() => setEditorRoutine(r)}
                        aria-label={dict.guided.editor.editTitle}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      {confirmRm === r.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="destructive" size="sm" className="h-7 text-xs rounded-lg px-2" onClick={() => deleteRoutine.mutate(r.id)} disabled={deleteRoutine.isPending} aria-label={dict.common.confirm}>
                            <Check className="h-3 w-3" aria-hidden />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2" onClick={() => setConfirmRm(null)} aria-label={dict.common.cancel}>
                            <X className="h-3 w-3" aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive shrink-0" onClick={() => setConfirmRm(r.id)} aria-label={dict.common.delete}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>

      {/* Routine create/edit editor */}
      <RoutineEditor
        open={editorRoutine !== undefined}
        onOpenChange={(v) => !v && setEditorRoutine(undefined)}
        routine={editorRoutine ?? null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["routines"] })}
      />
    </Card>
  );
}
