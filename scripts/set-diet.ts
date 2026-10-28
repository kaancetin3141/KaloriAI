import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const diet = process.argv[2] || "any";
async function main() {
  const u = await db.user.findUnique({ where: { email: "kaan@demo.kaloriai.app" }, select: { id: true } });
  if (!u) throw new Error("demo user not found");
  await db.profile.update({ where: { userId: u.id }, data: { dietPreference: diet } });
  const p = await db.profile.findUnique({ where: { userId: u.id }, select: { dietPreference: true } });
  console.log("dietPreference =", p?.dietPreference);
}
main().finally(() => db.$disconnect());
