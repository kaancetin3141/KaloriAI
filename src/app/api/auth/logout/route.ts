import { destroySession, errorResponse } from "@/lib/auth";

export async function POST() {
  try {
    await destroySession();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
