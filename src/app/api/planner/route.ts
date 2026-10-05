import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { localDateStr } from "@/lib/calculations";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_KEYS = ["breakfast", "lunch", "dinner", "snacks"] as const;

const itemSchema = z.object({
  name: z.string(),
  grams: z.number().nonnegative(),
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});

const dayPlanSchema = z.object({
  meals: z
    .array(
      z.object({
        mealType: z.string(),
        name: z.string().default(""),
        items: z.array(itemSchema),
      })
    )
    .min(1),
  totalKcal: z.number().nonnegative(),
  shoppingList: z.array(z.string()).default([]),
});

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locale: z.enum(["tr", "en"]).default("tr"),
  scope: z.enum(["day", "week"]).default("day"),
});

/** Monday of the ISO week containing d (local date math) */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toLocaleDateString("en-CA");
}

function weekDates(monday: string): string[] {
  const out: string[] = [];
  const d = new Date(`${monday}T12:00:00`);
  for (let i = 0; i < 7; i++) {
    out.push(d.toLocaleDateString("en-CA"));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Robust JSON extraction from LLM output with common-repair fallbacks */
function extractJson(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ApiError("AI_FAILED", 502);
  const slice = content.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    /* fall through to repairs */
  }
  let fixed = slice
    .replace(/[\u201c\u201d]/g, '"') // smart double quotes
    .replace(/[\u2018\u2019]/g, "'") // smart single quotes
    .replace(/,(\s*[}\]])/g, "$1") // trailing commas
    .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":'); // single-quoted keys
  try {
    return JSON.parse(fixed);
  } catch {
    /* more repairs */
  }
  // Unquoted string values after a key: "name":Ekmeği" / "mealType":lunch
  for (let i = 0; i < 3; i++) {
    fixed = fixed.replace(
      /("[A-Za-z_]+"\s*:\s*)([A-Za-zÀ-ÿÇçĞğİıÖöŞşÜü_][^"\{\[\}\],\n]*)([,\}\]\n])/g,
      (_m, p1: string, p2: string, p3: string) => `${p1}"${p2.trim()}"${p3}`
    );
    try {
      return JSON.parse(fixed);
    } catch {
      /* retry repair pass */
    }
  }
  throw new ApiError("AI_FAILED", 502);
}

async function requirePremium(userId: string) {
  const sub = await db.subscription.findUnique({ where: { userId } });
  const premium =
    sub?.tier === "premium" &&
    (!sub.cancelledAt ||
      (sub.renewsAt && sub.renewsAt > new Date()) ||
      (sub.trialEndsAt && sub.trialEndsAt > new Date()));
  if (!premium) throw new ApiError("PREMIUM_REQUIRED", 402);
}

/** POST /api/planner — premium: AI meal plan for a day or a whole week */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await requirePremium(user.id);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);
    const locale = parsed.data.locale;
    const lang = locale === "en" ? "English" : "Turkish";
    const weekScope = parsed.data.scope === "week";

    const [targets, profile] = await Promise.all([
      db.targets.findUnique({ where: { userId: user.id } }),
      db.profile.findUnique({ where: { userId: user.id } }),
    ]);
    if (!targets) throw new ApiError("NO_TARGETS", 400);

    const zai = await ZAI.create();

    let plans: Record<string, unknown> = {};
    let shoppingList: string[] = [];

    const weekSystemPrompt = `You are a weekly meal planner. Respond in ${lang} with ONLY valid JSON, no markdown, no comments. IMPORTANT: every JSON string value MUST be wrapped in double quotes. Create a 7-day meal plan (each day: breakfast, lunch, dinner, snacks) that fits the user's daily targets. Vary the meals across days, keep it realistic and repeatable. Prefer simple, common ${
      locale === "tr" ? "Turkish" : "local"
    } foods with realistic portions. Provide ONE merged shopping list for the whole week with estimated quantities.`;
    const weekUserPrompt = `Daily targets: ${targets.calories} kcal, P${targets.protein}/C${targets.carbs}/F${targets.fat}. Diet: ${
      profile?.dietPreference ?? "any"
    }. Allergens: ${profile?.allergens || "none"}. User type: ${profile?.userType ?? "general"}.
Schema: {"days":[{"meals":[{"mealType":"breakfast","name":"...","items":[{"name":"...","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0}]}],"totalKcal":0}],"shoppingList":["..."]}
"days" must contain exactly 7 entries, ordered Monday → Sunday.`;

    if (weekScope) {
      // One AI call → 7-day plan (cheaper + consistent across days); one retry on parse failure
      let raw: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const messages: { role: "system" | "user" | "assistant"; content: string }[] =
          attempt === 0
            ? [
                { role: "system", content: weekSystemPrompt },
                { role: "user", content: weekUserPrompt },
              ]
            : [
                { role: "system", content: weekSystemPrompt },
                { role: "user", content: weekUserPrompt },
                {
                  role: "assistant",
                  content:
                    typeof raw === "string" && raw
                      ? raw.slice(0, 2000)
                      : "...",
                },
                {
                  role: "user",
                  content:
                    "Your previous response was not valid JSON (a string value was missing double quotes). Return the full plan again as strictly valid JSON — quote every string value.",
                },
              ];
        const completion = await zai.chat.completions.create({ messages, thinking: { type: "disabled" } });
        const content = completion.choices[0]?.message?.content ?? "";
        raw = content;
        try {
          const parsed = extractJson(content);
          raw = content; // keep text for retry context
          // validate shape below; if invalid we throw inside try
          const daysArrCheck = parsed as { days?: unknown[]; shoppingList?: unknown };
          if (!Array.isArray(daysArrCheck.days) || daysArrCheck.days.length < 7) {
            throw new Error("too few days");
          }
          raw = parsed;
          break;
        } catch {
          continue; // retry
        }
      }
      if (!raw || typeof raw === "string") throw new ApiError("AI_FAILED", 502);
      const obj = raw as { days?: unknown[]; shoppingList?: unknown };
      const daysArr = obj.days as Record<string, unknown>[];
      shoppingList = Array.isArray(obj.shoppingList) ? (obj.shoppingList as string[]).slice(0, 60) : [];

      const dates = weekDates(mondayOf(parsed.data.date));
      const upserts = await Promise.all(
        dates.map((date, i) => {
          const dayRaw = daysArr[i] ?? {};
          const dayPlan = {
            meals: (dayRaw.meals as unknown) ?? [],
            totalKcal: (dayRaw.totalKcal as number) ?? 0,
            shoppingList: i === 0 ? shoppingList : [], // keep list only on Monday row to avoid dupes
          };
          const validated = dayPlanSchema.parse(dayPlan);
          plans[date] = validated;
          return db.plannerDay.upsert({
            where: { userId_date: { userId: user.id, date } },
            create: { userId: user.id, date, planJson: JSON.stringify(validated) },
            update: { planJson: JSON.stringify(validated) },
          });
        })
      );
      return Response.json({
        ok: true,
        scope: "week",
        weekOf: dates[0],
        dates,
        plans: Object.fromEntries(upserts.map((u) => [u.date, JSON.parse(u.planJson)])),
        shoppingList,
      });
    }

    // ---- single day plan ----
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a meal planner. Respond in ${lang} with ONLY valid JSON, no markdown, no comments. Every JSON string value MUST be wrapped in double quotes. Create a one-day meal plan (breakfast, lunch, dinner, snacks) that fits the user's daily targets, respecting their dietary preference. Prefer simple, common ${
            locale === "tr" ? "Turkish" : "local"
          } foods with realistic portions.`,
        },
        {
          role: "user",
          content: `Targets: ${targets.calories} kcal, P${targets.protein}/C${targets.carbs}/F${targets.fat}. Diet: ${
            profile?.dietPreference ?? "any"
          }. Allergens: ${profile?.allergens || "none"}. User type: ${profile?.userType ?? "general"}.
