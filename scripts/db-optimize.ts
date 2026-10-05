/**
 * KaloriAI — SQLite performans bakımı (yayın öncesi / periyodik)
 * Run: bun scripts/db-optimize.ts
 *
 * 1) ANALYZE  → sorgu planlayıcı istatistiklerini tazeler (PRAGMA optimize)
 * 2) VACUUM   → dosya fragmantasyonunu giderir
 * 3) wal_checkpoint(TRUNCATE) → WAL'i sıfırlar (varsa)
 */
import { Database } from "bun:sqlite";
import { statSync } from "fs";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "db/custom.db";

const sizeOf = (p: string) => {
  try {
    return `${(statSync(p).size / 1024).toFixed(0)} KB`;
  } catch {
    return "?";
  }
};

console.log(`DB: ${dbPath} — başlangıç boyutu ${sizeOf(dbPath)}`);

const raw = new Database(dbPath);

console.log("journal_mode:", raw.query("PRAGMA journal_mode = WAL").get());
raw.query("PRAGMA wal_checkpoint(TRUNCATE)").run();
raw.query("PRAGMA optimize").run();
console.log("PRAGMA optimize + WAL checkpoint: ✓");

raw.close();

const vacuum = new Database(dbPath);
vacuum.query("VACUUM").run();
vacuum.close();
console.log(`VACUUM: ✓ — son boyut ${sizeOf(dbPath)}`);

const check = new Database(dbPath, { readonly: true });
console.log("integrity:", check.query("PRAGMA integrity_check").get());
check.close();
console.log("✅ Bakım tamam");
