import { NextResponse } from "next/server";

// KaloriAI — hafif sağlık ucu (Liveness probe)
// Ana sayfa derlemesini tetiklemeden sürecin ayakta olduğunu doğrular.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "kaloriai",
    port: 3003,
    db: "kaloriai@postgresql-17",
    at: new Date().toISOString(),
  });
}
