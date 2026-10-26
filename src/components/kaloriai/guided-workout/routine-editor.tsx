"use client";

/**
 * Routine editor (openGym-inspired): build & edit custom multi-day weekly
 * routines. Bottom sheet — create mode (routine=null) or edit mode (prefilled).
 * Form state lives in an inner component keyed by routine id so opening a
 * different routine always starts from a fresh prefill.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, Plus, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { EXERCISE_MAP } from "@/lib/exercise-catalog";
import type { RoutineDTO, RoutineDay, RoutineItem } from "@/lib/strength";
import { ExercisePicker, type PickedExercise } from "./exercise-picker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  routine?: RoutineDTO | null;
  onSaved?: () => void;
}

export function RoutineEditor({ open, onOpenChange, routine, onSaved }: Props) {
  const dict = useAppStore((s) => s.dict);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="h-[90vh] max-h-[90vh] p-0 rounded-t-3xl sm:max-w-lg sm:mx-auto sm:rounded-3xl sm:border flex flex-col"
      >
        <SheetHeader className="p-4 pb-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
            {routine ? dict.guided.editor.editTitle : dict.guided.editor.newTitle}
          </SheetTitle>
        </SheetHeader>
        {open && (
          <RoutineForm
            key={routine?.id ?? "new"}
            routine={routine ?? null}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

function RoutineForm({
  routine,
  onOpenChange,
  onSaved,
}: {
  routine: RoutineDTO | null;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const qc = useQueryClient();
  const { toast } = useToast();

  const isEdit = !!routine;
  const [name, setName] = useState(routine?.name ?? "");
  const [notes, setNotes] = useState(routine?.notes ?? "");
  const [days, setDays] = useState<RoutineDay[]>(() =>
    (routine?.days ?? []).map((d) => ({
      day: d.day,
      title: d.title,
      items: d.items.map((i) => ({ ...i })),
    })),
  );
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  const exName = (key: string) => {
    const ex = EXERCISE_MAP[key];
    if (ex) return locale === "tr" ? ex.nameTr : ex.name;
    if (key.startsWith("custom:")) return key.slice("custom:".length).replace(/_/g, " ");
    return key;
  };

  const toggleDay = (day: number) => {
    setDays((prev) =>
      prev.some((d) => d.day === day)
        ? prev.filter((d) => d.day !== day)
        : [...prev, { day, title: "", items: [] }].sort((a, b) => a.day - b.day),
    );
  };

  const setDayTitle = (day: number, title: string) => {
    setDays((prev) => prev.map((d) => (d.day === day ? { ...d, title: title.slice(0, 60) } : d)));
  };

  const updateItem = (day: number, idx: number, patch: Partial<RoutineItem>) => {
    setDays((prev) =>
      prev.map((d) =>
        d.day === day
          ? { ...d, items: d.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }
          : d,
      ),
    );
  };

  const removeItem = (day: number, idx: number) => {
    setDays((prev) =>
      prev.map((d) => (d.day === day ? { ...d, items: d.items.filter((_, i) => i !== idx) } : d)),
    );
  };

  const addItem = (day: number, picked: PickedExercise) => {
    setDays((prev) =>
      prev.map((d) =>
        d.day === day
          ? {
              ...d,
              items: [
                ...d.items,
                { exerciseKey: picked.exerciseKey, sets: 3, reps: "8-12", restSec: 90 },
              ],
            }
          : d,
      ),
    );
    setPickerFor(null);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        notes: notes.trim() || null,
        days: days.map((d) => ({
          day: d.day,
          title: d.title.trim(),
          items: d.items.map((it) => ({
            exerciseKey: it.exerciseKey,
            sets: it.sets,
            reps: it.reps.trim(),
            restSec: it.restSec,
          })),
        })),
      };
      if (isEdit && routine) {
        return api<{ ok: true }>("/api/workouts/routines", {
          method: "PUT",
          body: { id: routine.id, ...payload },
        });
      }
      return api<{ ok: true }>("/api/workouts/routines", { body: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routines"] });
      toast({ title: isEdit ? dict.guided.editor.updated : dict.guided.routineSaved });
      onSaved?.();
      onOpenChange(false);
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const onSave = () => {
    if (save.isPending) return;
    if (!name.trim()) {
      toast({ title: dict.guided.editor.needName, variant: "destructive" });
      return;
    }
    if (days.length === 0 || days.some((d) => d.items.length === 0)) {
      toast({ title: dict.guided.editor.needDay, variant: "destructive" });
      return;
    }
    save.mutate();
  };

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto kai-scroll p-4 space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <label htmlFor="routine-name" className="text-xs font-medium text-muted-foreground">
            {dict.guided.editor.name}
          </label>
          <Input
            id="routine-name"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            maxLength={60}
            placeholder={dict.guided.editor.namePh}
            className="min-h-[44px] rounded-xl"
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label htmlFor="routine-notes" className="text-xs font-medium text-muted-foreground">
            {dict.guided.editor.notes}
          </label>
          <Textarea
            id="routine-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 300))}
            maxLength={300}
            placeholder={dict.guided.editor.notesPh}
            className="min-h-[72px] rounded-xl text-sm"
          />
        </div>

        {/* Weekday selector */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{dict.guided.editor.days}</p>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label={dict.guided.editor.days}>
            {dict.guided.editor.weekdays.map((label, i) => {
              const dayNo = i + 1;
              const active = days.some((d) => d.day === dayNo);
              return (
                <button
                  key={dayNo}
                  type="button"
                  onClick={() => toggleDay(dayNo)}
                  aria-pressed={active}
                  className={`rounded-xl py-1.5 min-h-[38px] text-[11px] font-semibold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day cards */}
        {days.map((d) => (
          <div key={d.day} className="rounded-2xl border bg-card p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-bold shrink-0">
                {dict.guided.editor.weekdays[d.day - 1]}
              </span>
              <Input
                value={d.title}
                onChange={(e) => setDayTitle(d.day, e.target.value)}
                maxLength={60}
                placeholder={dict.guided.editor.dayNamePh}
                aria-label={dict.guided.editor.dayName}
                className="flex-1 min-w-0 h-9 rounded-lg text-xs"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => toggleDay(d.day)}
                aria-label={dict.guided.editor.removeDay}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>

            {d.items.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-2 rounded-xl border border-dashed">
                {dict.guided.editor.needDay}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {d.items.map((it, idx) => (
                  <li
                    key={`${it.exerciseKey}-${idx}`}
                    className="rounded-xl bg-muted/40 px-2.5 py-2 space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 min-w-0 text-xs font-medium truncate">
                        {exName(it.exerciseKey)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(d.day, idx)}
                        className="text-muted-foreground hover:text-destructive shrink-0 p-1 rounded-md"
                        aria-label={dict.guided.editor.removeItem}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    <div className="flex items-end gap-1.5">
                      {/* sets stepper */}
                      <div className="shrink-0">
                        <p className="text-[9px] text-muted-foreground text-center leading-none mb-1">
                          {dict.guided.editor.sets}
                        </p>
                        <div className="flex items-center h-8 rounded-lg border bg-background overflow-hidden">
                          <button
                            type="button"
                            onClick={() => updateItem(d.day, idx, { sets: Math.max(1, it.sets - 1) })}
                            className="h-full w-7 flex items-center justify-center text-muted-foreground hover:bg-accent active:bg-accent/60 text-base leading-none"
                            aria-label="-"
                          >
                            −
                          </button>
                          <span className="min-w-[22px] text-center text-xs font-semibold tabular-nums">
                            {it.sets}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateItem(d.day, idx, { sets: Math.min(10, it.sets + 1) })}
                            className="h-full w-7 flex items-center justify-center text-muted-foreground hover:bg-accent active:bg-accent/60 text-base leading-none"
                            aria-label="+"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {/* reps */}
                      <label className="flex-1 min-w-0 block">
                        <span className="block text-[9px] text-muted-foreground leading-none mb-1">
                          {dict.guided.editor.reps}
                        </span>
                        <Input
                          value={it.reps}
                          onChange={(e) => updateItem(d.day, idx, { reps: e.target.value.slice(0, 12) })}
                          onBlur={() => !it.reps.trim() && updateItem(d.day, idx, { reps: "8-12" })}
                          maxLength={12}
                          placeholder="8-12"
                          aria-label={dict.guided.editor.reps}
                          className="h-8 rounded-lg text-xs"
                        />
                      </label>
                      {/* rest */}
                      <label className="flex-1 min-w-0 block">
                        <span className="block text-[9px] text-muted-foreground leading-none mb-1 truncate">
                          {dict.guided.editor.rest}
                        </span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={it.restSec}
                          onChange={(e) =>
                            updateItem(d.day, idx, {
                              restSec: Math.max(0, Math.min(900, Math.round(Number(e.target.value)) || 0)),
                            })
                          }
                          min={0}
                          max={900}
                          aria-label={dict.guided.editor.rest}
                          className="h-8 rounded-lg text-xs tabular-nums"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 rounded-lg text-xs"
              onClick={() => setPickerFor(d.day)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden />
              {dict.guided.editor.addExercise}
            </Button>
          </div>
        ))}
      </div>

      {/* Save */}
      <div className="p-3 border-t shrink-0 bg-background">
        <Button
          className="w-full min-h-[44px] rounded-xl font-semibold shadow-sm shadow-primary/25"
          onClick={onSave}
          disabled={save.isPending}
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {dict.guided.editor.save}
        </Button>
      </div>

      <ExercisePicker
        open={pickerFor !== null}
        onOpenChange={(v) => !v && setPickerFor(null)}
        onPick={(picked) => {
          if (pickerFor !== null) addItem(pickerFor, picked);
        }}
      />
    </>
  );
}
