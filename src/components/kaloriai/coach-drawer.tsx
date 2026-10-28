"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { HeartPulse, Loader2, Send, Sparkles } from "lucide-react";
import { runAiJob } from "@/lib/ai-client";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface ChatMsg {
  role: "assistant" | "user";
  content: string;
}

interface HealthProfileData {
  conditions: string[];
  allergies: string[];
  dietPreference: string;
}

/** Bilinmeyen token (onboarding'in serbest metni) → ham metin gösterilir */
const condLabel = (dict: Dictionary, key: string): string =>
  dict.healthProfile.conditionsList[key as keyof typeof dict.healthProfile.conditionsList] ?? key;
const allergyLabel = (dict: Dictionary, key: string): string =>
  dict.healthProfile.allergiesList[key as keyof typeof dict.healthProfile.allergiesList] ?? key;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

function TypingDots() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex w-16 items-center justify-center gap-1 self-start rounded-2xl bg-muted px-4 py-3"
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </motion.div>
  );
}

export function CoachDrawer() {
  const { dict, locale, coachOpen, setCoachOpen } = useAppStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isDesktop = useIsDesktop();

  /* Sağlık notları — küçük ve önbellekli (koç her açılışta istek atmasın) */
  const healthQ = useQuery({
    queryKey: ["healthProfile"],
    queryFn: () => api<HealthProfileData>("/api/health-profile"),
    staleTime: 5 * 60_000,
  });
  const healthNotes = [...(healthQ.data?.conditions ?? []), ...(healthQ.data?.allergies ?? [])];
  const noteLabels = healthNotes.map((t) =>
    (healthQ.data?.conditions ?? []).includes(t) ? condLabel(dict, t) : allergyLabel(dict, t)
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, coachOpen]);

  const send = useMutation({
    mutationFn: async (message: string) => {
      // Kısa POST + yoklama — koç yanıtı arka planda üretilir.
      const res = await runAiJob<{ reply?: string; content?: string; message?: string }>(
        "/api/ai/coach",
        { body: { message, locale } }
      );
      return res.reply ?? res.content ?? res.message ?? "";
    },
    onMutate: (message: string) => {
      setMessages((prev) => [...prev, { role: "user", content: message }]);
      setInput("");
    },
    onSuccess: (reply) => {
      setMessages((prev) => [...prev, { role: "assistant", content: reply || dict.common.error }]);
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: "assistant", content: dict.errors.network }]);
    },
  });

  const submit = () => {
    const text = input.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  return (
    <Sheet open={coachOpen} onOpenChange={setCoachOpen}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(
          "flex flex-col gap-0 p-0",
          isDesktop ? "w-[400px] sm:max-w-[400px]" : "h-[85vh] rounded-t-2xl"
        )}
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            </span>
            {dict.coach.title}
          </SheetTitle>
          <SheetDescription>{dict.coach.disclaimer}</SheetDescription>
        </SheetHeader>

        {/* Sağlık notları — AI koça iletilir (yalnız doluysa) */}
        {healthNotes.length > 0 && (
          <div className="border-b bg-amber-500/5 px-4 py-2.5">
            <Badge
              variant="secondary"
              title={noteLabels.join(" · ")}
              className="max-w-full gap-1 border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-700 dark:text-amber-400"
            >
              <HeartPulse className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">
                {noteLabels.slice(0, 3).join(" · ")}
                {noteLabels.length > 3 ? ` +${noteLabels.length - 3}` : ""}
              </span>
            </Badge>
            <p className="mt-1 text-xs text-muted-foreground">{dict.healthProfile.coachNote}</p>
          </div>
        )}

        <div
          ref={scrollRef}
          className="kai-scroll flex flex-1 flex-col gap-3 overflow-y-auto p-4"
          role="log"
          aria-live="polite"
          aria-label={dict.coach.title}
        >
          {/* Greeting is a persistent first bubble — locale-reactive, no effect needed */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-sm"
          >
            {dict.coach.greeting}
          </motion.div>
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                  m.role === "assistant"
                    ? "self-start bg-muted"
                    : "self-end rounded-br-sm bg-primary text-primary-foreground"
                )}
              >
                {m.content}
              </motion.div>
            ))}
          </AnimatePresence>
          {send.isPending && <TypingDots />}
        </div>

        <form
          className="flex items-center gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={dict.coach.ph}
            aria-label={dict.coach.ph}
            className="min-h-[44px]"
          />
          <Button
            type="submit"
            size="icon"
            onClick={submit}
            disabled={!input.trim() || send.isPending}
            aria-label="Send"
            className="h-11 w-11 shrink-0"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
