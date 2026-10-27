"use client";

import { useEffect, useRef, useState } from "react";

/** easeOutCubic — hızlı kalkış, yumuşak iniş (yay benzeri his, doğrusal değil). */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Sayıyı animasyonla hedefe taşır: ilk mount'ta 0'dan, sonraki hedef
 * değişimlerinde mevcut değerden yeni değere rAF ile akar.
 * prefers-reduced-motion etkinse animasyonsuz doğrudan hedefi döndürür.
 * Unmount'ta rAF iptal edilir. Harici bağımlılık yok.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [display, setDisplay] = useState(0);
  // Son animasyonlu değer — hedef değişince akış buradan devam eder.
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      // Azaltılmış hareket / geçersiz süre / zaten hedefte → anında otur.
      if (reduced || durationMs <= 0 || from === target) {
        fromRef.current = target;
        setDisplay(target);
        rafRef.current = null;
        return;
      }
      const t = Math.min((now - start) / durationMs, 1);
      const value = from + (target - from) * easeOutCubic(t);
      fromRef.current = value;
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setDisplay(target);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [target, durationMs]);

  return display;
}
