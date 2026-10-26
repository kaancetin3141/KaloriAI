import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { appToday, addDaysIso } from "@/lib/tz";
import { requireUser, errorResponse, ApiError, isPremium } from "@/lib/auth";
import { createAiJob, getAiJob, startAiJob } from "@/lib/ai-jobs";

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

/** Monday of the ISO week containing dateStr (deterministic, UTC-anchored —
 *  getUTCDay on a fixed 12:00Z instant; no host-machine calendar involved) */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? 6 : day - 1;
  return addDaysIso(dateStr, -diff);
}

function weekDates(monday: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(addDaysIso(monday, i));
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
  if (!isPremium(sub)) throw new ApiError("PREMIUM_REQUIRED", 402);
}

interface PlannerContext {
  userId: string;
  date: string;
  locale: "tr" | "en";
  targets: { calories: number; protein: number; carbs: number; fat: number };
  profile: { dietPreference?: string | null; allergens?: string | null; userType?: string | null } | null;
}

/** Tek günlük plan üret: AI turu + kayıt. (Arka plan işi içinde çağrılır.) */
async function generateDayPlan(ctx: PlannerContext) {
  const lang = ctx.locale === "en" ? "English" : "Turkish";
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a meal planner. Respond in ${lang} with ONLY valid JSON, no markdown, no comments. Every JSON string value MUST be wrapped in double quotes. Create a one-day meal plan (breakfast, lunch, dinner, snacks) that fits the user's daily targets, respecting their dietary preference. Prefer simple, common ${
          ctx.locale === "tr" ? "Turkish" : "local"
        } foods with realistic portions.`,
      },
      {
        role: "user",
        content: `Targets: ${ctx.targets.calories} kcal, P${ctx.targets.protein}/C${ctx.targets.carbs}/F${ctx.targets.fat}. Diet: ${
          ctx.profile?.dietPreference ?? "any"
        }. Allergens: ${ctx.profile?.allergens || "none"}. User type: ${ctx.profile?.userType ?? "general"}.
Schema: {"meals":[{"mealType":"breakfast","name":"...","items":[{"name":"...","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0}]}],"totalKcal":0,"shoppingList":["..."]}`,
      },
    ],
    thinking: { type: "disabled" },
  });
  const content = completion.choices[0]?.message?.content ?? "";
  const plan = dayPlanSchema.parse(extractJson(content));

  const saved = await db.plannerDay.upsert({
    where: { userId_date: { userId: ctx.userId, date: ctx.date } },
    create: { userId: ctx.userId, date: ctx.date, planJson: JSON.stringify(plan) },
    update: { planJson: JSON.stringify(plan) },
  });
  return { ok: true, scope: "day", plan: JSON.parse(saved.planJson), date: saved.date };
}

