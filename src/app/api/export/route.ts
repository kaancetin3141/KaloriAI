import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth";

/** GET /api/export?format=json|csv — KVKK/GDPR data portability */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const format = new URL(req.url).searchParams.get("format") || "json";
    const [profile, targets, logs, water, workouts, measurements] = await Promise.all([
      db.profile.findUnique({ where: { userId: user.id } }),
      db.targets.findUnique({ where: { userId: user.id } }),
      db.mealLog.findMany({
        where: { userId: user.id, isTemplate: false, deletedAt: null },
        include: { items: true },
        orderBy: { date: "asc" },
      }),
      db.waterLog.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } }),
      db.workout.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } }),
      db.bodyMeasurement.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } }),
    ]);

    if (format === "csv") {
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = ["date,meal,item,grams,kcal,protein,carbs,fat,fiber"];
      for (const log of logs) {
        for (const i of log.items) {
          rows.push(
            [log.date, log.mealType, esc(i.name), i.grams, Math.round(i.kcal), Math.round(i.protein), Math.round(i.carbs), Math.round(i.fat), Math.round(i.fiber)].join(",")
          );
        }
      }
      return new Response("\uFEFF" + rows.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="kaloriai-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return new Response(
      JSON.stringify(
        { exportedAt: new Date().toISOString(), profile, targets, mealLogs: logs, waterLogs: water, workouts, bodyMeasurements: measurements },
        null,
        2
      ),
      {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="kaloriai-export-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      }
    );
  } catch (e) {
    return errorResponse(e);
  }
}
