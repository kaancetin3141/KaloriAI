"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2, RotateCcw, ScanFace, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { DEFAULT_MEAL_TYPES } from "@/lib/calculations";
import type { AiAnalyzeResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AiResultEditor, type AiEditorResult } from "@/components/kaloriai/ai-result-editor";
import { PaywallDialog } from "@/components/kaloriai/paywall-dialog";

type ErrorKind = "quota" | "notfood" | "generic" | null;

/** Local date → YYYY-MM-DD */
const fmtDate = (d: Date = new Date()) => d.toLocaleDateString("en-CA");

// Upload öncesi istemci taraflı küçültme: telefon fotoğrafları (3-8MB) 1600px JPEG'e
// iner → daha hızlı AI turu, 413 (10MB) riski ortadan kalkar, mobil veri tasarrufu.
const MAX_EDGE_PX = 1600;
const MAX_RAW_BYTES = 2.5 * 1024 * 1024;

async function downscaleImage(b: Blob): Promise<Blob> {
  if (b.type === "image/jpeg" && b.size <= MAX_RAW_BYTES) return b; // zaten ideal
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(b, { imageOrientation: "from-image" });
  } catch {
    return b; // decode edilemedi → orijinali dene (sunucu 415 verirse net hata)
  }
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    return b;
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!out || out.size >= b.size) return b;
  return out;
}

