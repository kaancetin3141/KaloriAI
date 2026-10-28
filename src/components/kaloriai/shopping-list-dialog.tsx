"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, ShoppingBasket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PlannerPlan } from "./weekly-planner-dialog";

interface ShoppingRow {
  name: string;
  grams: number;
}

/**
 * Planner günlerinin malzeme kalemlerini ada göre toplar: aynı gıda birden çok
 * gün planlıysa gramalar toplanır (ör. Yumurta 2 gün × 100 g → 200 g).
 */
function aggregateRows(
  plans: Record<string, PlannerPlan | undefined>,
  locale: string
): ShoppingRow[] {
  const map = new Map<string, ShoppingRow>();
  for (const plan of Object.values(plans)) {
    if (!plan?.meals) continue;
    for (const meal of plan.meals) {
      for (const it of meal.items) {
        const name = it.name?.trim();
        if (!name) continue;
        const key = name.toLocaleLowerCase(locale);
        const cur = map.get(key);
        map.set(key, { name: cur?.name ?? name, grams: (cur?.grams ?? 0) + (it.grams || 0) });
      }
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, grams: Math.round(r.grams) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale === "en" ? "en" : "tr"));
}

/**
 * Alışveriş listesi — haftalık planın malzeme kalemleri (ad bazlı gram toplamı),
 * yerel checkbox'lu satırlar ve panoya kopyalama.
 *
 * Not: Gövde ayrı bir alt bileşendir ve Radix kapalıyken DialogContent'i unmount
 * ettiği için her açılışta taze mount olur → checkbox durumu doğal sıfırlanır
 * (reset-effect'e gerek yok → react-hooks/set-state-in-effect riski sıfır).
 */
export function ShoppingListDialog({
  open,
  onClose,
  plans,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  plans: Record<string, PlannerPlan | undefined>;
  loading?: boolean;
}) {
  const dict = useAppStore((s) => s.dict);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader className="flex flex-row items-center gap-2.5 space-y-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ShoppingBasket className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <DialogTitle className="text-base font-bold">{dict.shoppingList.title}</DialogTitle>
            <DialogDescription className="text-xs">{dict.shoppingList.subtitle}</DialogDescription>
          </div>
        </DialogHeader>
        <ShoppingListBody plans={plans} loading={loading} />
      </DialogContent>
    </Dialog>
  );
}

function ShoppingListBody({
  plans,
  loading,
}: {
  plans: Record<string, PlannerPlan | undefined>;
  loading: boolean;
}) {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const { toast } = useToast();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => aggregateRows(plans, locale), [plans, locale]);

  const copyAll = async () => {
    const text = rows.map((r) => `${r.name} — ${r.grams}g`).join("\n");
    let ok = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      // Fallback: geçici textarea + execCommand (eski tarayıcı / kısıtlı izin ortamları)
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      toast({ description: dict.shoppingList.copied });
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast({ description: dict.common.error, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="mt-4 space-y-1.5" aria-busy="true" aria-label={dict.shoppingList.title}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ShoppingBasket className="h-6 w-6 text-primary" aria-hidden />
        </span>
        <p className="max-w-[240px] text-xs text-muted-foreground">{dict.shoppingList.empty}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <ul
        className="kai-scroll max-h-96 space-y-1.5 overflow-y-auto pr-1"
        aria-label={dict.shoppingList.title}
      >
        {rows.map((r, i) => {
          const isChecked = !!checked[r.name];
          return (
            <motion.li
              key={r.name}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.16), duration: 0.25 }}
            >
              <label
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-1.5 transition-colors hover:bg-accent/60 active:scale-[0.99]"
                data-checked={isChecked}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(v) =>
                    setChecked((prev) => ({ ...prev, [r.name]: v === true }))
                  }
                  aria-label={`${r.name}, ${r.grams} g`}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    isChecked && "text-muted-foreground line-through"
                  )}
                >
                  {r.name}
                </span>
                <Badge
                  variant="secondary"
                  className={cn("shrink-0 rounded-full text-[11px] tabular-nums", isChecked && "opacity-50")}
                >
                  {r.grams} g
                </Badge>
              </label>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <p role="status" className="text-xs text-muted-foreground tabular-nums">
          {rows.length} {dict.shoppingList.items}
        </p>
        <Button
          size="sm"
          className="min-h-10 gap-1.5 active:scale-95"
          onClick={() => void copyAll()}
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {dict.shoppingList.copy}
        </Button>
      </div>
    </div>
  );
}
