import { ApiError } from "@/lib/auth";

/**
 * AI iş kuyruğu (in-memory job registry).
 *
 * Sorun: analyze-photo / parse-text / coach uç noktaları AI turu bitene kadar
 * (3-15 sn) bağlantıyı açık tutuyordu. Önizleme/ağ geçidi zincirindeki ara
 * proxy'ler uzun süre veri akmayan istekleri kestiği için istemci
 * "TypeError: Failed to fetch" alıyordu → kullanıcıya "Bağlantı hatası" gidiyordu.
 *
 * Çözüm: POST artık işi arka plana atayıp <1 sn içinde jobId döndürür; istemci
 * kısa GET istekleriyle yoklama yapar. Hiçbir HTTP isteği uzun sürmez.
 *
 * Not: Tek Node sürecinde (VDS) çalışır; süreç yeniden başlarsa bekleyen işler
 * düşer ve istemci JOB_NOT_FOUND alarak net bir hata görür (sessiz takılmaz).
 */

export type AiJobStatus = "pending" | "done" | "error";

interface AiJobState {
  userId: string;
  status: AiJobStatus;
  result?: unknown;
  error?: string;
  errorStatus?: number;
  createdAt: number;
}

const jobs = new Map<string, AiJobState>();

/** Tamamlanan iş kaydının ömrü — bellek şişmesin. */
const JOB_TTL_MS = 10 * 60 * 1000;
/** Bu süreden hâlâ "pending" olan iş takılmış sayılır (süreç yeniden başlamış vb.). */
const JOB_STALE_MS = 3 * 60 * 1000;

function sweep(): void {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

/** Yeni iş başlatır ve jobId döndürür. */
export function createAiJob(userId: string): string {
  sweep();
  const id = crypto.randomUUID();
  jobs.set(id, { userId, status: "pending", createdAt: Date.now() });
  return id;
}

/** jobId'yi doğrular (sahiplik kontrolü dahil). Süresi geçen pending işleri hata yapar. */
export function getAiJob(jobId: string, userId: string): AiJobState | null {
  const j = jobs.get(jobId);
  if (!j || j.userId !== userId) return null;
  if (j.status === "pending" && Date.now() - j.createdAt > JOB_STALE_MS) {
    j.status = "error";
    j.error = "AI_TIMEOUT";
    j.errorStatus = 504;
  }
  return j;
}

function completeAiJob(jobId: string, result: unknown): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.status = "done";
  j.result = result;
}

function failAiJob(jobId: string, error: string, errorStatus = 502): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.status = "error";
  j.error = error;
  j.errorStatus = errorStatus;
}

/**
 * Ateşle ve unut: fn'in döndürdüğü değer iş sonucu olur; fırlatılan ApiError
 * kodu/statusu korunur. Hata asla Node sürecini düşürmez.
 */
export function startAiJob(jobId: string, fn: () => Promise<unknown>): void {
  void fn()
    .then((result) => completeAiJob(jobId, result))
    .catch((e) => {
      console.error(`[ai-job] ${jobId} başarısız:`, e);
      if (e instanceof ApiError) failAiJob(jobId, e.message, e.status);
      else failAiJob(jobId, "AI_FAILED", 502);
    });
}
