import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * (userId, date) üzerinde yarış koşullarına dayanıklı BodyMeasurement upsert'i.
 * Aynı güne zaten ölçüm varsa create P2002 fırlatır (partial update + 500);
 * bu yardımcı var olan satırı günceller, yoksa güvenle oluşturur.
 * Gönderilmeyen alanlar eski değeri korur (undefined → Prisma dokunmaz).
 */
export async function upsertMeasurement(
  userId: string,
  date: string,
  data: {
    weightKg?: number | null
    bodyFatPct?: number | null
    waistCm?: number | null
    armCm?: number | null
    chestCm?: number | null
    hipCm?: number | null
    note?: string | null
  }
) {
  const existing = await db.bodyMeasurement.findFirst({ where: { userId, date } })
  if (existing) return db.bodyMeasurement.update({ where: { id: existing.id }, data })
  try {
    return await db.bodyMeasurement.create({ data: { userId, date, ...data } })
  } catch (e) {
    // eşzamanlı çift create → @@unique([userId, date]) devreye girer → güncellemeye düş
    if ((e as { code?: string })?.code === 'P2002') {
      const dupe = await db.bodyMeasurement.findFirst({ where: { userId, date } })
      if (dupe) return db.bodyMeasurement.update({ where: { id: dupe.id }, data })
    }
    throw e
  }
}