export function AiCapture({
  open,
  onClose,
  defaultMealType,
}: {
  open: boolean;
  onClose: () => void;
  defaultMealType?: string;
}) {
  const { dict, locale } = useAppStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [isIframe] = useState(
    () => typeof window !== "undefined" && window.self !== window.top
  );
  const [meal, setMeal] = useState<string>(
    defaultMealType && (DEFAULT_MEAL_TYPES as readonly string[]).includes(defaultMealType)
      ? defaultMealType
      : "breakfast"
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorResult, setEditorResult] = useState<AiEditorResult | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const setPreview = useCallback((b: Blob | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = b ? URL.createObjectURL(b) : null;
    setPreviewUrl(previewUrlRef.current);
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  // Camera lifecycle: start when dialog open and no photo chosen yet.
  // setState happens only inside async .then/.catch callbacks (post-await).
  useEffect(() => {
    if (!open || blob) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError(false);
      })
      .catch(() => {
        if (!cancelled) setCameraError(true);
      });
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, blob, stopCamera]);

  const applyBlob = useCallback(
    (b: Blob) => {
      setErrorKind(null);
      setErrMsg(null);
      setPreview(b); // hemen önizle (büyütme arkada sürer)
      downscaleImage(b)
        .then((small) => {
          setBlob(small);
          if (small !== b) setPreview(small);
        })
        .catch(() => setBlob(b));
    },
    [setPreview]
  );

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (b) => {
        if (b) {
          applyBlob(b);
          stopCamera();
        }
      },
      "image/jpeg",
      0.9
    );
  }, [applyBlob, stopCamera]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      applyBlob(f);
      stopCamera();
    }
    e.target.value = "";
  };

  const retake = () => {
    setPreview(null);
    setBlob(null);
    setErrorKind(null);
    setErrMsg(null);
  };

  const analyze = useMutation({
    mutationFn: async () => {
      if (!blob) throw new Error("no image");
      const fd = new FormData();
      fd.append("image", blob, "photo.jpg");
      fd.append("locale", locale);
      return api<AiAnalyzeResponse>("/api/ai/analyze-photo", { form: fd });
    },
    onSuccess: (res) => {
      setEditorResult({
        items: res.items,
        overallConfidence: res.overallConfidence,
        clarifyingQuestion: res.clarifyingQuestion,
        imageUrl: res.imageUrl,
        analysisId: res.analysisId,
      });
      setEditorOpen(true);
      setErrorKind(null);
      onClose(); // close capture dialog; editor stays mounted inside this component
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === "QUOTA_EXCEEDED") {
          setErrorKind("quota");
          return;
        }
        if (err.code === "NOT_FOOD") {
          setErrorKind("notfood");
          return;
        }
        setErrorKind("generic");
        // Kullanıcının ne yapacağını bilmesi için kod bazlı net mesajlar:
        if (err.code === "UNAUTHORIZED" || err.status === 401) setErrMsg(dict.ai.errAuth);
        else if (err.code === "FILE_TOO_LARGE" || err.status === 413) setErrMsg(dict.ai.errSize);
        else if (err.code === "FILE_TYPE" || err.status === 415) setErrMsg(dict.ai.errType);
        else setErrMsg(null); // → genel mesaj
        return;
      }
      // fetch ağ hatası (TypeError: Failed to fetch vb.)
      setErrorKind("generic");
      setErrMsg(dict.ai.errNetwork);
    },
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            onClose();
            // Kapanınca yakalama state'ini sıfırla — aksi halde yeniden açılışta
            // bayat/bozuk önizleme kalır ve akış sayfa yenilenene kadar takılır.
            // (Editör state'ine dokunulmaz: analiz başarısında editör açık kalır.)
            retake();
            setCameraError(false);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto kai-scroll sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dict.today.takePhoto}</DialogTitle>
            <DialogDescription>{dict.today.takePhotoSub}</DialogDescription>
          </DialogHeader>

          {!blob ? (
            <div className="space-y-3">
              {/* Live camera (stays mounted so the stream can attach even after a retry) */}
              <div className={cn("relative overflow-hidden rounded-xl bg-black", cameraError && "hidden")}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-[4/3] w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/50 to-transparent pb-3 pt-8">
                  <button
                    type="button"
                    onClick={captureFrame}
                    aria-label={dict.today.takePhoto}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition-transform hover:scale-105 active:scale-95"
                  >
                    <Camera className="h-6 w-6" aria-hidden />
                  </button>
                </div>
              </div>

              {/* File fallback (also works on desktop) */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex min-h-[88px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <ImagePlus className="h-6 w-6" aria-hidden />
                <span className="text-xs">{dict.today.takePhotoSub}</span>
              </button>
              {cameraError && isIframe && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
                  {dict.ai.camIframeHint}
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFile}
                aria-label={dict.today.takePhoto}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Preview + scanning overlay */}
              <div className="relative overflow-hidden rounded-xl bg-muted">
                <img
                  src={previewUrl ?? ""}
                  alt={dict.today.takePhoto}
                  className="aspect-[4/3] w-full object-cover"
                />
                {analyze.isPending && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
                    <ScanFace className="h-10 w-10 animate-pulse text-primary" aria-hidden />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      {dict.ai.analyzing}
                    </div>
                  </div>
                )}
              </div>

              {/* Meal type + retake */}
              <div className="flex items-center gap-2">
                <Select value={meal} onValueChange={setMeal}>
                  <SelectTrigger className="min-h-[44px] flex-1" aria-label={dict.diary.addTo}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_MEAL_TYPES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {dict.today[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={retake}
                  disabled={analyze.isPending}
                  aria-label={dict.common.back}
                  className="h-11 w-11 shrink-0"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                </Button>
              </div>

              {/* Error states */}
              {errorKind && (
                <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <p>
                    {errorKind === "quota"
                      ? dict.ai.quotaDone
                      : errorKind === "notfood"
                        ? dict.ai.notFood
                        : (errMsg ?? dict.ai.failed)}
                  </p>
                  {errorKind === "quota" ? (
                    <Button
                      size="sm"
                      onClick={() => setPaywallOpen(true)}
                      className="min-h-[44px] sm:min-h-9 sm:self-start"
                    >
                      {dict.profile.upgrade}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setErrorKind(null);
                        setErrMsg(null);
                        // Gerçek yeniden deneme: görsel hâlâ seçiliyse aynı görselle tekrar dene
                        if (blob) analyze.mutate();
                      }}
                      className="min-h-[44px] gap-1.5 sm:min-h-9 sm:self-start"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      {dict.common.retry}
                    </Button>
                  )}
                </div>
              )}

              <Button
                onClick={() => analyze.mutate()}
                disabled={analyze.isPending}
                className="min-h-[44px] w-full gap-2"
              >
                {analyze.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                {dict.today.analyze}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editorResult && (
        <AiResultEditor
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditorResult(null);
          }}
          result={editorResult}
          mealType={meal}
          date={fmtDate()}
        />
      )}

      <PaywallDialog open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </>
  );
}