Schema: {"meals":[{"mealType":"breakfast","name":"...","items":[{"name":"...","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0}]}],"totalKcal":0,"shoppingList":["..."]}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content ?? "";
    const plan = dayPlanSchema.parse(extractJson(content));

    const saved = await db.plannerDay.upsert({
      where: { userId_date: { userId: user.id, date: parsed.data.date } },
      create: { userId: user.id, date: parsed.data.date, planJson: JSON.stringify(plan) },
      update: { planJson: JSON.stringify(plan) },
    });
    return Response.json({ ok: true, scope: "day", plan: JSON.parse(saved.planJson), date: saved.date });
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/planner?date=YYYY-MM-DD          → single day plan
 *  GET /api/planner?week=YYYY-MM-DD          → all plans of that ISO week (Mon-Sun) */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const weekParam = url.searchParams.get("week");

    if (weekParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) throw new ApiError("VALIDATION", 400);
      const dates = weekDates(mondayOf(weekParam));
      const rows = await db.plannerDay.findMany({
        where: { userId: user.id, date: { in: dates } },
      });
      const plans: Record<string, unknown> = {};
      for (const d of dates) {
        const row = rows.find((r) => r.date === d);
        if (row) plans[d] = JSON.parse(row.planJson);
      }
      return Response.json({ ok: true, scope: "week", weekOf: dates[0], dates, plans });
    }

    const date = url.searchParams.get("date") || localDateStr();
    const day = await db.plannerDay.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    return Response.json({ plan: day ? JSON.parse(day.planJson) : null, date });
  } catch (e) {
    return errorResponse(e);
  }
}
