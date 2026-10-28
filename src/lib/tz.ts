/**
 * KaloriAI — App timezone helpers (CLIENT-SAFE: no server-only imports).
 *
 * The product's primary market is Türkiye, so ALL calendar-day bucketing
 * ("today" for MealLog/WaterLog/StepsLog/UsageQuota/PlannerDay/reminder
 * lastSentDate…) uses the app display timezone APP_TZ instead of the host
 * machine's timezone. The sandbox and the production VDS may run in UTC or
 * anything else — server-side "today" must be identical on every machine.
 *
 * Conventions:
 * - Calendar dates are "YYYY-MM-DD" (en-CA format) strings in APP_TZ.
 * - Day arithmetic on date strings is anchored at UTC midnight of that
 *   calendar date (deterministic; no machine-local setDate/getDate math).
 *
 * Client components may import this module freely (pure Intl, no "server-only").
 */

/** Guarded env read: on the client `process` shim has no APP_TZ → falls back. */
function envTz(): string | undefined {
  try {
    if (typeof process !== "undefined" && typeof process.env === "object") {
      return process.env.APP_TZ || undefined;
    }
  } catch {
    /* ignore — browser edge cases */
  }
  return undefined;
}

/** App display timezone (Europe/Istanbul — product default locale is Turkish). */
export const APP_TZ = envTz() ?? "Europe/Istanbul";

/* Cached formatter — Intl.DateTimeFormat construction is expensive and these
 * helpers run on every request. en-CA yields ISO-like YYYY-MM-DD output. */
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** YYYY-MM-DD in the app timezone (default: now). */
export function appToday(d: Date = new Date()): string {
  return dayFmt.format(d);
}

export interface AppNowParts {
  /** YYYY-MM-DD in APP_TZ */
  date: string;
  year: string;
  month: string;
  day: string;
  /** "HH" — 00 for midnight (some ICU builds emit 24) */
  hour: string;
  minute: string;
  /** "HH:mm" */
  hhmm: string;
  /** minutes since APP_TZ midnight (0–1439) */
  minuteOfDay: number;
}

/** Structured wall-clock parts of "now" (or d) in APP_TZ — mirrors scheduler.tzNow(). */
export function appNowParts(d: Date = new Date()): AppNowParts {
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(d)) p[part.type] = part.value;
  const hour = p.hour === "24" ? "00" : (p.hour ?? "00"); // some ICU builds emit 24 for midnight
  const minute = p.minute ?? "00";
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    year: p.year,
    month: p.month,
    day: p.day,
    hour,
    minute,
    hhmm: `${hour}:${minute}`,
    minuteOfDay: Number(hour) * 60 + Number(minute),
  };
}

/** YYYY-MM-DD, `days` calendar days before today's APP_TZ date (deterministic window). */
export function appDaysAgoStr(days: number, now: Date = new Date()): string {
  return addDaysIso(appToday(now), -Math.max(0, Math.trunc(days)));
}

/**
 * Deterministic day arithmetic on YYYY-MM-DD strings: returns the date `n`
 * days before (negative) / after (positive) `dateStr`. Anchored at UTC
 * midnight — never touches the host machine's local calendar.
 */
export function addDaysIso(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr; // invalid input — return unchanged
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Month-boundary helpers (pure, client-safe).
 *
 * A "YYYY-MM" month string is already an APP_TZ calendar month (the API layer
 * derives months from appToday()'s en-CA output), and calendar month
 * boundaries are timezone-invariant — so plain UTC arithmetic is exact here,
 * deterministically on every machine (same guarantee as the en-CA trick
 * above, without needing a formatter round-trip).
 */

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

/** First calendar day ("YYYY-MM-01") of a valid "YYYY-MM" month; "" otherwise. */
export function monthStartStr(month: string): string {
  return monthRe.test(month) ? `${month}-01` : "";
}

/** Last calendar day ("YYYY-MM-DD", leap-year aware) of a valid "YYYY-MM" month; "" otherwise. */
export function monthEndStr(month: string): string {
  if (!monthRe.test(month)) return "";
  const [y, m] = month.split("-").map(Number);
  // UTC day 0 of the following month == last day of month m
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
