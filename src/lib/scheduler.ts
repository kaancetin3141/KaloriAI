import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

/**
 * Server-side reminder scheduler.
 *
 * Reminders fire push notifications even when the app is closed. A lightweight
 * in-process loop scans every minute for due reminders; /api/push/cron can also
 * trigger the same scan externally (host cron / uptime pinger).
 *
 * Timezone: reminder times are user-local HH:mm. All users share the app's
 * primary timezone (APP_TZ env, default Europe/Istanbul — product default
 * locale is Turkish). Documented as a known simplification.
 */

const APP_TZ = process.env.APP_TZ ?? "Europe/Istanbul";
/** Grace window in minutes: catches scans slightly late (GC pause, cold start) */
const GRACE_MIN = 3;

interface TzNow {
  date: string; // YYYY-MM-DD
  hhmm: string; // HH:mm
  minuteOfDay: number;
}

function tzNow(): TzNow {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour; // some ICU builds emit 24 for midnight
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hhmm = `${hour}:${parts.minute}`;
  return { date, hhmm, minuteOfDay: Number(hour) * 60 + Number(parts.minute) };
}

function reminderMinute(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

interface ReminderMeta {
  title: string;
  body: string;
}

/** Localized push payload per reminder type (kept self-contained — server-side strings) */
function reminderPayload(type: string, locale: string): ReminderMeta {
  const tr = locale !== "en";
  switch (type) {
    case "breakfast":
      return tr
        ? { title: "Kahvaltı vakti 🍳", body: "Güne iyi başla — kahvaltını fotoğrafla, gerisini KaloriAI halleder." }
        : { title: "Breakfast time 🍳", body: "Start strong — snap a photo of your breakfast and let KaloriAI do the rest." };
    case "lunch":
      return tr
        ? { title: "Öğle yemeği vakti 🍽️", body: "Öğle yemeğini kaydetmeyi unutma — bir fotoğraf yeterli." }
        : { title: "Lunch time 🍽️", body: "Don't forget to log lunch — one photo is enough." };
    case "dinner":
      return tr
        ? { title: "Akşam yemeği vakti 🌙", body: "Günü eksiksiz kapat: akşam yemeğini kaydet." }
        : { title: "Dinner time 🌙", body: "Close the day right: log your dinner." };
    case "water":
      return tr
        ? { title: "Su içme zamanı 💧", body: "Küçük yudumlar büyük fark yaratır — bir bardak su iç." }
        : { title: "Hydration check 💧", body: "Small sips make a big difference — have a glass of water." };
    case "weigh_in":
      return tr
        ? { title: "Tartı zamanı ⚖️", body: "Sabah tartısı en doğru veridir — kilonu kaydet." }
        : { title: "Weigh-in time ⚖️", body: "Morning weigh-ins are the most reliable — log your weight." };
    case "workout":
      return tr
        ? { title: "Antrenman vakti 💪", body: "Hareket zamanı — antrenmanını kaydet, yakılan kalorileri gör." }
        : { title: "Workout time 💪", body: "Time to move — log your workout and see calories burned." };
    default:
      return tr
        ? { title: "KaloriAI hatırlatması ⏰", body: "Planına sadık kal — bugünkü kaydını yap." }
        : { title: "KaloriAI reminder ⏰", body: "Stay on track — make today's entry." };
  }
}

export interface ScanResult {
  tz: string;
  now: string;
  date: string;
  checked: number;
  sent: number;
  marked: number;
  pruned: number;
}

/**
 * Scan all enabled reminders that belong to users with at least one push
 * endpoint; send and mark those due within the grace window (deduped per day).
 */
export async function runReminderScan(): Promise<ScanResult> {
  const now = tzNow();
  const reminders = await db.reminder.findMany({
    where: { enabled: true, user: { pushEndpoints: { some: {} } } },
    select: {
      id: true,
      userId: true,
      type: true,
      time: true,
      lastSentDate: true,
      user: { select: { locale: true } },
    },
  });

  let sent = 0;
  let marked = 0;
  let pruned = 0;

  for (const r of reminders) {
    if (r.lastSentDate === now.date) continue;
    const min = reminderMinute(r.time);
    const delta = now.minuteOfDay - min;
    // due = within [now-GRACE, now]; a small negative delta tolerates clock jitter
    if (delta < 0 || delta > GRACE_MIN) continue;
    const meta = reminderPayload(r.type, r.user.locale);
    const res = await sendPushToUser(r.userId, { title: meta.title, body: meta.body, tag: `reminder-${r.type}`, url: "/" });
    sent += res.sent;
    pruned += res.pruned;
    await db.reminder
      .update({ where: { id: r.id }, data: { lastSentDate: now.date } })
      .catch(() => {});
    marked += 1;
  }

  return { tz: APP_TZ, now: now.hhmm, date: now.date, checked: reminders.length, sent, marked, pruned };
}

/* ------------------------------ lifecycle ------------------------------ */

const INTERVAL_MS = 60_000;

declare global {
  var __kaloriaiScheduler: { timer: ReturnType<typeof setInterval>; lastScan?: ScanResult } | undefined;
}

/** Start the in-process scan loop exactly once (idempotent across HMR) */
export function startScheduler(): void {
  if (globalThis.__kaloriaiScheduler) return;
  const timer = setInterval(() => {
    void runReminderScan()
      .then((res) => {
        if (globalThis.__kaloriaiScheduler) globalThis.__kaloriaiScheduler.lastScan = res;
      })
      .catch(() => {});
  }, INTERVAL_MS);
  timer.unref?.();
  globalThis.__kaloriaiScheduler = { timer };
  void runReminderScan()
    .then((res) => {
      if (globalThis.__kaloriaiScheduler) globalThis.__kaloriaiScheduler.lastScan = res;
    })
    .catch(() => {});
}

export function schedulerStatus(): { running: boolean; tz: string; lastScan?: ScanResult } {
  const state = globalThis.__kaloriaiScheduler;
  return { running: Boolean(state), tz: APP_TZ, lastScan: state?.lastScan };
}
