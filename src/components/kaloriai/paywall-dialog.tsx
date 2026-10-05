"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Check, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/api";
import { useAppStore, type SessionUser } from "@/stores/app-store";
import { cn } from "@/lib/utils";

type Plan = "monthly" | "yearly";
type Action = "trial" | "subscribe" | "restore";

/** Premium paywall — shared by profile, progress photos and quota gates. */
export function PaywallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dict = useAppStore((s) => s.dict);
  const { toast } = useToast();
  const [plan, setPlan] = useState<Plan>("yearly");
  const [busy, setBusy] = useState<Action | null>(null);

  const features = Object.values(dict.premium.features) as string[];
  const yearlyBadge = dict.premium.yearly.includes("(")
    ? dict.premium.yearly.split("(")[1]?.replace(")", "")
    : undefined;

  async function run(action: Action) {
    setBusy(action);
    try {
      if (action === "restore") {
        // RevenueCat restore is simulated — mock success feedback only
        toast({ title: dict.premium.restore, description: dict.premium.legal });
        return;
      }
      if (action === "trial") {
        await api("/api/subscription", { body: { action: "start_trial" } });
        toast({ title: dict.profile.premiumActive, description: dict.premium.startTrial });
      } else {
        await api("/api/subscription", { body: { action: "subscribe", plan } });
        toast({
          title: dict.profile.premiumActive,
          description: plan === "yearly" ? dict.premium.yearly : dict.premium.monthly,
        });
      }
      const res = await api<{ user: SessionUser | null }>("/api/auth/me");
      useAppStore.getState().setUser(res.user);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "TRIAL_USED") {
        toast({ title: dict.premium.legal });
      } else {
        toast({ title: dict.common.error, variant: "destructive" });
      }
    } finally {
      setBusy(null);
    }
  }

  const anyBusy = busy !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-lg overflow-hidden p-0 gap-0 max-h-[90vh] overflow-y-auto"
        aria-describedby="paywall-desc"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          {/* Gradient header */}
          <div className="kai-hero-bg px-6 pt-8 pb-6 text-center">
            <div
              className="mx-auto h-14 w-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"
              aria-hidden
            >
              <Crown className="h-7 w-7 text-amber-500" />
            </div>
            <DialogHeader className="space-y-1.5 mt-4 items-center">
              <DialogTitle className="text-xl font-bold flex items-center gap-2 justify-center">
                {dict.premium.title}
                <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
              </DialogTitle>
              <DialogDescription id="paywall-desc" className="text-sm">
                {dict.premium.subtitle} · {dict.premium.freeLimit}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Features */}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5" aria-label={dict.premium.subtitle}>
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm min-h-[24px]">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* Plans */}
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="sr-only">{dict.premium.title}</legend>
              {(["monthly", "yearly"] as Plan[]).map((p) => {
                const active = plan === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPlan(p)}
                    className={cn(
                      "relative rounded-xl border p-4 text-left min-h-[64px] transition-colors",
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-accent/50"
                    )}
                  >
                    {p === "yearly" && yearlyBadge && (
                      <Badge className="absolute -top-2.5 right-2 bg-amber-500 hover:bg-amber-500 text-amber-950 text-[10px] px-1.5 py-0">
                        {yearlyBadge}
                      </Badge>
                    )}
                    <span className="block text-sm font-semibold leading-snug">
                      {p === "monthly" ? dict.premium.monthly : dict.premium.yearly}
                    </span>
                  </button>
                );
              })}
            </fieldset>

            {/* Actions */}
            <div className="space-y-2.5">
              <Button
                className="w-full min-h-[44px] bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold"
                onClick={() => run("trial")}
                disabled={anyBusy}
              >
                {busy === "trial" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Crown className="h-4 w-4" aria-hidden />}
                {dict.premium.startTrial}
              </Button>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => run("subscribe")}
                  disabled={anyBusy}
                >
                  {busy === "subscribe" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {dict.premium.subscribe}
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-[44px] text-muted-foreground"
                  onClick={() => run("restore")}
                  disabled={anyBusy}
                >
                  {dict.premium.restore}
                </Button>
              </div>
            </div>

            <p className="text-[11px] leading-snug text-muted-foreground text-center">{dict.premium.legal}</p>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
