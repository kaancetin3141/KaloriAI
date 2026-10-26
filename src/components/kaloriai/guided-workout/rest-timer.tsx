"use client";

/**
 * Rest timer dock (openGym-inspired): auto-starts when a set is checked,
 * countdown ring, +15s / skip, optional Web-Audio beep when it ends.
 * `left` is derived at render time; an interval only forces re-renders.
 */
import { useEffect, useReducer, useRef } from "react";
import { Timer, SkipForward, Plus, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

interface RestState {
  endsAt: number; // epoch ms
  total: number; // seconds
}

interface Props {
  rest: RestState | null;
  onDone: () => void;
  onAdd15: () => void;
  onSkip: () => void;
  className?: string;
}

function beep(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (at: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    };
    const t0 = ctx.currentTime;
    play(t0, 880);
    play(t0 + 0.45, 1100);
    play(t0 + 0.9, 1320);
    setTimeout(() => void ctx.close(), 1600);
  } catch {
    /* autoplay policy etc. — sessiz kalır */
  }
}

export function RestTimer({ rest, onDone, onAdd15, onSkip, className }: Props) {
  const dict = useAppStore((s) => s.dict);
  const soundOn = useAppStore((s) => s.guidedSession?.soundOn ?? true);
  const patch = useAppStore((s) => s.patchGuidedSession);
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  const beeped = useRef<string | null>(null);

  useEffect(() => {
    if (!rest) {
      beeped.current = null;
      return;
    }
    const iv = setInterval(() => {
      forceTick();
      if (Date.now() >= rest.endsAt && beeped.current !== String(rest.endsAt)) {
        beeped.current = String(rest.endsAt);
        if (soundOn) beep();
        onDone();
      }
    }, 250);
    return () => clearInterval(iv);
  }, [rest, onDone, soundOn]);

  if (!rest) return null;

  const left = Math.max(0, Math.ceil((rest.endsAt - Date.now()) / 1000));
  const pct = rest.total > 0 ? Math.max(0, Math.min(1, left / rest.total)) : 0;
  const mm = Math.floor(left / 60);
  const ss = left % 60;
  const finished = left === 0;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-lg p-3 flex items-center gap-3",
        finished && "border-primary/50 ring-1 ring-primary/30",
        className,
      )}
      role="timer"
      aria-live="off"
      aria-label={`${dict.guided.restTimer}: ${left}s`}
    >
      {/* circular progress */}
      <div className="relative h-11 w-11 shrink-0" aria-hidden>
        <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
          <circle cx="22" cy="22" r="19" fill="none" stroke="var(--muted)" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r="19"
            fill="none"
            stroke={finished ? "var(--primary)" : "var(--chart-2)"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 19}
            strokeDashoffset={2 * Math.PI * 19 * (1 - pct)}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          <Timer className={cn("h-4 w-4", finished ? "text-primary animate-pulse" : "text-muted-foreground")} aria-hidden />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-bold tabular-nums", finished && "text-primary")}>
          {finished ? dict.guided.restDone : dict.guided.restTimer}
        </p>
        <p className="text-2xl font-extrabold tabular-nums leading-none mt-0.5">
          {mm > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : `${ss}s`}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => patch((s) => ({ ...s, soundOn: !s.soundOn }))}
          className="rounded-xl h-10 w-10 text-muted-foreground"
          aria-label={dict.guided.sound}
          title={dict.guided.sound}
        >
          {soundOn ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onAdd15}
          className="rounded-xl h-10 w-10"
          aria-label={dict.guided.restAdd15}
          title={dict.guided.restAdd15}
          disabled={finished}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={onSkip}
          className="rounded-xl h-10 w-10"
          aria-label={dict.guided.restSkip}
          title={dict.guided.restSkip}
        >
          <SkipForward className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
