"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_MEAL_TYPES } from "@/lib/calculations";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AiEditorItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  satFat: number;
  confidence: number;
  alternatives: string[];
}

export interface AiEditorResult {
  items: AiEditorItem[];
  overallConfidence: number;
  clarifyingQuestion: string | null;
  imageUrl?: string;
  analysisId?: string;
}

interface BaseVals {
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  satFat: number;
}
interface EditItem extends AiEditorItem {
  base: BaseVals;
}

function toEditItems(result: AiEditorResult): EditItem[] {
  return result.items.map((it) => ({
    ...it,
    grams: it.grams > 0 ? it.grams : 100,
    sugar: it.sugar ?? 0,
    sodium: it.sodium ?? 0,
    satFat: it.satFat ?? 0,
    base: {
      grams: it.grams > 0 ? it.grams : 100,
      kcal: it.kcal,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
      fiber: it.fiber,
      sugar: it.sugar ?? 0,
      sodium: it.sodium ?? 0,
      satFat: it.satFat ?? 0,
    },
  }));
}

/** Scale kcal/macros/micros proportionally from original per-gram ratios */
function scaleItem(item: EditItem, grams: number): EditItem {
  const f = grams / item.base.grams;
  const r1 = (v: number) => Math.round(v * f * 10) / 10;
  return {
    ...item,
    grams,
    kcal: Math.round(item.base.kcal * f),
    protein: r1(item.base.protein),
    carbs: r1(item.base.carbs),
    fat: r1(item.base.fat),
    fiber: r1(item.base.fiber),
    sugar: r1(item.base.sugar),
    sodium: Math.round(item.base.sodium * f),
    satFat: r1(item.base.satFat),
  };
}

function ConfBadge({ c }: { c: number }) {
  const pct = `${Math.round(c * 100)}%`;
  if (c >= 0.7)
    return (
      <Badge variant="outline" className="shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        {pct}
      </Badge>
    );
  if (c >= 0.4)
    return (
      <Badge variant="outline" className="shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        {pct}
      </Badge>
    );
  return <Badge variant="destructive" className="shrink-0">{pct}</Badge>;
}

export function AiResultEditor({
  open,
  onClose,
  result,
  mealType,
  date,
}: {
  open: boolean;
  onClose: () => void;
  result: AiEditorResult;
  mealType: string;
  date: string;
}) {
  const { dict } = useAppStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Fresh mount per result (parents unmount when closed) → lazy init, no sync effect needed
  const [items, setItems] = useState<EditItem[]>(() => toEditItems(result));
  const [mt, setMt] = useState(mealType);

  const save = useMutation({
    mutationFn: () =>
      api("/api/diary", {
        body: {
          date,
          mealType: mt,
          items: items
            .filter((i) => i.name.trim().length > 0)
            .map((i) => ({
              name: i.name.trim(),
              grams: i.grams,
              kcal: i.kcal,
              protein: i.protein,
              carbs: i.carbs,
              fat: i.fat,
              fiber: i.fiber,
              sugar: i.sugar,
              sodium: i.sodium,
              satFat: i.satFat,
              source: "ai",
            })),
          aiAnalysisId: result.analysisId,
        },
      }),
    onSuccess: () => {
      toast({ title: dict.diary.saved });
      queryClient.invalidateQueries({ queryKey: ["diary"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      onClose();
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const update = (idx: number, patch: Partial<EditItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const setGrams = (idx: number, grams: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? scaleItem(it, grams) : it)));

  const remove = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const swapAlternative = (idx: number, alt: string) =>
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, name: alt, confidence: 0.65 } : it))
    );

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        name: "",
        grams: 100,
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        satFat: 0,
        confidence: 1,
        alternatives: [],
        base: { grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satFat: 0 },
      },
    ]);

  const handleSave = () => {
    if (!items.some((i) => i.name.trim().length > 0)) {
      toast({ title: dict.errors.validation, variant: "destructive" });
      return;
    }
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto kai-scroll sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {result.imageUrl && (
              <img
                src={result.imageUrl}
                alt={dict.ai.resultTitle}
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <DialogTitle>{dict.ai.resultTitle}</DialogTitle>
              <DialogDescription>{dict.ai.resultSub}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Estimate warning */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{dict.common.estimateWarning}</p>
        </div>

        {/* Low overall confidence + clarifying question */}
        {result.overallConfidence < 0.6 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{dict.ai.clarifying}</p>
              {result.clarifyingQuestion && <p className="mt-0.5">{result.clarifyingQuestion}</p>}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="-mr-1 max-h-96 space-y-3 overflow-y-auto kai-scroll pr-1" role="list" aria-label={dict.ai.sources}>
          {items.map((it, idx) => (
            <motion.div
              key={`${it.name}-${idx}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              role="listitem"
              className="space-y-3 rounded-xl border bg-card p-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={it.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  placeholder={dict.ai.itemName}
                  aria-label={dict.ai.itemName}
                  className="h-10"
                />
                <ConfBadge c={it.confidence} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(idx)}
                  aria-label={dict.ai.deleteItem}
                  className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Slider
                  value={[it.grams]}
                  min={10}
                  max={800}
                  step={5}
                  onValueChange={(v) => setGrams(idx, v[0] ?? it.grams)}
                  aria-label={dict.ai.portionGrams}
                  className="flex-1"
                />
                <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {it.grams} {dict.common.g}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">
                  {it.kcal} {dict.common.kcal}
                </span>
                <span className="tabular-nums">P {it.protein}{dict.common.g}</span>
                <span className="tabular-nums">C {it.carbs}{dict.common.g}</span>
                <span className="tabular-nums">F {it.fat}{dict.common.g}</span>
                {(it.sugar > 0 || it.sodium > 0 || it.satFat > 0) && (
                  <span className="tabular-nums text-[11px]">
                    · {dict.diary.sugar} {it.sugar}{dict.common.g} · {dict.diary.satFat} {it.satFat}{dict.common.g} · {dict.diary.sodium} {it.sodium}mg
                  </span>
                )}
                {it.confidence < 0.4 && (
                  <span className="text-destructive">{dict.ai.lowConfidence}</span>
                )}
              </div>

              {it.confidence < 0.6 && it.alternatives.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                    {dict.ai.alternatives}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {it.alternatives.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        onClick={() => swapAlternative(idx, alt)}
                        className="min-h-[44px] rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-accent sm:min-h-0 sm:py-1"
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <Button variant="outline" onClick={addItem} className="w-full min-h-[44px] gap-2 border-dashed">
          <Plus className="h-4 w-4" aria-hidden />
          {dict.ai.addItem}
        </Button>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center">
          <Select value={mt} onValueChange={setMt}>
            <SelectTrigger className="w-full sm:w-44" aria-label={dict.diary.addTo}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_MEAL_TYPES.map((m) => (
                <SelectItem key={m} value={m}>
                  {dict.today[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="order-last text-xs text-muted-foreground sm:order-none sm:ml-auto">
            {date}
          </span>
          <Button
            onClick={handleSave}
            disabled={save.isPending}
            className={cn("w-full min-h-[44px] gap-2 sm:w-auto")}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {dict.ai.saveToDiary}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