/** 7 günlük plan: tek AI çağrısı (tutarlı + ekonomik), 1 kez JSON onarım tekrarı. */
async function generateWeekPlan(ctx: PlannerContext) {
  const lang = ctx.locale === "en" ? "English" : "Turkish";
  const zai = await ZAI.create();

  const weekSystemPrompt = `You are a weekly meal planner. Respond in ${lang} with ONLY valid JSON, no markdown, no comments. IMPORTANT: every JSON string value MUST be wrapped in double quotes. Create a 7-day meal plan (each day: breakfast, lunch, dinner, snacks) that fits the user's daily targets. Vary the meals across days, keep it realistic and repeatable. Prefer simple, common ${
    ctx.locale === "tr" ? "Turkish" : "local"
  } foods with realistic portions. Provide ONE merged shopping list for the whole week with estimated quantities.`;
  const weekUserPrompt = `Daily targets: ${ctx.targets.calories} kcal, P${ctx.targets.protein}/C${ctx.targets.carbs}/F${ctx.targets.fat}. Diet: ${
    ctx.profile?.dietPreference ?? "any"
  }. Allergens: ${ctx.profile?.allergens || "none"}. User type: ${ctx.profile?.userType ?? "general"}.
Schema: {"days":[{"meals":[{"mealType":"breakfast","name":"...","items":[{"name":"...","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0}]}],"totalKcal":0}],"shoppingList":["..."]}
"days" must contain exactly 7 entries, ordered Monday → Sunday.`;

  let raw: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
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
      if (!Array.isArray(daysArrCheck.days) || daysArrCheck.days.length < 4) {
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
  // day count sanity: eksik günleri VAR olan günleri çevirerek tamamla (7'ye
  // tamamlama), fazlaysa ilk 7'yi al — iş hiçbir zaman tüm hafta için çökmesin.
  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  if (rawDays.length < 7) {
    const filler = rawDays.length > 0 ? rawDays : [{}];
    while (rawDays.length < 7) rawDays.push(filler[rawDays.length % filler.length]);
  }
  const daysArr = rawDays.slice(0, 7) as Record<string, unknown>[];
  const shoppingList = Array.isArray(obj.shoppingList)
    ? (obj.shoppingList as string[]).slice(0, 60)
    : [];

  const dates = weekDates(mondayOf(ctx.date));
  // Önce GÜVENİLİR bir gün referansı bul (şemayı geçen ilk gün) — geçersiz
  // günler (boş meals vb.) bu referansla değiştirilir, iş asla tüm hafta için düşmez.
  let fallbackDay: { meals: unknown; totalKcal: number } | null = null;
  for (const d of daysArr) {
    const cand = { meals: (d.meals as unknown) ?? [], totalKcal: (d.totalKcal as number) ?? 0 };
    if (dayPlanSchema.safeParse({ ...cand, shoppingList: [] }).success) {
      fallbackDay = cand;
      break;
    }
  }
  const plans: Record<string, unknown> = {};
  const upserts = await Promise.all(
    dates.map((date, i) => {
      const dayRaw = daysArr[i] ?? {};
      let dayPlan: { meals: unknown; totalKcal: number; shoppingList: string[] } = {
        meals: (dayRaw.meals as unknown) ?? [],
        totalKcal: (dayRaw.totalKcal as number) ?? 0,
        shoppingList: i === 0 ? shoppingList : [], // keep list only on Monday row to avoid dupes
      };
      if (!dayPlanSchema.safeParse(dayPlan).success && fallbackDay) {
        dayPlan = { ...fallbackDay, shoppingList: i === 0 ? shoppingList : [] };
      }
      const validated = dayPlanSchema.parse(dayPlan);
      plans[date] = validated;
      return db.plannerDay.upsert({
        where: { userId_date: { userId: ctx.userId, date } },
        create: { userId: ctx.userId, date, planJson: JSON.stringify(validated) },
        update: { planJson: JSON.stringify(validated) },
      });
    })
  );
  return {
    ok: true,
    scope: "week",
    weekOf: dates[0],
    dates,
    plans: Object.fromEntries(upserts.map((u) => [u.date, JSON.parse(u.planJson)])),
    shoppingList,
  };
}

/**
 * POST — hızlı aşama: premium + hedef doğrulaması (~1 DB turu) sonra iş arka
 * plana atanır ve hemen jobId döner. Haftalık plan AI turu (15-30 sn, onarım
 * tekrarı dahil) bağlantıyı meşgul etmez; istemci GET?id= ile yoklar.
 * (Uzun istekler ara proxy'lerce kesiliyor → "Bağlantı hatası" sınıfı.)
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await requirePremium(user.id);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    const [targets, profile] = await Promise.all([
      db.targets.findUnique({ where: { userId: user.id } }),
      db.profile.findUnique({ where: { userId: user.id } }),
    ]);
    if (!targets) throw new ApiError("NO_TARGETS", 400);

    const jobId = createAiJob(user.id);
    const ctx: PlannerContext = {
      userId: user.id,
      date: parsed.data.date,
      locale: parsed.data.locale,
      targets,
      profile,
    };

    startAiJob(jobId, async () => {
      try {
        return parsed.data.scope === "week"
          ? await generateWeekPlan(ctx)
          : await generateDayPlan(ctx);
      } catch (e) {
        // ZodError vb. doğrudan 500'e sızmasın — job kaydına net kod yazılsın.
        if (e instanceof ApiError) throw e;
        console.error("[planner] job hatası:", e);
        throw new ApiError("AI_FAILED", 502);
      }
    });

    return Response.json({ ok: true, jobId, status: "pending" });
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET?id= — yoklama: pending / done (tam plan sonucu) / error (ApiError). */
/** GET /api/planner?date=YYYY-MM-DD          → single day plan
 *  GET /api/planner?week=YYYY-MM-DD          → all plans of that ISO week (Mon-Sun) */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);

    // --- job polling (async plan üretimi) ---
    const id = url.searchParams.get("id");
    if (id) {
      const job = getAiJob(id, user.id);
      if (!job) throw new ApiError("JOB_NOT_FOUND", 404);
      if (job.status === "pending") return Response.json({ ok: true, status: "pending" });
      if (job.status === "error") {
        throw new ApiError(job.error ?? "AI_FAILED", job.errorStatus ?? 502);
      }
      return Response.json({ ok: true, status: "done", ...(job.result as Record<string, unknown>) });
    }

    // --- normal plan sorguları ---
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

    const date = url.searchParams.get("date") || appToday();
    const day = await db.plannerDay.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    return Response.json({ plan: day ? JSON.parse(day.planJson) : null, date });
  } catch (e) {
    return errorResponse(e);
  }
}
