"use client";

/**
 * Exercise picker dialog (openGym-inspired): search + muscle/equipment filters
 * over the static catalog, plus a custom-exercise fallback.
 */
import { useMemo, useState } from "react";
import { Search, Plus, Dumbbell, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/stores/app-store";
import {
  searchExercises,
  MUSCLE_GROUPS,
  EQUIPMENT_TYPES,
  type CatalogExercise,
  type MuscleGroup,
  type EquipmentType,
} from "@/lib/exercise-catalog";

export interface PickedExercise {
  exerciseKey: string;
  name: string;
  muscle: string;
  equipment: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (ex: PickedExercise) => void;
}

const MUSCLE_COLORS: Record<string, string> = {
  chest: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  back: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  shoulders: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  biceps: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  triceps: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  quads: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  hamstrings: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  glutes: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  core: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  calves: "bg-lime-500/15 text-lime-600 dark:text-lime-400",
  forearms: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
};

export function muscleBadgeClass(muscle: string): string {
  return MUSCLE_COLORS[muscle] ?? "bg-primary/10 text-primary";
}

export function ExercisePicker({ open, onOpenChange, onPick }: Props) {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const [equipment, setEquipment] = useState<EquipmentType | "all">("all");
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup>("chest");

  const results = useMemo(
    () => searchExercises(query, muscle, equipment),
    [query, muscle, equipment],
  );

  const displayName = (ex: CatalogExercise) => (locale === "tr" ? ex.nameTr : ex.name);

  const pickCatalog = (ex: CatalogExercise) => {
    onPick({
      exerciseKey: ex.key,
      name: displayName(ex),
      muscle: ex.muscle,
      equipment: ex.equipment,
    });
    onOpenChange(false);
  };

  const pickCustom = () => {
    const name = customName.trim();
    if (!name) return;
    onPick({
      exerciseKey: `custom:${name.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`,
      name: name.slice(0, 60),
      muscle: customMuscle,
      equipment: null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Dumbbell className="h-4 w-4 text-primary" aria-hidden />
            {dict.guided.addExercise}
          </DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={dict.guided.searchEx}
              className="pl-9 min-h-[44px] rounded-xl"
              aria-label={dict.guided.searchEx}
            />
          </div>
          {/* Muscle chips */}
          <div className="flex gap-1.5 flex-wrap mt-2.5" role="group" aria-label={dict.guided.muscleFilter}>
            <button
              onClick={() => setMuscle("all")}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors min-h-[28px] ${
                muscle === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {dict.guided.all}
            </button>
            {MUSCLE_GROUPS.map((m) => (
              <button
                key={m}
                onClick={() => setMuscle(m)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors min-h-[28px] ${
                  muscle === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {dict.guided.muscles[m]}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="px-4 py-2 border-b shrink-0 flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">{dict.guided.equipmentFilter}:</span>
          <Select value={equipment} onValueChange={(v) => setEquipment(v as EquipmentType | "all")}>
            <SelectTrigger className="h-8 text-xs rounded-lg flex-1" aria-label={dict.guided.equipmentFilter}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dict.guided.all}</SelectItem>
              {EQUIPMENT_TYPES.map((eq) => (
                <SelectItem key={eq} value={eq}>
                  {dict.guided.equipment[eq]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1 min-h-0 max-h-[45vh]">
          <div className="p-2">
            {results.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">{dict.common.emptyState}</p>
            ) : (
              <ul className="space-y-1">
                {results.map((ex) => (
                  <li key={ex.key}>
                    <button
                      onClick={() => pickCatalog(ex)}
                      className="w-full text-left rounded-xl px-3 py-2.5 hover:bg-accent transition-colors group flex items-center gap-2"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate group-hover:text-accent-foreground">
                          {displayName(ex)}
                        </span>
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {ex.compound ? "★ " : ""}
                          {dict.guided.equipment[ex.equipment]}
                          {ex.secondary.length > 0
                            ? ` · ${ex.secondary.map((s) => dict.guided.muscles[s]).join(", ")}`
                            : ""}
                        </span>
                      </span>
                      <Badge variant="secondary" className={`shrink-0 text-[10px] ${muscleBadgeClass(ex.muscle)}`}>
                        {dict.guided.muscles[ex.muscle]}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>

        {/* Custom exercise */}
        <div className="p-3 border-t bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" aria-hidden />
            {dict.guided.custom}
          </p>
          <div className="flex gap-2">
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={dict.guided.customNamePh}
              className="flex-1 min-h-[40px] rounded-xl bg-background"
              aria-label={dict.guided.customName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  pickCustom();
                }
              }}
            />
            <Select value={customMuscle} onValueChange={(v) => setCustomMuscle(v as MuscleGroup)}>
              <SelectTrigger className="w-32 min-h-[40px] rounded-xl bg-background text-xs" aria-label={dict.guided.muscleFilter}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MUSCLE_GROUPS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {dict.guided.muscles[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" onClick={pickCustom} disabled={!customName.trim()} className="rounded-xl shrink-0" aria-label={dict.guided.custom}>
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
