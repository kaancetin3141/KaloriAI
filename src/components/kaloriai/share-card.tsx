"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Dictionary } from "@/lib/i18n";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import type { ProgressSummary } from "@/lib/types";

/**
 * Haftalık Paylaşım Kartı — 1080×1350 (4:5) canvas PNG.
 * Yeşil glassmorphism paleti (canvas'ta CSS değişkeni kullanılamayacağı için
 * globals.css / tailwind theme token'larına uygun sabit hex değerleri).
 * Veri kaynağı: İlerleme ekranının zaten yüklediği /api/progress/summary yanıtı —
 * ekstra API çağrısı YOK.
 */

const CARD_W = 1080;
const CARD_H = 1350;

/* Tema paleti (yeşil cam efekt) */
const C = {
  bgTop: "#1B4530",
  bgMid: "#0E2E1F",
  bgBottom: "#071C13",
  glowGreen: "rgba(74, 222, 128, 0.16)",
  glowTeal: "rgba(45, 212, 191, 0.10)",
  glass: "rgba(255, 255, 255, 0.06)",
  glassStroke: "rgba(255, 255, 255, 0.13)",
  white: "#FFFFFF",
  dim: "rgba(255, 255, 255, 0.68)",
  dimmer: "rgba(255, 255, 255, 0.52)",
  green: "#4ADE80",
  greenSoft: "#A7F3D0",
  amber: "#FBBF24",
  teal: "#2DD4BF",
} as const;

export interface ShareStats {
  streak: number;
  adherencePct: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  from: string;
  to: string;
  bestDay: { date: string; kcal: number } | null;
}

type ByDateRow = ProgressSummary["byDate"][number];

/** Paylaşım kartı verisi — progress/summary yanıtından türetilir (yeni API çağrısı yok) */
export function buildShareStats(summary: ProgressSummary): ShareStats {
  const logged = summary.byDate.filter((d) => d.kcal > 0);
  const avg = (sel: (d: ByDateRow) => number) =>
    logged.length ? logged.reduce((a, d) => a + sel(d), 0) / logged.length : 0;
  const target = summary.targets?.calories ?? null;

  // En iyi gün: hedef varsa kaloriyi hedefe en yakın tutulan gün, yoksa en yüksek kalorili gün
  let bestDay: ShareStats["bestDay"] = null;
  if (logged.length > 0) {
    const best = target
      ? logged.reduce((m, d) => (Math.abs(d.kcal - target) < Math.abs(m.kcal - target) ? d : m))
      : logged.reduce((m, d) => (d.kcal > m.kcal ? d : m));
    bestDay = { date: best.date, kcal: best.kcal };
  }

  const dates = summary.byDate.map((d) => d.date);
  return {
    streak: summary.summary.streak,
    adherencePct: summary.summary.adherencePct,
    avgCalories: Math.round(summary.summary.avgCalories),
    avgProtein: Math.round(avg((d) => d.protein)),
    avgCarbs: Math.round(avg((d) => d.carbs)),
    avgFat: Math.round(avg((d) => d.fat)),
    from: dates[0] ?? "",
    to: dates[dates.length - 1] ?? "",
    bestDay,
  };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke: string = C.glassStroke) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = C.glass;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** 1080×1350 paylaşım kartını canvas'a çizer */
