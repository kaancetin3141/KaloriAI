"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { addDays, format, parseISO } from "date-fns";
import { enUS, tr as dfTr } from "date-fns/locale";
import {
  AlertTriangle,
  Apple,
  BookmarkPlus,
  CalendarDays,
  CalendarRange,
  ChefHat,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  CopyPlus,
  Droplets,
  Flame,
  Loader2,
  MoonStar,
  Plus,
  Repeat2,
  ScanLine,
  Sparkles,
  Trash2,
  Utensils,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlassWater } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_MEAL_TYPES, waterTargetMl, type MealType } from "@/lib/calculations";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAppStore, mealLabel as mealLabelOf } from "@/stores/app-store";
import type { DiaryResponse, LogItem, MealLog } from "@/lib/types";
import { AddFoodSheet } from "@/components/kaloriai/add-food-sheet";
import { PlannerDialog } from "@/components/kaloriai/planner-dialog";
import { RecipeDialog } from "@/components/kaloriai/recipe-dialog";
import { WeeklyPlannerDialog } from "@/components/kaloriai/weekly-planner-dialog";
import { MicronutrientsCard } from "@/components/kaloriai/micros-card";

/** Local YYYY-MM-DD */
const fmtDate = (d = new Date()) => d.toLocaleDateString("en-CA");

const macroLetters = (locale: string) =>
  locale === "tr" ? { p: "P", c: "K", f: "Y" } : { p: "P", c: "C", f: "F" };

/* ---------------- */
/* Small fragments  */
/* ---------------- */

