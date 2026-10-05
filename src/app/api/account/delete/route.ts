import { db } from "@/lib/db";
import { requireUser, destroySession, errorResponse } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";

/** DELETE /api/account/delete — KVKK/GDPR right to erasure */
export async function DELETE() {
  try {
    const user = await requireUser();
    // remove uploaded files
    const uploadDir = path.join(process.cwd(), "upload", "ai", user.id);
    await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    await destroySession();
    // cascade deletes all related rows
    await db.user.delete({ where: { id: user.id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
