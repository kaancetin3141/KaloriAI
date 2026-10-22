"use client";

import { api, ApiError } from "@/lib/api";

/**
 * Uzun süren AI işlerini "kısa istek + yoklama (polling)" akışıyla çalıştırır.
 *
 * Neden: Önizleme/ağ geçidi zincirindeki ara proxy'ler, uzun süre veri akmayan
 * istekleri kestiği için senkron AI çağrıları (3-15 sn) istemcide
 * "TypeError: Failed to fetch" → "Bağlantı hatası" üretiyordu. Artık POST
 * <1 sn içinde jobId döndürür; sonuç kısa GET istekleriyle alınır.
 *
 * Tolerans: Mobil şebeke dalgalanmasında tek tek yoklama istekleri başarısız
 * olabilir — arka arkaya MAX_CONSECUTIVE_ERRORS kadar ağ hatası ancak o zaman
 * hataya düşer (ApiError olanlar — kota, bulunamadı vb. — anında yükseltilir).
 */

export interface AiJobStart {
  ok: boolean;
  jobId?: string;
  analysisId?: string;
  status?: string;
}

const POLL_INTERVAL_MS = 1200;
/** Toplam bekleme üst sınırı — aşılırsa AI_TIMEOUT fırlatılır. */
const POLL_DEADLINE_MS = 100_000;
/** Arka arkaya tolerans göstereceğimiz ağ hatası sayısı. */
const MAX_CONSECUTIVE_ERRORS = 4;

export async function runAiJob<T>(
  path: string,
  init: { form?: FormData; body?: unknown } = {},
  onPending?: () => void
): Promise<T> {
  const started = await api<AiJobStart>(path, {
    method: "POST",
    form: init.form,
    body: init.body,
    timeoutMs: 30_000,
  });

  const jobId = started.jobId ?? started.analysisId;
  if (!jobId) {
    // Uç nokta henüz job döndürmüyorsa (geriye dönük uyumluluk) sonucu aynen geç.
    return started as T;
  }

  const deadline = Date.now() + POLL_DEADLINE_MS;
  let consecutiveErrors = 0;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const res = await api<{ ok: boolean; status?: string }>(
        `${path}?id=${encodeURIComponent(jobId)}`,
        { timeoutMs: 20_000 }
      );
      consecutiveErrors = 0;
      if (res.status === "pending") {
        onPending?.();
        continue;
      }
      if (res.status === "done") return res as T;
      // "error" statusu normalde ApiError olarak gelir; buraya düşerse genel hata.
      throw new ApiError("AI_FAILED", 502);
    } catch (e) {
      if (e instanceof ApiError) throw e; // kota / bulunamadı / AI hatası → yukarı
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) throw e; // ağ gerçekten kopuk
    }
  }
  throw new ApiError("AI_TIMEOUT", 504);
}
