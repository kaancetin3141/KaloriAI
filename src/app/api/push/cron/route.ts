import { runReminderScan, schedulerStatus } from "@/lib/scheduler";
import { ApiError, errorResponse } from "@/lib/auth";

/**
 * Dış tetikleme yalnızca CRON_SECRET ile: fail-closed.
 * Uygulama içindeki zamanlayıcı (scheduler.ts setInterval) hatırlatıcıları
 * zaten her dakika otomatik tarar; bu uç yalnızca harici cron/pinger içindir.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed — sıratanın ayarlanması beklenir
  return req.headers.get("x-cron-secret") === secret;
}

/** GET /api/push/cron — scheduler status (running, tz, last scan result) */
export async function GET(req: Request) {
  if (!authorized(req)) throw new ApiError("UNAUTHORIZED", 401);
  return Response.json(schedulerStatus());
}

/** POST /api/push/cron — trigger a due-reminder scan (external cron friendly) */
export async function POST(req: Request) {
  try {
    if (!authorized(req)) throw new ApiError("UNAUTHORIZED", 401);
    const result = await runReminderScan();
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
