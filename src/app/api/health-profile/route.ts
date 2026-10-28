/**
 * Optional health profile (FitZen-style): conditions + allergies + diet.
 * Personalizes the AI coach — canonical comma-separated tokens live on Profile
 * (healthConditions new; allergens reused, onboarding wrote free text before).
 *
 * GET → { conditions[], allergies[], dietPreference }
 * PUT  → upsert canonical tokens (zod enum-guarded); dietPreference artık
 *        buradan da değiştirilebilir (onboarding sonrası tek düzenleme yolu).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse, ApiError } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const CONDITION_TOKENS = ["diabetes", "hypertension", "pcos", "cholesterol", "thyroid", "ibs"] as const;
const ALLERGY_TOKENS = ["gluten", "lactose", "nuts", "peanut", "egg", "fish", "shellfish", "soy", "sesame"] as const;

const putSchema = z.object({
  conditions: z.array(z.enum(CONDITION_TOKENS)).max(6),
  allergies: z.array(z.enum(ALLERGY_TOKENS)).max(9),
  dietPreference: z.enum(["any", "vegetarian", "vegan"]).optional(),
});

/** "a,b," → ["a","b"] — boş/çöp parçalar ayıklanır, sıra korunur */
function parseTokens(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export async function GET() {
  try {
    const user = await requireUser();
    const profile = await db.profile.findUnique({ where: { userId: user.id } });
    return Response.json({
      conditions: parseTokens(profile?.healthConditions),
      allergies: parseTokens(profile?.allergens),
      dietPreference: profile?.dietPreference || "any",
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const rl = checkRateLimit(`healthprofile:${user.id}:${clientIp(req)}`, 20, 60_000);
    if (!rl.allowed) throw new ApiError("RATE_LIMITED", 429);

    const parsed = putSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("VALIDATION", 400);

    // canonical + dedup — çip UI zaten tek toggle, çift token string'i kirletmesin
    const conditions = [...new Set(parsed.data.conditions)];
    const allergies = [...new Set(parsed.data.allergies)];

    // Profile satırı henüz yoksa (onboarding atlandı) oluştur; dietPreference
    // gönderildiyse her iki yolda da yazılır (gönderilmediyse korunur).
    const dietPatch = parsed.data.dietPreference ? { dietPreference: parsed.data.dietPreference } : {};
    const profile = await db.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        healthConditions: conditions.join(","),
        allergens: allergies.join(","),
        ...dietPatch,
      },
      update: {
        healthConditions: conditions.join(","),
        allergens: allergies.join(","),
        ...dietPatch,
      },
    });

    return Response.json({
      conditions: parseTokens(profile.healthConditions),
      allergies: parseTokens(profile.allergens),
      dietPreference: profile.dietPreference || "any",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
