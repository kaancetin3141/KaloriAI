"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { APP_TZ } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type { CalendarDay, CalendarResponse } from "@/lib/types";

/* ---------------- */
/* Pure helpers     */
/* ---------------- */

/** "YYYY-MM" of a "YYYY-MM-DD" string. */
const monthOf = (dateStr: string): string => dateStr.slice(0, 7);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "YYYY-MM" ± n months (pure UTC calendar math, never host-local). */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** how far back the month navigator can go */
const HISTORY_MONTHS = 12;

/** Cell status → tone classes (emerald = on target, amber = over, muted = rest). */
type DayStatus = "inRange" | "over" | "under" | "noData";

const STATUS_TONE: Record<DayStatus, string> = {
  inRange: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  over: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  under: "text-muted-foreground",
  noData: "text-muted-foreground/50",
};

/** Day target with the athlete training-day override (same rule as the diary). */
function dayTargetOf(day: CalendarDay, data: CalendarResponse): number {
  return data.isAthlete && day.workoutMin > 0 && data.trainTargetKcal
    ? data.trainTargetKcal
    : data.targetKcal;
}

function statusOf(day: CalendarDay, data: CalendarResponse): DayStatus {
  if (!day.logged || day.kcal <= 0) return "noData";
  const target = dayTargetOf(day, data);
  if (target <= 0) return "under";
  const ratio = day.kcal / target;
  if (ratio > 1.1) return "over";
  if (ratio >= 0.9) return "inRange";
  return "under";
}

/* ------------------- */
/* Day cell            */
/* ------------------- */

function DayCell({
  day,
  data,
  index,
  isToday,
  future,
  reduceMotion,
  onPick,
  dict,
}: {
  day: CalendarDay;
  data: CalendarResponse;
  index: number;
  isToday: boolean;
  future: boolean;
  reduceMotion: boolean;
  onPick: (date: string) => void;
  dict: Dictionary;
}) {
  const status = statusOf(day, data);
  const statusLabel =
    status === "inRange"
      ? dict.calendar.inRange
      : status === "over"
        ? dict.calendar.overTarget
        : status === "under"
          ? dict.calendar.underTarget
          : dict.calendar.noData;
  const ariaLabel = `${day.date}: ${day.kcal} kcal, ${statusLabel}`;
  const showKcal = day.logged && day.kcal > 0;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
      animate={{ opacity: future ? 0.4 : 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.012, 0.24) }}
      className={cn(
        "flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-transparent px-0.5 text-center sm:h-14",
        future ? "cursor-default" : "cursor-pointer transition-all hover:border-border active:scale-95",
        STATUS_TONE[status],
        isToday && "ring-1 ring-primary"
      )}
      disabled={future}
      aria-disabled={future}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={() => {
        if (!future) onPick(day.date);
      }}
    >
      <span className="text-xs leading-none">{Number(day.date.slice(8))}</span>
      <span className="text-[10px] font-semibold leading-none tabular-nums sm:text-[11px]">
        {showKcal ? day.kcal : ""}
      </span>
      <span className="flex h-1 items-center gap-[3px]" aria-hidden>
        {day.waterMl > 0 && (
          <span className="h-1 w-1 rounded-full bg-emerald-500" title={dict.calendar.dayWater} />
        )}
        {day.workoutMin > 0 && (
          <span className="h-1 w-1 rounded-full bg-primary" title={dict.calendar.dayWorkout} />
        )}
        {day.fasting && <span className="h-1 w-1 rounded-full bg-amber-500" title={dict.calendar.dayFasting} />}
      </span>
    </motion.button>
  );
}

/* ------------------------ */
/* Dialog body (per month)  */
/* ------------------------ */

/**
 * Mounted fresh on every dialog open (Radix unmounts DialogContent when
 * closed) → the month state resets from the diary's selected date each time,
 * no reset-effect needed.
 */