function MacroBar({
  label,
  value,
  target,
  barClass,
}: {
  label: string;
  value: number;
  target?: number;
  barClass: string;
}) {
  const { dict } = useAppStore();
  const t = target ?? 0;
  const pct = t > 0 ? Math.min(100, Math.round((value / t) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {Math.round(value)}
          {t > 0 ? `/${t}${dict.common.g}` : ""}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cn("h-full rounded-full transition-all", barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ItemRow({ item, onEdit }: { item: LogItem; onEdit: () => void }) {
  const { dict } = useAppStore();
  const SourceIcon =
    item.source === "ai" ? Camera : item.source === "barcode" ? ScanLine : item.source === "quick_add" ? Zap : null;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="kai-pressable -mx-1 flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left"
        aria-label={`${item.name} — ${dict.common.edit}`}
      >
        {SourceIcon ? (
          <SourceIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="truncate text-sm">{item.name}</span>
        {item.grams > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {item.grams} {dict.common.g}
          </span>
        )}
      </button>
      <span className="shrink-0 text-sm font-medium tabular-nums">{Math.round(item.kcal)}</span>
      <span className="w-8 shrink-0 text-right text-[10px] text-muted-foreground">{dict.common.kcal}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-sm font-semibold tabular-nums">{Math.round(value * 10) / 10}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

/* ------------------------- */
/* Edit item dialog body    */
/* ------------------------- */

function EditItemBody({
  item,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  item: LogItem;
  onSave: (patch: { grams?: number; kcal?: number }) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const { dict, locale } = useAppStore();
  const L = macroLetters(locale);
  const isQuick = item.grams <= 0; /* quick_add items carry kcal only */
  const [value, setValue] = useState(String(isQuick ? Math.round(item.kcal) : item.grams));
  const v = Math.max(0, Number.parseFloat(value.replace(",", ".")) || 0);
  const ratio = isQuick ? (item.kcal > 0 ? v / item.kcal : 1) : item.grams > 0 ? v / item.grams : 1;
  const calc = (n: number) => Math.round(n * ratio * 10) / 10;
  const canSave = v > 0.05 && (isQuick ? v <= 10000 : v <= 5000);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="edit-value">{isQuick ? dict.diary.caloriesOnly : dict.diary.gramsInput}</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            id="edit-value"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-[44px] flex-1"
          />
          <span className="text-sm text-muted-foreground">{isQuick ? dict.common.kcal : dict.common.g}</span>
        </div>
      </div>

      {/* live recomputed macros */}
      <div className="grid grid-cols-4 gap-2 rounded-xl bg-muted/60 p-3 text-center" aria-live="polite">
        <Stat label={dict.common.kcal} value={calc(item.kcal)} />
        <Stat label={L.p} value={calc(item.protein)} />
        <Stat label={L.c} value={calc(item.carbs)} />
        <Stat label={L.f} value={calc(item.fat)} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              className="min-h-[44px] text-destructive hover:text-destructive"
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {dict.diary.deleteItem}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-xs">
            <AlertDialogHeader>
              <AlertDialogTitle>{dict.diary.deleteItem}</AlertDialogTitle>
              <AlertDialogDescription>{item.name}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {dict.common.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button
          className="min-h-[44px] flex-1"
          onClick={() => onSave(isQuick ? { kcal: v } : { grams: v })}
          disabled={!canSave || saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          {dict.common.save}
        </Button>
      </div>
    </div>
  );
}

/* -------------------- */
/* Copy target dialog   */
/* -------------------- */

function CopyBody({
  defaultDate,
  pending,
  onSubmit,
}: {
  defaultDate: string;
  pending: boolean;
  onSubmit: (targetDate: string) => void;
}) {
  const { dict } = useAppStore();
  const [target, setTarget] = useState(defaultDate);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (target) onSubmit(target);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="copy-target">{dict.diary.copyDay}</Label>
        <Input
          id="copy-target"
          type="date"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="min-h-[44px]"
        />
      </div>
      <Button type="submit" className="min-h-[44px] w-full" disabled={!target || pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
        {dict.common.save}
      </Button>
    </form>
  );
}

/* --------------- */
/* Loading state   */
/* --------------- */

function DiarySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/* -------------- */
/* DiaryScreen    */
/* -------------- */

/** Per-meal icon + tint used in diary meal headers (visual identity per meal) */
const MEAL_ICONS: Record<MealType, LucideIcon> = {
  breakfast: Coffee,
  lunch: Utensils,
  dinner: MoonStar,
  snacks: Apple,
};
const MEAL_TINT: Record<MealType, string> = {
  breakfast: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  lunch: "bg-primary/10 text-primary",
  dinner: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  snacks: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

interface LastMealInfo {
  date: string;
  kcal: number;
  itemCount: number;
}

/** One-tap "repeat your last entry for this meal" chip — shown only when the meal is empty */
function RepeatLastChip({
  mt,
  date,
  mealLabel,
  busy,
  onRepeat,
}: {
  mt: MealType;
  date: string;
  mealLabel: string;
  busy: boolean;
  onRepeat: (sourceDate: string) => void;
}) {
  const { dict, locale } = useAppStore();
  const last = useQuery({
    queryKey: ["last-meal", mt, date],
    queryFn: () => api<{ last: LastMealInfo | null }>(`/api/diary/last?before=${date}&mealType=${mt}`),
    staleTime: 60_000,
    retry: false,
  });
  const info = last.data?.last;
  if (!info) return null;

  let fromLabel = info.date;
  try {
    fromLabel = format(parseISO(info.date), "d MMMM", { locale: locale === "en" ? enUS : dfTr });
  } catch {
    /* keep raw date */
  }

  return (
    <button
      type="button"
      onClick={() => onRepeat(info.date)}
      disabled={busy}
      className="group mt-2 flex min-h-[40px] w-full items-center gap-2.5 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] px-3 py-2 text-left transition-all hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:opacity-60"
      aria-label={`${dict.diary.repeatLastAria.replace("{meal}", mealLabel)} · ${fromLabel}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Repeat2 className="h-3.5 w-3.5" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-primary">{dict.diary.repeatLast}</span>
        <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
          {dict.diary.lastFrom.replace("{date}", fromLabel)} · {info.kcal} {dict.common.kcal} ·{" "}
          {dict.diary.itemCountLabel.replace("{n}", String(info.itemCount))}
        </span>
      </span>
      <Plus
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:rotate-90 group-hover:text-primary"
        aria-hidden
      />
    </button>
  );
}


export function DiaryScreen() {
  const { dict, locale, mealNames } = useAppStore();
  const qc = useQueryClient();
  const { toast } = useToast();

  const today = useMemo(() => fmtDate(), []);
  const [date, setDate] = useState(() => fmtDate());
  const [sheetMeal, setSheetMeal] = useState<MealType | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [weekPlannerOpen, setWeekPlannerOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [copyDayOpen, setCopyDayOpen] = useState(false);
  const [copyMeal, setCopyMeal] = useState<MealType | null>(null);
  const [saveTplLog, setSaveTplLog] = useState<MealLog | null>(null);
  const [tplName, setTplName] = useState("");
  const [editItem, setEditItem] = useState<LogItem | null>(null);
  const [waterCustomOpen, setWaterCustomOpen] = useState(false);
  const [waterCustomMl, setWaterCustomMl] = useState("");

  const diary = useQuery({
    queryKey: ["diary", date],
    queryFn: () => api<DiaryResponse>(`/api/diary?date=${date}`),
  });

  const data = diary.data;
  const logs = useMemo(() => data?.logs ?? [], [data]);
  const templates = useMemo(() => data?.templates ?? [], [data]);

  const mealItems = useMemo(() => {
    const map: Record<MealType, LogItem[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const log of logs) {
      const mt = (DEFAULT_MEAL_TYPES as readonly string[]).includes(log.mealType)
        ? (log.mealType as MealType)
        : null;
      if (mt) map[mt].push(...log.items);
    }
    return map;
  }, [logs]);

  const dateLabel = useMemo(() => {
    try {
      return format(parseISO(date), "d MMMM EEEE", { locale: locale === "en" ? enUS : dfTr });
    } catch {
      return date;
    }
  }, [date, locale]);

  const mealLabel = (mt: MealType) => mealLabelOf(dict, mealNames, mt);
  const shiftDate = (days: number) => setDate(fmtDate(addDays(parseISO(date), days)));
  const invalidateDiary = () => {
    void qc.invalidateQueries({ queryKey: ["diary"] });
    void qc.invalidateQueries({ queryKey: ["summary"] });
  };

  const waterAdd = useMutation({
    mutationFn: (ml: number) => api("/api/water", { body: { deltaMl: ml, date } }),
    onSuccess: invalidateDiary,
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const copy = useMutation({
    mutationFn: (input: { mode: "meal" | "day"; mealType?: string; targetDate: string; sourceDate?: string }) =>
      api<{ ok: boolean; count: number }>("/api/diary/copy", {
        body: {
          mode: input.mode,
          sourceDate: input.sourceDate ?? date,
          targetDate: input.targetDate,
          ...(input.mealType ? { mealType: input.mealType } : {}),
        },
      }),
    onSuccess: () => {
      toast({ description: dict.diary.saved });
      invalidateDiary();
      setCopyDayOpen(false);
      setCopyMeal(null);
    },
    onError: (e: unknown) => {
      toast({
        description:
          e instanceof ApiError && e.code === "NOT_FOUND" ? dict.common.emptyState : dict.common.error,
        variant: "destructive",
      });
    },
  });

  const applyTemplate = useMutation({
    mutationFn: (templateId: string) =>
      api("/api/diary/template", { method: "PUT", body: { templateId, date } }),
    onSuccess: () => {
      toast({ description: dict.diary.saved });
      invalidateDiary();
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api(`/api/diary/template?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: invalidateDiary,
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const saveTemplate = useMutation({
    mutationFn: (input: { logId: string; name: string }) =>
      api("/api/diary/template", { body: input }),
    onSuccess: () => {
      toast({ description: dict.diary.saved });
      invalidateDiary();
      setSaveTplLog(null);
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const patchItem = useMutation({
    mutationFn: (input: { id: string; grams?: number; kcal?: number }) =>
      api("/api/diary/item", { method: "PATCH", body: input }),
    onSuccess: () => {
      toast({ description: dict.diary.saved });
      invalidateDiary();
      setEditItem(null);
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api(`/api/diary/item?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ description: dict.common.delete });
      invalidateDiary();
      setEditItem(null);
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  if (diary.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
          <p className="text-sm text-muted-foreground">{dict.errors.network}</p>
          <Button onClick={() => void diary.refetch()} className="min-h-[44px]">
            {dict.common.retry}
          </Button>
        </Card>
      </div>
    );
  }

  if (diary.isPending || !data) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <DiarySkeleton />
      </div>
    );
  }

  const totals = data.totals;
  const targets = data.targets;
  const kcalTarget = targets?.calories ?? 0;
  const kcalPct = kcalTarget > 0 ? Math.min(100, Math.round((totals.kcal / kcalTarget) * 100)) : 0;
  const remaining = kcalTarget - totals.kcal;
  const waterTarget = waterTargetMl(data.profile?.weightKg);
  const waterPct = waterTarget > 0 ? Math.min(100, Math.round((data.waterMl / waterTarget) * 100)) : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {/* ---------- Header ---------- */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">{dict.diary.title}</h1>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setCopyDayOpen(true)}
            aria-label={dict.diary.copyDay}
          >
            <CopyPlus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{dict.diary.copyDay}</span>
          </Button>
        </div>
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => shiftDate(-1)}
            aria-label={dict.common.back}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col items-center py-0.5 leading-tight">
            <span className="truncate text-sm font-semibold">{dateLabel}</span>
            {date === today ? (
              <span className="text-[11px] text-muted-foreground">{dict.common.today}</span>
            ) : (
              <button
                type="button"
                onClick={() => setDate(today)}
                className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
              >
                {dict.common.today}
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => shiftDate(1)}
            aria-label={dict.common.next}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      </header>

      {/* ---------- Totals ---------- */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Card className="kai-card-hover p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{dict.today.calorieBudget}</p>
              <p className="text-2xl font-bold tabular-nums">
                {totals.kcal}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {kcalTarget} {dict.common.kcal}
                </span>
              </p>
            </div>
            <Badge
              variant={remaining >= 0 ? "secondary" : "outline"}
              className={cn(
                remaining < 0 && "border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400"
              )}
            >
              {remaining >= 0
                ? `${dict.common.remaining} ${remaining}`
                : `+${Math.abs(remaining)} ${dict.today.over}`}
            </Badge>
          </div>
          <Progress value={kcalPct} className="mt-3 h-2.5" aria-label={dict.today.calorieBudget} />
          {data.burned > 0 && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-amber-500" aria-hidden />
              {dict.today.burned}: {data.burned} {dict.common.kcal}
            </p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <MacroBar label={dict.onboarding.protein} value={totals.protein} target={targets?.protein} barClass="bg-primary" />
            <MacroBar label={dict.onboarding.carbs} value={totals.carbs} target={targets?.carbs} barClass="bg-amber-400" />
            <MacroBar label={dict.onboarding.fat} value={totals.fat} target={targets?.fat} barClass="bg-rose-400" />
          </div>
        </Card>
      </motion.section>

      {/* ---------- Micronutrients ---------- */}
      <MicronutrientsCard totals={totals} targets={targets} index={1} />

      {/* ---------- Water ---------- */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
      >
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Droplets className="h-4.5 w-4.5 text-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium">{dict.today.water}</span>
              <span className="text-muted-foreground tabular-nums">
                {data.waterMl} / {waterTarget} {dict.common.ml}
              </span>
            </div>
            <Progress value={waterPct} className="mt-1.5 h-2" aria-label={dict.today.water} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px] shrink-0"
              onClick={() => waterAdd.mutate(250)}
              disabled={waterAdd.isPending}
              aria-label={dict.today.addWater}
            >
              {waterAdd.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              250
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px] shrink-0 px-2"
                  aria-label={dict.today.waterCustom}
                >
                  <GlassWater className="h-4 w-4 text-primary" aria-hidden />
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {[200, 330, 500].map((ml) => (
                  <DropdownMenuItem key={ml} onClick={() => waterAdd.mutate(ml)} className="min-h-[44px]">
                    <GlassWater className="h-4 w-4 text-primary" aria-hidden />
                    {ml === 200
                      ? dict.today.waterGlass
                      : ml === 330
                        ? dict.today.waterSmallBottle
                        : dict.today.waterBottle}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={() => {
                    setWaterCustomMl("");
                    setWaterCustomOpen(true);
                  }}
                  className="min-h-[44px]"
                >
                  <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {dict.today.waterCustom}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Card>
      </motion.section>

      {/* ---------- Planner + Recipes entries ---------- */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant="outline"
          className="h-12 justify-between px-4 transition-all hover:shadow-sm active:scale-[0.98]"
          onClick={() => setPlannerOpen(true)}
          aria-label={dict.planner.title}
        >
          <span className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" aria-hidden />
            {dict.planner.title}
          </span>
          <Badge
            variant="outline"
            className="gap-1 border-amber-400/40 bg-amber-400/10 text-[10px] text-amber-600 dark:text-amber-400"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            Premium
          </Badge>
        </Button>
        <Button
          variant="outline"
          className="h-12 justify-between px-4 transition-all hover:shadow-sm active:scale-[0.98]"
          onClick={() => setWeekPlannerOpen(true)}
          aria-label={dict.planner.weekView}
        >
          <span className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
            {dict.planner.weekView}
          </span>
          <Badge
            variant="outline"
            className="gap-1 border-amber-400/40 bg-amber-400/10 text-[10px] text-amber-600 dark:text-amber-400"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            Premium
          </Badge>
        </Button>
        <Button
          variant="outline"
          className="h-12 justify-between px-4 transition-all hover:shadow-sm active:scale-[0.98]"
          onClick={() => setRecipesOpen(true)}
          aria-label={dict.diary.recipes}
        >
          <span className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" aria-hidden />
            {dict.diary.recipes}
          </span>
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {dict.common.add}
          </Badge>
        </Button>
      </div>

      {/* ---------- Meals ---------- */}
      {DEFAULT_MEAL_TYPES.map((mt, idx) => {
        const items = mealItems[mt];
        const kcal = Math.round(items.reduce((a, i) => a + i.kcal, 0));
        const logsForMeal = logs.filter((l) => l.mealType === mt);
        const biggestLog = [...logsForMeal].sort((a, b) => b.items.length - a.items.length)[0];
        const canSaveTemplate = templates.length === 0 && items.length > 0 && Boolean(biggestLog);

        return (
          <motion.section
            key={mt}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 * Math.min(idx, 2) }}
          >
            <Card className="kai-card-hover p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${MEAL_TINT[mt]}`}
                    aria-hidden
                  >
                    {(() => {
                      const MealIcon = MEAL_ICONS[mt];
                      return <MealIcon className="h-4 w-4" />;
                    })()}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{mealLabel(mt)}</h3>
                    <p className="text-xs text-muted-foreground">
                      {items.length > 0
                        ? `${items.length} · ${kcal} ${dict.common.kcal}`
                        : dict.common.emptyState}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canSaveTemplate && biggestLog && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={dict.diary.saveTemplate}
                      onClick={() => {
                        setTplName("");
                        setSaveTplLog(biggestLog);
                      }}
                    >
                      <BookmarkPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Button>
                  )}
                  {items.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={dict.diary.copyMeal}
                      onClick={() => setCopyMeal(mt)}
                    >
                      <CopyPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    aria-label={`${dict.common.add} — ${mealLabel(mt)}`}
                    onClick={() => setSheetMeal(mt)}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>

              {items.length === 0 && (
                <RepeatLastChip
                  mt={mt}
                  date={date}
                  mealLabel={mealLabel(mt)}
                  busy={copy.isPending && copy.variables?.mealType === mt}
                  onRepeat={(sourceDate) =>
                    copy.mutate({ mode: "meal", mealType: mt, targetDate: date, sourceDate })
                  }
                />
              )}

              {items.length > 0 && (
                <div className="kai-scroll mt-2 max-h-96 divide-y overflow-y-auto">
                  {items.map((item) => (
                    <ItemRow key={item.id} item={item} onEdit={() => setEditItem(item)} />
                  ))}
                </div>
              )}
            </Card>
          </motion.section>
        );
      })}

      {/* ---------- Templates ---------- */}
      {templates.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BookmarkPlus className="h-4 w-4 text-primary" aria-hidden />
              {dict.diary.templates}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {templates.map((tpl) => {
                const tplKcal = Math.round(tpl.items.reduce((a, i) => a + i.kcal, 0));
                return (
                  <div key={tpl.id} className="flex items-center gap-1 rounded-full border bg-card py-0.5 pl-3 pr-1">
                    <button
                      type="button"
                      onClick={() => applyTemplate.mutate(tpl.id)}
                      disabled={applyTemplate.isPending}
                      className="min-h-[36px] text-sm"
                      aria-label={`${dict.diary.applyTemplate} — ${tpl.name}`}
                    >
                      {tpl.name}
                      <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                        {tplKcal} {dict.common.kcal}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      aria-label={`${dict.common.delete} — ${tpl.name}`}
                      onClick={() => deleteTemplate.mutate(tpl.id)}
                      disabled={deleteTemplate.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{dict.diary.applyTemplate}</p>
          </Card>
        </motion.section>
      )}

      {/* ---------- Water custom dialog ---------- */}
      <Dialog open={waterCustomOpen} onOpenChange={setWaterCustomOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{dict.today.waterCustomTitle}</DialogTitle>
            <DialogDescription className="sr-only">{dict.today.water}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const ml = Math.round(Number.parseFloat(waterCustomMl.replace(",", ".")) || 0);
              if (ml >= 50 && ml <= 3000) {
                waterAdd.mutate(ml);
                setWaterCustomOpen(false);
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="water-custom-ml">{dict.today.waterAmount}</Label>
              <Input
                id="water-custom-ml"
                inputMode="numeric"
                value={waterCustomMl}
                onChange={(e) => setWaterCustomMl(e.target.value)}
                placeholder="300"
                autoFocus
                className="min-h-[44px]"
              />
            </div>
            <Button
              type="submit"
              className="min-h-[44px] w-full"
              disabled={
                !(Number.parseFloat(waterCustomMl.replace(",", ".")) >= 50 && Number.parseFloat(waterCustomMl.replace(",", ".")) <= 3000) ||
                waterAdd.isPending
              }
            >
              <Plus className="h-4 w-4" aria-hidden />
              {dict.common.add}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- Edit item dialog ---------- */}
      <Dialog
        open={editItem !== null}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{editItem?.name}</DialogTitle>
            <DialogDescription className="sr-only">{dict.diary.title}</DialogDescription>
          </DialogHeader>
          {editItem && (
            <EditItemBody
              item={editItem}
              saving={patchItem.isPending}
              deleting={deleteItem.isPending}
              onSave={(patch) => patchItem.mutate({ id: editItem.id, ...patch })}
              onDelete={() => deleteItem.mutate(editItem.id)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Copy day / meal dialog ---------- */}
      <Dialog
        open={copyDayOpen || copyMeal !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCopyDayOpen(false);
            setCopyMeal(null);
          }
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{copyMeal ? dict.diary.copyMeal : dict.diary.copyDay}</DialogTitle>
            <DialogDescription>
              {dateLabel}
              {copyMeal ? ` · ${mealLabel(copyMeal)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <CopyBody
            defaultDate={fmtDate(addDays(parseISO(date), 1))}
            pending={copy.isPending}
            onSubmit={(targetDate) =>
              copy.mutate({
                mode: copyMeal ? "meal" : "day",
                mealType: copyMeal ?? undefined,
                targetDate,
              })
            }
          />
        </DialogContent>
      </Dialog>

      {/* ---------- Save template dialog ---------- */}
      <Dialog
        open={saveTplLog !== null}
        onOpenChange={(o) => {
          if (!o) setSaveTplLog(null);
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{dict.diary.saveTemplate}</DialogTitle>
            <DialogDescription>
              {saveTplLog ? mealLabel((saveTplLog.mealType as MealType) ?? "snacks") : ""}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (saveTplLog && tplName.trim()) {
                saveTemplate.mutate({ logId: saveTplLog.id, name: tplName.trim() });
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name" className="sr-only">
                {dict.diary.saveTemplate}
              </Label>
              <Input
                id="tpl-name"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder={dict.diary.foodName}
                maxLength={80}
                className="min-h-[44px]"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="min-h-[44px] w-full"
              disabled={!tplName.trim() || saveTemplate.isPending}
            >
              {saveTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              {dict.common.save}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- Sheets & dialogs ---------- */}
      <AddFoodSheet
        open={sheetMeal !== null}
        onClose={() => setSheetMeal(null)}
        date={date}
        mealType={sheetMeal ?? "breakfast"}
      />
      <PlannerDialog open={plannerOpen} onClose={() => setPlannerOpen(false)} />
      <WeeklyPlannerDialog open={weekPlannerOpen} onClose={() => setWeekPlannerOpen(false)} />
      <RecipeDialog open={recipesOpen} onClose={() => setRecipesOpen(false)} date={date} mealType={sheetMeal ?? "snacks"} />
    </div>
  );
}