export function drawShareCard(canvas: HTMLCanvasElement, stats: ShareStats, dict: Dictionary, locale: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const lang = locale === "en" ? "en-US" : "tr-TR";
  const nf = new Intl.NumberFormat(lang);
  const dayFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });
  const fmtDay = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? iso : dayFmt.format(d);
  };

  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.save();
  rr(ctx, 0, 0, CARD_W, CARD_H, 72);
  ctx.clip();

  // Zemin: derin yeşil dikey gradyan
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, C.bgTop);
  bg.addColorStop(0.55, C.bgMid);
  bg.addColorStop(1, C.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Cam parıltıları (glassmorphism)
  const glow = (cx: number, cy: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  glow(950, 120, 430, C.glowGreen);
  glow(90, 1290, 400, C.glowTeal);

  // Üst şerit çizgisi
  const line = ctx.createLinearGradient(88, 0, 992, 0);
  line.addColorStop(0, "rgba(74,222,128,0)");
  line.addColorStop(0.5, "rgba(74,222,128,0.55)");
  line.addColorStop(1, "rgba(74,222,128,0)");
  ctx.fillStyle = line;
  ctx.fillRect(88, 92, 904, 3);

  // Marka + hafta aralığı
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.white;
  ctx.font = `800 88px ${FONT_STACK}`;
  ctx.fillText("KaloriAI", 88, 196);
  const brandW = ctx.measureText("KaloriAI").width;
  ctx.beginPath();
  ctx.arc(88 + brandW + 26, 170, 13, 0, Math.PI * 2);
  ctx.fillStyle = C.green;
  ctx.fill();

  ctx.textAlign = "right";
  ctx.fillStyle = C.dim;
  ctx.font = `600 34px ${FONT_STACK}`;
  ctx.fillText(stats.from && stats.to ? `${fmtDay(stats.from)} – ${fmtDay(stats.to)}` : "", 992, 168);

  ctx.textAlign = "left";
  ctx.fillStyle = C.dimmer;
  ctx.font = `400 34px ${FONT_STACK}`;
  ctx.fillText(dict.shareCard.sub, 88, 252);

  // 3 hero istatistik
  const heroY = 316;
  const heroH = 268;
  const heroW = 274;
  const heroGap = 27;
  const heroX = (i: number) => 88 + i * (heroW + heroGap);
  const heroes = [
    { value: nf.format(stats.streak), unit: "", label: dict.progress.streakTitle, color: C.amber },
    { value: nf.format(stats.adherencePct), unit: "%", label: dict.progress.adherencePct, color: C.green },
    { value: nf.format(stats.avgCalories), unit: " kcal", label: dict.progress.avgCalories, color: C.greenSoft },
  ];
  heroes.forEach((h, i) => {
    const px = heroX(i);
    glassPanel(ctx, px, heroY, heroW, heroH, 36);
    rr(ctx, px + 36, heroY + 42, 64, 10, 5);
    ctx.fillStyle = h.color;
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.font = `800 76px ${FONT_STACK}`;
    ctx.fillText(h.value, px + 36, heroY + 168);
    if (h.unit) {
      const vw = ctx.measureText(h.value).width;
      ctx.fillStyle = C.dim;
      ctx.font = `600 32px ${FONT_STACK}`;
      ctx.fillText(h.unit, px + 36 + vw + 8, heroY + 168);
    }
    ctx.fillStyle = C.dim;
    ctx.font = `500 29px ${FONT_STACK}`;
    ctx.fillText(h.label, px + 36, heroY + 226);
  });

  // Makro barları
  const macY = 628;
  const macH = 372;
  glassPanel(ctx, 88, macY, 904, macH, 40);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `700 34px ${FONT_STACK}`;
  ctx.fillText(dict.progress.macrosChart, 128, macY + 68);

  const macros = [
    { label: dict.onboarding.protein, value: stats.avgProtein, color: C.green },
    { label: dict.onboarding.carbs, value: stats.avgCarbs, color: C.amber },
    { label: dict.onboarding.fat, value: stats.avgFat, color: C.teal },
  ];
  const maxMacro = Math.max(...macros.map((m) => m.value), 1);
  macros.forEach((m, i) => {
    const rowY = macY + 128 + i * 78;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `600 31px ${FONT_STACK}`;
    ctx.fillText(m.label, 128, rowY + 26);
    ctx.textAlign = "right";
    ctx.fillStyle = C.white;
    ctx.font = `700 31px ${FONT_STACK}`;
    ctx.fillText(`${nf.format(m.value)} ${dict.common.g}`, 952, rowY + 26);
    ctx.textAlign = "left";
    rr(ctx, 128, rowY + 40, 824, 16, 8);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    const fillW = Math.max(16, Math.round((m.value / maxMacro) * 824));
    if (m.value > 0) {
      rr(ctx, 128, rowY + 40, fillW, 16, 8);
      ctx.fillStyle = m.color;
      ctx.fill();
    }
  });

  // En iyi gün
  if (stats.bestDay) {
    const bdY = 1044;
    const bdH = 148;
    glassPanel(ctx, 88, bdY, 904, bdH, 40, "rgba(251, 191, 36, 0.38)");
    ctx.fillStyle = C.amber;
    ctx.font = `700 62px ${FONT_STACK}`;
    ctx.fillText("★", 132, bdY + 100);
    ctx.fillStyle = C.dim;
    ctx.font = `500 29px ${FONT_STACK}`;
    ctx.fillText(dict.shareCard.bestDay, 226, bdY + 58);
    ctx.fillStyle = C.white;
    ctx.font = `700 42px ${FONT_STACK}`;
    ctx.fillText(`${fmtDay(stats.bestDay.date)} · ${nf.format(stats.bestDay.kcal)} ${dict.common.kcal}`, 226, bdY + 114);
  }

  // Alt bilgi
  ctx.textAlign = "center";
  ctx.fillStyle = C.dimmer;
  ctx.font = `500 28px ${FONT_STACK}`;
  ctx.fillText(`KaloriAI · ${dict.meta.tagline}`, CARD_W / 2, 1286);

  ctx.restore();
}

/** İlerleme ekranından açılan paylaşım kartı diyaloğu — canlı canvas önizleme + PNG indirme / paylaşma */
export function ShareCardDialog({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  summary: ProgressSummary;
}) {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => buildShareStats(summary), [summary]);
  const fileName = `kaloriai-hafta-${stats.from}_${stats.to}.png`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Radix portal içeriği (DialogContent) parent effect'inden SONRA mount olur —
  // open flip olduğunda canvasRef hâlâ null olur. Bu yüzden çizim, node eklenirken
  // garanti çalışacak şekilde callback ref'e bağlıyor; effect yalnızca açıkken
  // veri/dil değişimlerinde yeniden çizim için.
  const attachCanvas = useCallback(
    (c: HTMLCanvasElement | null) => {
      canvasRef.current = c;
      if (c && open) {
        try {
          drawShareCard(c, stats, dict, locale);
        } catch (e) {
          console.error("[share-card] draw failed:", e);
        }
      }
    },
    [open, stats, dict, locale]
  );

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    try {
      drawShareCard(c, stats, dict, locale);
    } catch (e) {
      console.error("[share-card] draw failed:", e);
    }
  }, [open, stats, dict, locale]);

  const download = () => {
    const c = canvasRef.current;
    if (!c) return;
    try {
      c.toBlob((blob) => {
        if (!blob) {
          toast({ description: dict.common.error, variant: "destructive" });
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    } catch {
      toast({ description: dict.common.error, variant: "destructive" });
    }
  };

  const share = async () => {
    const c = canvasRef.current;
    if (!c) return;
    setBusy(true);
    c.toBlob(async (blob) => {
      try {
        if (!blob) throw new Error("blob");
        const file = new File([blob], fileName, { type: "image/png" });
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: dict.shareCard.title, text: dict.shareCard.sub });
        } else {
          download(); // Native paylaşım yok → indirmeye düş
        }
      } catch (e) {
        // Kullanıcı paylaşımı iptal ederse (AbortError) sessizce geç
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          toast({ description: dict.common.error, variant: "destructive" });
        }
      } finally {
        setBusy(false);
      }
    }, "image/png");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" aria-describedby="share-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" aria-hidden />
            {dict.shareCard.title}
          </DialogTitle>
          <DialogDescription id="share-desc">{dict.shareCard.sub}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center" aria-busy={busy}>
          <canvas
            ref={attachCanvas}
            width={CARD_W}
            height={CARD_H}
            role="img"
            aria-label={dict.shareCard.title}
            className="aspect-[4/5] w-[270px] max-w-full rounded-2xl border shadow-lg"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="min-h-[44px]" onClick={download}>
            <Download className="h-4 w-4" aria-hidden />
            {dict.shareCard.download}
          </Button>
          {canShare && (
            <Button className="min-h-[44px]" onClick={() => void share()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
              {dict.shareCard.share}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