function CalendarBody({
  selectedDate,
  onPick,
  onOpenChange,
}: {
  selectedDate: string;
  onPick: (date: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { dict, locale } = useAppStore();
  const reduceMotion = useReducedMotion();

  /** Today in the APP timezone — must match the API's appToday() (Europe/Istanbul),
   *  not the browser's local calendar, so future-day flags stay consistent. */
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: APP_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    []
  );
  const currentMonth = monthOf(today);
  const [month, setMonth] = useState(() => {
    const m = monthOf(selectedDate);
    return MONTH_RE.test(m) ? m : currentMonth;
  });

  const canNext = month < currentMonth;
  const minMonth = addMonths(currentMonth, -HISTORY_MONTHS);
  const canPrev = month > minMonth;

  const cal = useQuery({
    queryKey: ["calendar", month],
    queryFn: () => api<CalendarResponse>(`/api/calendar?month=${month}`),
    staleTime: 60_000,
    retry: false,
  });

  const localeTag = locale === "en" ? "en-US" : "tr-TR";

  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag, { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${month}-01T00:00:00Z`)
      ),
    [month, localeTag]
  );

  /** Weekday short names, Monday-first (2025-01-06 is a Monday). */
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(Date.UTC(2025, 0, 6 + i)).toLocaleDateString(localeTag, {
          weekday: "short",
          timeZone: "UTC",
        })
      ),
    [localeTag]
  );

  const data = cal.data;

  /** Leading blanks so the 1st lands on its weekday column (Monday-first). */
  const offset = useMemo(
    () => (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7,
    [month]
  );

  const stats = useMemo(() => {
    if (!data) return null;
    let loggedDays = 0;
    let mealDays = 0;
    let kcalSum = 0;
    let onTargetDays = 0;
    for (const day of data.days) {
      if (!day.logged) continue;
      loggedDays++;
      if (day.kcal > 0) {
        kcalSum += day.kcal;
        mealDays++;
        // on-target: strictly past, completed days within ±10% of that day's target
        if (day.date < today) {
          const target = dayTargetOf(day, data);
          if (target > 0 && day.kcal >= target * 0.9 && day.kcal <= target * 1.1) onTargetDays++;
        }
      }
    }
    return {
      loggedDays,
      onTargetDays,
      avgKcal: mealDays > 0 ? Math.round(kcalSum / mealDays) : 0,
    };
  }, [data, today]);

  const pick = (date: string) => {
    onPick(date);
    onOpenChange(false);
  };

  return (
    <>
      <DialogHeader className="space-y-2">
        <div className="flex items-center justify-between gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            disabled={!canPrev}
            aria-label={dict.calendar.prevMonth}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Button>
          <div className="flex min-w-0 flex-col items-center gap-0.5">
            <DialogTitle className="text-base font-semibold leading-tight">{monthTitle}</DialogTitle>
            <button
              type="button"
              onClick={() => setMonth(currentMonth)}
              disabled={month === currentMonth}
              className="rounded-md px-2 py-1 text-xs font-medium text-primary underline-offset-2 hover:underline disabled:cursor-default disabled:text-muted-foreground/60 disabled:no-underline"
            >
              {dict.calendar.todayBtn}
            </button>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            disabled={!canNext}
            aria-label={dict.calendar.nextMonth}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>
        <DialogDescription className="text-center text-xs">{dict.calendar.subtitle}</DialogDescription>
      </DialogHeader>

      {/* ---------- Month summary ---------- */}
      {data && stats ? (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={dict.calendar.monthSummary}>
          <div className="rounded-xl border bg-muted/30 p-2 text-center">
            <p className="text-sm font-semibold leading-tight tabular-nums">
              {stats.avgKcal}
              <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">kcal</span>
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{dict.calendar.avgKcal}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-2 text-center">
            <p className="text-sm font-semibold leading-tight tabular-nums">{stats.loggedDays}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{dict.calendar.loggedDays}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-2 text-center">
            <p className="text-sm font-semibold leading-tight tabular-nums">{stats.onTargetDays}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{dict.calendar.onTargetDays}</p>
          </div>
        </div>
      ) : null}

      {/* ---------- Grid ---------- */}
      {cal.isPending || !data ? (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[60px] rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg sm:h-14" />
            ))}
          </div>
        </div>
      ) : cal.isError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm text-muted-foreground">{dict.errors.network}</p>
          <Button variant="outline" className="min-h-[44px]" onClick={() => void cal.refetch()}>
            {dict.common.retry}
          </Button>
        </div>
      ) : (
        <div>
          {/* weekday header — Monday first */}
          <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
            {weekdayLabels.map((w) => (
              <span key={w} className="text-center text-[10px] font-medium text-muted-foreground">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} className="h-12 sm:h-14" aria-hidden />
            ))}
            {data.days.map((day, i) => (
              <DayCell
                key={day.date}
                day={day}
                data={data}
                index={i}
                isToday={day.date === today}
                future={day.date > today}
                reduceMotion={reduceMotion ?? false}
                onPick={pick}
                dict={dict}
              />
            ))}
          </div>
          {/* legend */}
          <div
            className="mt-3 flex items-center justify-center gap-3 text-[10px] text-muted-foreground"
            aria-label={dict.calendar.legend}
          >
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              {dict.calendar.inRange}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
              {dict.calendar.overTarget}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40" aria-hidden />
              {dict.calendar.noData}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------- */
/* Public component    */
/* ------------------- */

/**
 * FitZen-style month calendar dialog: every logged day at a glance,
 * tap a day → jump to it in the diary.
 */
export function CalendarDialog({
  open,
  onOpenChange,
  selectedDate,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  onPick: (date: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md gap-3 p-4 sm:max-w-md sm:p-5">
        <CalendarBody selectedDate={selectedDate} onPick={onPick} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
