"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import type { Reminder } from "@/lib/types";

const FIRED_KEY = "kaloriai_notif_fired";

/**
 * Quiet hours 22:00–08:00 in the device's LOCAL time — matches the server-side
 * policy (scheduler.ts, Europe/Istanbul). Local notifications never fire inside
 * this night window; reminders due during it are simply skipped for that day.
 */
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 8;

function isQuietHours(d: Date): boolean {
  const h = d.getHours();
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/**
 * True when this browser has an active web-push subscription: the server-side
 * scheduler already delivers reminders to this device, so local notifications
 * are skipped to avoid double notifications.
 */
async function hasActivePushSubscription(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

function readFired(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(FIRED_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Local reminder scheduler — fires browser notifications at enabled reminder
 * times while the app is open. Deduplicates per type+day via localStorage.
 * Graceful no-op when notifications are unsupported or permission denied.
 */
export function ReminderNotifier() {
  const dict = useAppStore((s) => s.dict);
  const firedRef = useRef<Record<string, string>>(readFired());

  const remindersQ = useQuery<{ reminders: Reminder[] }>({
    queryKey: ["reminders"],
    queryFn: () => api<{ reminders: Reminder[] }>("/api/reminders"),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    // Tracks whether server push covers this device; refreshed while mounted.
    let cancelled = false;
    const push = { subscribed: false };
    const refreshPush = () =>
      void hasActivePushSubscription().then((v) => {
        if (!cancelled) push.subscribed = v;
      });
    refreshPush();
    const pushTimer = window.setInterval(refreshPush, 60_000);

    const bodies: Record<string, string> = {
      breakfast: dict.profile.reminderBodies.breakfast,
      lunch: dict.profile.reminderBodies.lunch,
      dinner: dict.profile.reminderBodies.dinner,
      water: dict.profile.reminderBodies.water,
      weigh_in: dict.profile.reminderBodies.weigh_in,
      workout: dict.profile.reminderBodies.workout,
    };

    const showNotification = async (body: string, tag: string) => {
      // Prefer the service worker channel (works with the installed PWA + push styling)
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) {
          await reg.showNotification("KaloriAI", { body, tag, icon: "/icon-192.png", badge: "/icon-192.png" });
          return;
        }
      } catch {
        /* fall through to page notification */
      }
      new Notification("KaloriAI", { body, tag });
    };

    const tick = () => {
      const reminders = remindersQ.data?.reminders ?? [];
      if (reminders.length === 0) return;
      const now = new Date();
      // Quiet hours (22:00–08:00 local): no local notifications at night.
      if (isQuietHours(now)) return;
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = now.toLocaleDateString("en-CA");

      for (const r of reminders) {
        if (!r.enabled) continue;
        const key = `${r.type}`;
        if (firedRef.current[key] === today) continue; // already fired today
        if (r.time !== hhmm) continue;
        // Server push covers this device → consume the tick without showing
        // a local notification (prevents push + local doubles).
        firedRef.current[key] = today;
        try {
          window.localStorage.setItem(FIRED_KEY, JSON.stringify(firedRef.current));
          if (!push.subscribed) {
            void showNotification(bodies[r.type] ?? r.type, `kaloriai-${r.type}-${today}`).catch(() => {});
          }
        } catch {
          /* notification failures must never break the UI */
        }
      }
    };

    tick(); // catch a reminder whose minute arrived between renders
    const interval = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearInterval(pushTimer);
    };
  }, [remindersQ.data, dict]);

  return null;
}
