/**
 * KaloriAI — Pre-launch database integrity check
 * Run: bun scripts/db-check.ts
 */
import { Database } from "bun:sqlite";

const db = new Database(process.env.DATABASE_URL?.replace("file:", "") ?? "db/custom.db", { readonly: true });

const q = (sql: string): unknown => db.query(sql).all();
const q1 = (sql: string): unknown => db.query(sql).get();

console.log("=== 1. INTEGRITY CHECK ===");
console.log(db.query("PRAGMA integrity_check").get());

console.log("\n=== 2. FOREIGN KEY CHECK (violations) ===");
const fk = q("PRAGMA foreign_key_check") as unknown[];
console.log(fk.length === 0 ? "OK — 0 violations" : fk);

console.log("\n=== 3. TABLE ROW COUNTS ===");
const tables = (q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'") as { name: string }[]).map(t => t.name).sort();
for (const t of tables) {
  const c = (q1(`SELECT COUNT(*) as n FROM "${t}"`) as { n: number }).n;
  console.log(`${t.padEnd(22)} ${c}`);
}

console.log("\n=== 4. ORPHAN CHECKS (child rows without parent) ===");
const orphanChecks: [string, string][] = [
  ["Session → User", "SELECT COUNT(*) n FROM Session WHERE userId NOT IN (SELECT id FROM User)"],
  ["Profile → User", "SELECT COUNT(*) n FROM Profile WHERE userId NOT IN (SELECT id FROM User)"],
  ["Targets → User", "SELECT COUNT(*) n FROM Targets WHERE userId NOT IN (SELECT id FROM User)"],
  ["MealLog → User", "SELECT COUNT(*) n FROM MealLog WHERE userId NOT IN (SELECT id FROM User)"],
  ["MealLogItem → MealLog", "SELECT COUNT(*) n FROM MealLogItem WHERE logId NOT IN (SELECT id FROM MealLog)"],
  ["Workout → User", "SELECT COUNT(*) n FROM Workout WHERE userId NOT IN (SELECT id FROM User)"],
  ["WaterLog → User", "SELECT COUNT(*) n FROM WaterLog WHERE userId NOT IN (SELECT id FROM User)"],
  ["BodyMeasurement → User", "SELECT COUNT(*) n FROM BodyMeasurement WHERE userId NOT IN (SELECT id FROM User)"],
  ["ProgressPhoto → User", "SELECT COUNT(*) n FROM ProgressPhoto WHERE userId NOT IN (SELECT id FROM User)"],
  ["Favorite → User", "SELECT COUNT(*) n FROM Favorite WHERE userId NOT IN (SELECT id FROM User)"],
  ["Favorite → Food", "SELECT COUNT(*) n FROM Favorite WHERE foodId NOT IN (SELECT id FROM Food)"],
  ["StepsLog → User", "SELECT COUNT(*) n FROM StepsLog WHERE userId NOT IN (SELECT id FROM User)"],
  ["Subscription → User", "SELECT COUNT(*) n FROM Subscription WHERE userId NOT IN (SELECT id FROM User)"],
  ["UsageQuota → User", "SELECT COUNT(*) n FROM UsageQuota WHERE userId NOT IN (SELECT id FROM User)"],
  ["AiAnalysis → User", "SELECT COUNT(*) n FROM AiAnalysis WHERE userId NOT IN (SELECT id FROM User)"],
  ["AiChatMessage → User", "SELECT COUNT(*) n FROM AiChatMessage WHERE userId NOT IN (SELECT id FROM User)"],
  ["PlannerDay → User", "SELECT COUNT(*) n FROM PlannerDay WHERE userId NOT IN (SELECT id FROM User)"],
  ["FastingLog → User", "SELECT COUNT(*) n FROM FastingLog WHERE userId NOT IN (SELECT id FROM User)"],
  ["DailyNote → User", "SELECT COUNT(*) n FROM DailyNote WHERE userId NOT IN (SELECT id FROM User)"],
  ["Reminder → User", "SELECT COUNT(*) n FROM Reminder WHERE userId NOT IN (SELECT id FROM User)"],
  ["PushEndpoint → User", "SELECT COUNT(*) n FROM PushEndpoint WHERE userId NOT IN (SELECT id FROM User)"],
  ["Serving → Food", "SELECT COUNT(*) n FROM Serving WHERE foodId NOT IN (SELECT id FROM Food)"],
  ["RecipeItem → Recipe", "SELECT COUNT(*) n FROM RecipeItem WHERE recipeId NOT IN (SELECT id FROM Recipe)"],
  ["RecipeItem → Food", "SELECT COUNT(*) n FROM RecipeItem WHERE foodId NOT IN (SELECT id FROM Food)"],
];
let orphanTotal = 0;
for (const [label, sql] of orphanChecks) {
  const n = (q1(sql) as { n: number }).n;
  if (n > 0) { console.log(`❌ ${label}: ${n} orphans`); orphanTotal += n; }
}
if (orphanTotal === 0) console.log("OK — 0 orphans across all 24 relations");

console.log("\n=== 5. SESSION HYGIENE ===");
const expired = (q1("SELECT COUNT(*) n FROM Session WHERE expiresAt < datetime('now')") as { n: number }).n;
const total = (q1("SELECT COUNT(*) n FROM Session") as { n: number }).n;
const shortTokens = (q1("SELECT COUNT(*) n FROM Session WHERE length(token) < 32") as { n: number }).n;
console.log(`Total sessions: ${total}, expired: ${expired}, tokens <32 chars: ${shortTokens}`);

console.log("\n=== 6. PASSWORD HASH FORMAT (must be <32-hex-salt>:<128-hex-scrypt>) ===");
const badHashes = (q1("SELECT COUNT(*) n FROM User WHERE passwordHash NOT GLOB '[0-9a-f]*:[0-9a-f]*' OR length(passwordHash) < 160") as { n: number }).n;
const users = (q1("SELECT COUNT(*) n FROM User") as { n: number }).n;
console.log(`Users: ${users}, non-scrypt hashes: ${badHashes}`);

console.log("\n=== 7. DATA SANITY ===");
const badLogs = (q1("SELECT COUNT(*) n FROM MealLog WHERE date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'") as { n: number }).n;
const badMealType = (q1("SELECT COUNT(*) n FROM MealLog WHERE mealType NOT IN ('breakfast','lunch','dinner','snacks')") as { n: number }).n;
const badSteps = (q1("SELECT COUNT(*) n FROM StepsLog WHERE count < 0 OR count > 200000") as { n: number }).n;
const badWater = (q1("SELECT COUNT(*) n FROM WaterLog WHERE ml < 0 OR ml > 20000") as { n: number }).n;
const badWorkout = (q1("SELECT COUNT(*) n FROM Workout WHERE durationMin <= 0 OR durationMin > 1440 OR calories < 0") as { n: number }).n;
const badTargets = (q1("SELECT COUNT(*) n FROM Targets WHERE calories < 1200") as { n: number }).n;
const badFood = (q1("SELECT COUNT(*) n FROM Food WHERE kcal100 < 0 OR kcal100 > 900") as { n: number }).n;
console.log(`Bad log dates: ${badLogs}, bad mealTypes: ${badMealType}, bad steps: ${badSteps}, bad water: ${badWater}, bad workouts: ${badWorkout}, targets <1200kcal: ${badTargets}, bad food kcal: ${badFood}`);

console.log("\n=== 8. USER/PREMIUM OVERVIEW ===");
console.log(q("SELECT u.email, u.locale, s.tier FROM User u LEFT JOIN Subscription s ON s.userId = u.id"));

console.log("\n=== 9. INDEX COVERAGE (hot paths) ===");
const idx = q("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'") as { name: string; tbl_name: string }[];
console.log(`Total indexes: ${idx.length}`);
for (const hot of ["MealLog", "Workout", "WaterLog", "BodyMeasurement", "StepsLog"]) {
  const n = idx.filter(i => i.tbl_name === hot).length;
  console.log(`${hot}: ${n} index(es)`);
}

console.log("\n=== 10. FILE SIZE ===");
console.log(db.query("PRAGMA page_count").get(), db.query("PRAGMA page_size").get());

db.close();
console.log("\n✅ DB check complete");
