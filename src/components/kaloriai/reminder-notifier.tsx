"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import type { Reminder } from "@/lib/types";

const FIRED_KEY = "kaloriai_notif_fired";

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
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = now.toLocaleDateString("en-CA");

      for (const r of reminders) {
        if (!r.enabled) continue;
        const key = `${r.type}`;
        if (firedRef.current[key] === today) continue; // already fired today
        if (r.time !== hhmm) continue;
        firedRef.current[key] = today;
        try {
          window.localStorage.setItem(FIRED_KEY, JSON.stringify(firedRef.current));
          void showNotification(bodies[r.type] ?? r.type, `kaloriai-${r.type}-${today}`).catch(() => {});
        } catch {
          /* notification failures must never break the UI */
        }
      }
    };

    tick(); // catch a reminder whose minute arrived between renders
    const interval = window.setInterval(tick, 30_000);
    return () => window.clearInterval(interval);
  }, [remindersQ.data, dict]);

  return null;
}
