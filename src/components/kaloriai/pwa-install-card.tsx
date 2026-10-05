"use client";

import { useSyncExternalStore } from "react";
import { BadgeCheck, Smartphone } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * `beforeinstallprompt` usually fires once, early in the page lifecycle —
 * long before the Profile (and this card) is ever mounted. So the event is
 * captured at module level and components subscribe via useSyncExternalStore.
 */
type PwaState = "none" | "available" | "installed";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
  // Already running as an installed standalone app?
  if (window.matchMedia("(display-mode: standalone)").matches) {
    deferredPrompt = null;
  }
}

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function getSnapshot(): PwaState {
  if (!deferredPrompt) return "installed"; // standalone or already consumed → hide card
  return "available";
}

function getServerSnapshot(): PwaState {
  return "installed";
}

export function PwaInstallCard() {
  const dict = useAppStore((s) => s.dict);
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (state !== "available" || !deferredPrompt) return null;

  const install = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        deferredPrompt = null;
        notify();
      }
    } catch {
      // browser refused or user dismissed — hide the card
      deferredPrompt = null;
      notify();
    }
  };

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10" aria-hidden>
          <Smartphone className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">{dict.pwa.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{dict.pwa.sub}</p>
        </div>
        <div className="flex items-center gap-2 sm:self-center">
          <Button size="sm" className="min-h-[44px] gap-1.5 px-4" onClick={install}>
            <BadgeCheck className="h-4 w-4" aria-hidden />
            {dict.pwa.button}
          </Button>
        </div>
      </div>
    </Card>
  );
}
