import webpush from "web-push";
import { db } from "@/lib/db";

/** Web-push (VAPID) configuration — keys come from environment, never bundled to the client */
let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_CONTACT ?? "mailto:support@kaloriai.app", pub, priv);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/** Send a payload to every endpoint of a user; prunes endpoints the push service reports as gone */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 };
  const endpoints = await db.pushEndpoint.findMany({ where: { userId } });
  if (endpoints.length === 0) return { sent: 0, pruned: 0 };

  let sent = 0;
  let pruned = 0;
  await Promise.all(
    endpoints.map(async (ep) => {
      try {
        await webpush.sendNotification(
          { endpoint: ep.endpoint, keys: { p256dh: ep.p256dh, auth: ep.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = subscription gone → prune so dead endpoints don't pile up
        if (status === 404 || status === 410) {
          await db.pushEndpoint.delete({ where: { id: ep.id } }).catch(() => {});
          pruned += 1;
        }
      }
    })
  );
  return { sent, pruned };
}
