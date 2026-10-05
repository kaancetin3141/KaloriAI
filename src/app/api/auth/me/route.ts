import { db } from "@/lib/db";
import { getCurrentUser, errorResponse } from "@/lib/auth";

/** Defensive parse of the Profile.mealNames JSON column */
function parseMealNames(raw: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      ([k, v]) => typeof v === "string" && v.trim() && ["breakfast", "lunch", "dinner", "snacks"].includes(k)
    );
    return entries.length > 0 ? Object.fromEntries(entries as [string, string][]) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ user: null });
    const [profile, subscription] = await Promise.all([
      db.profile.findUnique({ where: { userId: user.id } }),
      db.subscription.findUnique({ where: { userId: user.id } }),
    ]);
    const premiumActive =
      subscription?.tier === "premium" &&
      (!subscription.cancelledAt || (subscription.renewsAt && subscription.renewsAt > new Date()));
    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        unitSystem: user.unitSystem,
        isPremium: premiumActive === true,
        onboarded: profile?.onboarded ?? false,
      },
      mealNames: profile?.mealNames ? parseMealNames(profile.mealNames) : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
