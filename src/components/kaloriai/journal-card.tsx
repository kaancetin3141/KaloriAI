"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BookHeart, Check, Loader2, Smile, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Mood = "great" | "good" | "okay" | "low" | "bad";

const MOOD_EMOJI: Record<Mood, string> = {
  great: "🤩",
  good: "🙂",
  okay: "😐",
  low: "😕",
  bad: "😣",
};

const MOOD_TONE: Record<Mood, string> = {
  great: "bg-emerald-500/15 ring-emerald-500/50 scale-110",
  good: "bg-primary/15 ring-primary/50 scale-110",
  okay: "bg-amber-500/15 ring-amber-500/50 scale-110",
  low: "bg-orange-500/15 ring-orange-500/50 scale-110",
  bad: "bg-rose-500/15 ring-rose-500/50 scale-110",
};

interface DailyNoteData {
  id?: string;
  date?: string;
  mood?: string | null;
  text?: string | null;
}

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Daily journal + mood card — Yazio-style wellbeing tracker.
 * Mounted on the Today screen; autosaves mood instantly, text on demand.
 */
export function JournalCard({ index }: { index: number }) {
  const dict = useAppStore((s) => s.dict);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const date = useMemo(() => todayISO(), []);

  const noteQ = useQuery<{ ok: boolean; note: DailyNoteData | null }>({
    queryKey: ["note", date],
    queryFn: () => api(`/api/note?date=${date}`),
    staleTime: 30_000,
  });

  const serverMood = (noteQ.data?.note?.mood ?? null) as Mood | null;
  const serverText = noteQ.data?.note?.text ?? "";

  const [pendingMood, setPendingMood] = useState<Mood | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);

  const mood: Mood | null = pendingMood ?? serverMood;
  const text = pendingText ?? serverText;

  const save = useMutation({
    mutationFn: (body: { mood?: string | null; text?: string | null }) =>
      api("/api/note", { body: { date, ...body } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note", date] });
      setPendingMood(null);
      setPendingText(null);
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const pickMood = (m: Mood) => {
    setPendingMood(m);
    save.mutate({ mood: m });
  };

  const saveText = () => {
    if (pendingText === null) return;
    save.mutate({ text: pendingText.trim() || null, mood: mood });
    toast({ title: dict.journal.saved });
  };

  const dirty = pendingText !== null;
  const isSaving = save.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
    >
      <Card className="kai-card-hover p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chart-2/15">
            <BookHeart className="h-4 w-4 text-chart-2" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-tight">{dict.journal.title}</h3>
            <p className="text-xs text-muted-foreground">{dict.journal.subtitle}</p>
          </div>
        </div>

        {noteQ.isLoading ? (
          <div className="mt-3 space-y-2" aria-busy>
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : (
          <>
            {/* Mood picker */}
            <div
              className="mt-3 flex items-center justify-between gap-1.5 sm:justify-start sm:gap-2"
              role="radiogroup"
              aria-label={dict.journal.moodLabel}
            >
              {(Object.keys(MOOD_EMOJI) as Mood[]).map((m) => {
                const active = mood === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={dict.journal[m]}
                    onClick={() => pickMood(m)}
                    disabled={isSaving}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full text-xl ring-1 ring-transparent transition-all duration-200 hover:scale-105 sm:h-10 sm:w-10 sm:text-lg",
                      active
                        ? MOOD_TONE[m]
                        : "hover:bg-muted active:scale-95",
                      isSaving && "opacity-60"
                    )}
                  >
                    <span aria-hidden>{MOOD_EMOJI[m]}</span>
                  </button>
                );
              })}
              <span className="ml-auto hidden text-xs font-medium text-muted-foreground sm:inline sm:ml-2">
                {mood ? dict.journal[mood] : dict.journal.moodHint}
              </span>
            </div>

            {/* Note text */}
            <div className="relative mt-3">
              <Textarea
                value={text}
                onChange={(e) => setPendingText(e.target.value)}
                placeholder={dict.journal.placeholder}
                aria-label={dict.journal.title}
                rows={3}
                maxLength={2000}
                className="min-h-[76px] resize-none pr-9 text-sm"
              />
              {text && (
                <button
                  type="button"
                  onClick={() => setPendingText("")}
                  aria-label={dict.journal.clear}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Smile className="h-3.5 w-3.5" aria-hidden />
                {mood ? dict.journal[mood] : dict.journal.moodHint}
              </span>
              {dirty && (
                <Button
                  size="sm"
                  onClick={saveText}
                  disabled={isSaving}
                  className="kai-pressable min-h-[36px] gap-1.5 px-3 text-xs"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                  {dict.journal.save}
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
}
