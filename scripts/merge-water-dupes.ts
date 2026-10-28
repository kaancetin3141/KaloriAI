/**
 * KaloriAI — WaterLog mükerrer satır birleştirme migrasyonu.
 *
 * WaterLog'a @@unique([userId, date]) eklemeden ÖNCE çalıştırılır:
 * eski find→create yarışından doğan aynı güne ait çoklu satırlar
 * toplanıp tek satırda birleştirilir (kullanıcı niyetine en yakın değer:
 * her dokunuşun toplama katkısı). SQLite unique index, mükerrer satır
 * varken oluşturulamadığı için bu adım zorunludur.
 *
 * Kullanım: bun run scripts/merge-water-dupes.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const dupes = await db.waterLog.groupBy({
    by: ["userId", "date"],
    having: { id: { _count: { gt: 1 } } },
    _count: { id: true },
  });
  console.log(`[merge-water] ${dupes.length} gün mükerrer satır içeriyor.`);

  let merged = 0;
  for (const g of dupes) {
    const rows = await db.waterLog.findMany({
      where: { userId: g.userId, date: g.date },
      orderBy: { createdAt: "asc" },
    });
    const total = Math.max(0, rows.reduce((a, r) => a + r.ml, 0));
    // ilk satırda birleştir, kalanları sil
    const [keep, ...rest] = rows;
    await db.$transaction([
      db.waterLog.update({ where: { id: keep.id }, data: { ml: total } }),
      ...rest.map((r) => db.waterLog.delete({ where: { id: r.id } })),
    ]);
    merged++;
    console.log(`[merge-water] ${g.userId} ${g.date}: ${rows.length} satır → ${total} ml`);
  }
  console.log(`[merge-water] tamam: ${merged} gün birleştirildi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
