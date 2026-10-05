/**
 * Apple Health (HealthKit) export parser — SERVER ONLY.
 *
 * Accepts the official "Export All Health Data" artifact:
 *  - export.zip  (contains apple_health_export/export.xml)
 *  - export.xml  (raw HealthKit XML)
 *
 * Extracts (regex-based — the HealthKit XML is machine generated, flat and
 * attribute-complete, which makes a full DOM parser unnecessary):
 *  - HKQuantityTypeIdentifierBodyMass          → daily weight (kg)
 *  - HKQuantityTypeIdentifierBodyFatPercentage → daily body fat (%)
 *  - HKQuantityTypeIdentifierStepCount         → daily step totals
 *  - HKWorkout                                 → workouts (type/duration/energy)
 */
import { unzipSync } from "fflate";

export interface AhMetric {
  date: string; // YYYY-MM-DD
  value: number;
}
export interface AhWorkout {
  date: string; // YYYY-MM-DD
  type: string; // app workout type
  durationMin: number;
  kcal: number | null;
}
export interface AhParseResult {
  mass: AhMetric[]; // one entry per record (multiple per day possible — latest wins)
  bodyFat: AhMetric[]; // percent 0-100
  stepsByDay: Map<string, number>;
  workouts: AhWorkout[];
  dateFrom: string | null;
  dateTo: string | null;
}

const MAX_RECORDS = 200_000; // hard cap — Apple exports of multi-year users can be huge

/** "2026-01-15 08:30:00 +0300" → "2026-01-15" */
function recordDate(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v.trim());
  return m ? (m[1] as string) : null;
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}="([^"]*)"`);
  return re.exec(tag)?.[1];
}

/** Map HKWorkoutActivityType → app workout type */
export function mapWorkoutType(hkType: string): string {
  const t = hkType.replace(/^HKWorkoutActivityType/, "").toLowerCase();
  if (["functionalstrengthtraining", "traditionalstrengthtraining", "strengthtraining"].includes(t)) return "strength";
  if (t === "highintensityintervaltraining") return "hiit";
  if (t === "soccer") return "football";
  if (["hiking", "stairclimbing"].includes(t)) return "walking";
  if (t === "flexibility" || t === "pilates" || t === "mindandbody") return "yoga";
  if (["running", "walking", "cycling", "swimming", "yoga", "football", "basketball"].includes(t)) return t;
  return "other";
}

/** Energy to kcal (HealthKit may export kcal, cal or kJ) */
function toKcal(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const u = (unit ?? "kcal").toLowerCase();
  if (u === "kj") return Math.round(value / 4.184);
  if (u === "cal" || u === "calories") return Math.round(value / 1000);
  return Math.round(value); // kcal
}

function parseXml(xml: string): AhParseResult {
  const mass: AhMetric[] = [];
  const bodyFat: AhMetric[] = [];
  const stepsByDay = new Map<string, number>();
  const workouts: AhWorkout[] = [];
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let processed = 0;

  const track = (d: string | null) => {
    if (!d) return;
    if (!dateFrom || d < dateFrom) dateFrom = d;
    if (!dateTo || d > dateTo) dateTo = d;
  };

  // <Record ... /> and <Workout .../> (some exports use explicit closing tags)
  const tagRe = /<(Record|Workout)\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    if (processed >= MAX_RECORDS) break;
    const kind = m[1] as string;
    const attrs = m[2] ?? "";
    processed++;

    if (kind === "Workout") {
      const date = recordDate(attr(attrs, "startDate"));
      track(date);
      if (!date) continue;
      const duration = parseFloat(attr(attrs, "duration") ?? "0");
      const durUnit = (attr(attrs, "durationUnit") ?? "min").toLowerCase();
      const durationMin = durUnit === "min" || durUnit === "minute" || durUnit === ""
        ? Math.round(duration)
        : Math.round(durUnit === "hr" || durUnit === "hour" ? duration * 60 : duration);
      if (durationMin <= 0 || durationMin > 1440) continue;
      workouts.push({
        date,
        type: mapWorkoutType(attr(attrs, "workoutActivityType") ?? ""),
        durationMin,
        kcal: toKcal(parseFloat(attr(attrs, "totalEnergyBurned") ?? "0"), attr(attrs, "totalEnergyBurnedUnit")),
      });
      continue;
    }

    const type = attr(attrs, "type") ?? "";
    const date = recordDate(attr(attrs, "startDate") ?? attr(attrs, "endDate"));
    const rawValue = parseFloat(attr(attrs, "value") ?? "");
    if (!date || !Number.isFinite(rawValue)) continue;

    if (type === "HKQuantityTypeIdentifierBodyMass") {
      track(date);
      const unit = (attr(attrs, "unit") ?? "kg").toLowerCase();
      const kg = unit === "lb" ? rawValue * 0.45359237 : unit === "stone" ? rawValue * 6.35029318 : rawValue;
      if (kg > 20 && kg < 400) mass.push({ date, value: Math.round(kg * 10) / 10 });
    } else if (type === "HKQuantityTypeIdentifierBodyFatPercentage") {
      track(date);
      // HealthKit exports body fat as a fraction (0.15 = 15%)
      const pct = rawValue <= 1 ? rawValue * 100 : rawValue;
      if (pct >= 1 && pct < 80) bodyFat.push({ date, value: Math.round(pct * 10) / 10 });
    } else if (type === "HKQuantityTypeIdentifierStepCount") {
      track(date);
      stepsByDay.set(date, (stepsByDay.get(date) ?? 0) + Math.round(rawValue));
    }
  }

  // Clamp absurd step aggregates (bad device data)
  for (const [d, c] of stepsByDay) {
    if (c < 0 || c > 200_000) stepsByDay.delete(d);
  }
  return { mass, bodyFat, stepsByDay, workouts, dateFrom, dateTo };
}

/** Latest value per day (HealthKit can log several records per day) */
export function latestPerDay(records: AhMetric[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) map.set(r.date, r.value); // records arrive in file order → last wins
  return map;
}

/**
 * Extract the HealthKit XML from an uploaded file.
 * Accepts .zip (official export) or .xml directly.
 */
export async function extractHealthXml(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".zip") || buf[0] === 0x50 /* PK zip magic */) {
    const files = unzipSync(buf, { filter: (f) => f.name.endsWith(".xml") && !f.name.includes("__MACOSX") });
    const key =
      Object.keys(files).find((k) => k.endsWith("export.xml")) ??
      Object.keys(files).find((k) => k.toLowerCase().includes("health")) ??
      Object.keys(files)[0];
    if (!key) throw new Error("NO_XML_IN_ZIP");
    return new TextDecoder().decode(files[key] as Uint8Array);
  }
  return new TextDecoder().decode(buf);
}

/** Parse an Apple Health export file into importable structures */
export async function parseAppleHealthFile(file: File): Promise<AhParseResult> {
  const xml = await extractHealthXml(file);
  if (!xml.includes("HealthKit") && !xml.includes("<Record")) throw new Error("NOT_HEALTH_EXPORT");
  return parseXml(xml);
}
