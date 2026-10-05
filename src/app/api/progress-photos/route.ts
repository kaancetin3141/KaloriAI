import { z } from "zod";
import { db } from "@/lib/db";
import { localDateStr } from "@/lib/calculations";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const UPLOAD_ROOT = path.join(process.cwd(), "upload");

export async function GET() {
  try {
    const user = await requireUser();
    const photos = await db.progressPhoto.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 60,
    });
    return Response.json({ photos });
  } catch (e) {
    return errorResponse(e);
  }
}

const formSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    // premium gate
    const sub = await db.subscription.findUnique({ where: { userId: user.id } });
    const premium =
      sub?.tier === "premium" &&
      (!sub.cancelledAt || (sub.renewsAt && sub.renewsAt > new Date()) || (sub.trialEndsAt && sub.trialEndsAt > new Date()));
    if (!premium) throw new ApiError("PREMIUM_REQUIRED", 402);

    const form = await req.formData();
    const file = form.get("image");
    const note = (form.get("note") as string) || null;
    const date = (form.get("date") as string) || localDateStr();
    if (!formSchema.safeParse({ date }).success) throw new ApiError("VALIDATION", 400);
    if (!(file instanceof File)) throw new ApiError("VALIDATION", 400);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new ApiError("FILE_TYPE", 415);
    if (file.size > 10 * 1024 * 1024) throw new ApiError("FILE_TOO_LARGE", 413);

    const buf = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(buf).rotate().resize(900, 1200, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    const dir = path.join(UPLOAD_ROOT, "progress", user.id);
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${Date.now()}.jpg`;
    await fs.writeFile(path.join(dir, fileName), compressed);

    const photo = await db.progressPhoto.create({
      data: { userId: user.id, date, note, imagePath: `progress/${user.id}/${fileName}` },
    });
    return Response.json({ ok: true, photo, imageUrl: `/api/files/${photo.imagePath}` });
  } catch (e) {
    return errorResponse(e);
  }
}
