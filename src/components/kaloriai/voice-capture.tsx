"use client";

import { useRef, useState } from "react";
import { Mic, Loader2, Square, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiResultEditor, type AiEditorResult } from "@/components/kaloriai/ai-result-editor";

/* Minimal typings for the vendor-prefixed Web Speech API */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function guessMealType(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 21) return "dinner";
  return "snacks";
}

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Phase = "idle" | "listening" | "analyzing";

/**
 * Voice logging — Web Speech API → transcript → AI parser → AiResultEditor.
 * Gracefully degrades when the browser does not support SpeechRecognition.
 * Outer component mounts the inner dialog body only while open (fresh state each open).
 */
export function VoiceCapture({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <VoiceCaptureBody onClose={onClose} />;
}

function VoiceCaptureBody({ onClose }: { onClose: () => void }) {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const { toast } = useToast();
  const [supported] = useState(getRecognitionCtor !== null && getRecognitionCtor() !== null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AiEditorResult | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  const lang = locale === "en" ? "en-US" : "tr-TR";

  const abortRecognition = () => {
    try {
      recRef.current?.abort();
    } catch {
      /* noop */
    }
    recRef.current = null;
  };

  const stopListening = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setPhase("idle");
  };

  const startListening = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setErrorMsg(dict.voice.unsupported);
      return;
    }
    setErrorMsg(null);
    finalRef.current = "";
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setErrorMsg(dict.voice.denied);
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        setErrorMsg(dict.voice.error);
      }
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    rec.onend = () => {
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    recRef.current = rec;
    try {
      rec.start();
      setPhase("listening");
    } catch {
      setErrorMsg(dict.voice.error);
      setPhase("idle");
    }
  };

  const analyze = async () => {
    const t = transcript.trim();
    if (t.length < 3) {
      toast({ title: dict.errors.validation, variant: "destructive" });
      return;
    }
    setPhase("analyzing");
    try {
      const res = await api<AiEditorResult & { ok: boolean }>("/api/ai/parse-text", {
        body: { text: t, locale },
      });
      if (!res.items?.length) {
        toast({ title: dict.ai.notFood, variant: "destructive" });
        setPhase("idle");
        return;
      }
      setResult({ ...res, imageUrl: undefined, analysisId: undefined });
    } catch {
      toast({ title: dict.ai.failed, variant: "destructive" });
      setPhase("idle");
    }
  };

  const closeEditor = () => {
    abortRecognition();
    setResult(null);
    onClose();
  };

  return (
    <>
      <Dialog open={!result} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" aria-hidden />
              {dict.voice.title}
            </DialogTitle>
            <DialogDescription>{dict.voice.subtitle}</DialogDescription>
          </DialogHeader>

          {!supported ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              {dict.voice.unsupported}
            </div>
          ) : (
            <>
              {/* Mic button */}
              <div className="flex flex-col items-center gap-4 py-2">
                <div className="relative">
                  {phase === "listening" && (
                    <>
                      <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden />
                      <span className="absolute -inset-2 animate-pulse rounded-full bg-primary/10" aria-hidden />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={phase === "listening" ? stopListening : startListening}
                    disabled={phase === "analyzing"}
                    aria-label={phase === "listening" ? dict.voice.stop : dict.voice.start}
                    className={cn(
                      "relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 active:scale-95",
                      phase === "listening"
                        ? "bg-destructive shadow-destructive/30"
                        : "kai-pressable bg-gradient-to-br from-primary to-chart-2 shadow-primary/30",
                      phase === "analyzing" && "opacity-60"
                    )}
                  >
                    {phase === "listening" ? (
                      <Square className="h-7 w-7" aria-hidden />
                    ) : phase === "analyzing" ? (
                      <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                    ) : (
                      <Mic className="h-8 w-8" aria-hidden />
                    )}
                  </button>
                </div>
                <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
                  {phase === "listening"
                    ? dict.voice.listening
                    : phase === "analyzing"
                      ? dict.ai.analyzing
                      : dict.voice.tapToStart}
                </p>
              </div>

              {/* Live transcript */}
              {(transcript || phase === "listening") && (
                <div className="min-h-[64px] rounded-xl border bg-muted/40 p-3 text-sm" aria-live="polite">
                  {transcript ? (
                    <p className="flex items-start gap-2">
                      <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span className="italic">{transcript}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">{dict.voice.speakNow}</p>
                  )}
                </div>
              )}

              {errorMsg && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
                  {errorMsg}
                </div>
              )}

              <Button
                onClick={analyze}
                disabled={phase !== "idle" || transcript.trim().length < 3}
                className="kai-pressable w-full min-h-[44px] gap-2"
              >
                {phase === "analyzing" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {dict.voice.analyze}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Editor after successful parse (main dialog hides via open={!result}) */}
      <AiResultEditor
        open={result !== null}
        onClose={closeEditor}
        result={result ?? { items: [], overallConfidence: 1, clarifyingQuestion: null }}
        mealType={guessMealType()}
        date={todayISO()}
      />
    </>
  );
}
