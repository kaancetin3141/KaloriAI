"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChefHat,
  Plus,
  Trash2,
  Users,
  X,
  Search,
  Check,
  UtensilsCrossed,
  Link2,
  Globe,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, ApiError } from "@/lib/api";
import type { FoodItem } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RecipeItemView {
  foodId: string;
  name: string;
  grams: number;
  kcal100: number;
  protein100: number;
  carb100: number;
  fat100: number;
  fiber100: number;
  sugar100: number;
  sodium100: number;
  satFat100: number;
}

interface RecipeView {
  id: string;
  name: string;
  servings: number;
  items: RecipeItemView[];
  perServing: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  total: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
}

interface ImportDraftItem {
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
}

interface EditableDraftItem extends ImportDraftItem {
  origGrams: number;
  origKcal: number;
  origProtein: number;
  origCarbs: number;
  origFat: number;
  origFiber: number;
  origSugar: number;
  origSodium: number;
  origSatFat: number;
}

const toEditable = (items: ImportDraftItem[]): EditableDraftItem[] =>
  items.map((i) => ({ ...i, origGrams: i.grams, origKcal: i.kcal, origProtein: i.protein, origCarbs: i.carbs, origFat: i.fat, origFiber: i.fiber, origSugar: i.sugar, origSodium: i.sodium, origSatFat: i.satFat }));

const scaleItem = (it: EditableDraftItem, grams: number): EditableDraftItem => {
  const g = Math.max(grams, 1);
  const r = g / Math.max(it.origGrams, 1);
  const rnd = (v: number) => Math.round(v * 10) / 10;
  return {
    ...it,
    grams: g,
    kcal: rnd(it.origKcal * r),
    protein: rnd(it.origProtein * r),
    carbs: rnd(it.origCarbs * r),
    fat: rnd(it.origFat * r),
    fiber: rnd(it.origFiber * r),
    sugar: rnd(it.origSugar * r),
    sodium: rnd(it.origSodium * r),
    satFat: rnd(it.origSatFat * r),
  };
};

interface ImportDraft {
  name: string;
  servings: number;
  items: ImportDraftItem[];
}

interface ImportResponse {
  ok: boolean;
  importId: string;
  draft: ImportDraft;
  sourceTitle: string | null;
}

const num = (v: string) => {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function RecipeDialog({
  open,
  onClose,
  date,
  mealType,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  mealType: string;
}) {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const { toast } = useToast();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const [mode, setMode] = useState<"list" | "create" | "import">("list");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [ingredients, setIngredients] = useState<{ food: FoodItem; grams: number }[]>([]);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [selected, setSelected] = useState<RecipeView | null>(null);
  const [portion, setPortion] = useState("1");
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [editItems, setEditItems] = useState<EditableDraftItem[]>([]);
  const [importId, setImportId] = useState("");
  const [sourceTitle, setSourceTitle] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftServings, setDraftServings] = useState("4");

  const recipesQuery = useQuery({
    queryKey: ["recipes"],
    queryFn: () => api<{ recipes: RecipeView[] }>("/api/recipes"),
    enabled: open,
  });

  // debounce search (local+OFF)
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (v: string) => {
    setSearch(v);
    if (searchTimer) clearTimeout(searchTimer);
    if (v.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await api<{ foods: FoodItem[] }>(`/api/foods/search?q=${encodeURIComponent(v.trim())}&limit=10`);
        setResults(res.foods);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    setSearchTimer(t);
  };

  const createRecipe = useMutation({
    mutationFn: () =>
      api("/api/recipes", {
        body: {
          name: name.trim(),
          servings: Math.max(1, Math.round(num(servings))),
          items: ingredients.map((i) => ({ foodId: i.food.id, grams: i.grams })),
        },
      }),
    onSuccess: () => {
      toast({ description: dict.diary.recipeCreated });
      setIngredients([]);
      setName("");
      setServings("1");
      setMode("list");
      void qc.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const deleteRecipe = useMutation({
    mutationFn: (id: string) => api(`/api/recipes?id=${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const resetImport = () => {
    setImportUrl("");
    setImportError(null);
    setDraft(null);
    setEditItems([]);
    setImportId("");
    setSourceTitle(null);
    setDraftName("");
    setDraftServings("4");
  };

  const analyzeImport = useMutation({
    mutationFn: () =>
      api<ImportResponse>("/api/recipes/import", {
        body: { url: importUrl.trim(), locale },
      }),
    onSuccess: (res) => {
      setDraft(res.draft);
      setEditItems(toEditable(res.draft.items));
      setImportId(res.importId);
      setSourceTitle(res.sourceTitle);
      setDraftName(res.draft.name);
      setDraftServings(String(res.draft.servings));
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : "UNKNOWN";
      setImportError(
        code === "QUOTA_EXCEEDED"
          ? dict.ai.quotaDone
          : code === "VALIDATION"
            ? dict.diary.recipeImportInvalid
            : dict.diary.recipeImportFailed
      );
    },
  });

  const commitImport = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; recipeId: string }>("/api/recipes/import/commit", {
        body: {
          importId,
          name: draftName.trim() || draft?.name || "Recipe",
          servings: Math.max(1, Math.round(num(draftServings) || 4)),
          items: editItems.map(({ name, grams, kcal, protein, carbs, fat, fiber, sugar, sodium, satFat }) => ({
            name: name.trim() || "—",
            grams,
            kcal,
            protein,
            carbs,
            fat,
            fiber,
            sugar,
            sodium,
            satFat,
          })),
        },
      }),
    onSuccess: () => {
      toast({ description: dict.diary.recipeImported });
      resetImport();
      setMode("list");
      void qc.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const importTotals = useMemo(() => {
    if (editItems.length === 0) return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    return editItems.reduce(
      (acc, i) => ({
        kcal: acc.kcal + i.kcal,
        protein: acc.protein + i.protein,
        carbs: acc.carbs + i.carbs,
        fat: acc.fat + i.fat,
        fiber: acc.fiber + i.fiber,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [editItems]);

  const importServ = Math.max(1, Math.round(num(draftServings) || 1));

  const addToDiary = useMutation({
    mutationFn: (r: RecipeView) => {
      const portions = Math.max(1, Math.round(num(portion) || 1));
      // scale each ingredient by portions/servings to log N portions
      const scale = portions / Math.max(r.servings, 1);
      return api("/api/diary", {
        body: {
          date,
          mealType,
          items: r.items.map((it) => ({
            foodId: it.foodId,
            name: `${r.name} — ${it.name}`,
            grams: Math.round(it.grams * scale * 10) / 10,
            kcal: Math.round(((it.kcal100 * it.grams) / 100) * scale * 10) / 10,
            protein: Math.round(((it.protein100 * it.grams) / 100) * scale * 10) / 10,
            carbs: Math.round(((it.carb100 * it.grams) / 100) * scale * 10) / 10,
            fat: Math.round(((it.fat100 * it.grams) / 100) * scale * 10) / 10,
            fiber: Math.round(((it.fiber100 * it.grams) / 100) * scale * 10) / 10,
            sugar: Math.round((((it.sugar100 ?? 0) * it.grams) / 100) * scale * 10) / 10,
            sodium: Math.round((((it.sodium100 ?? 0) * it.grams) / 100) * scale * 10) / 10,
            satFat: Math.round((((it.satFat100 ?? 0) * it.grams) / 100) * scale * 10) / 10,
            source: "recipe",
          })),
        },
      });
    },
    onSuccess: () => {
      toast({ description: dict.diary.saved });
      void qc.invalidateQueries({ queryKey: ["diary"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      setSelected(null);
      setPortion("1");
      onClose();
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const totals = useMemo(() => {
    return ingredients.reduce(
      (acc, i) => {
        acc.kcal += (i.food.kcal100 * i.grams) / 100;
        acc.protein += (i.food.protein100 * i.grams) / 100;
        acc.carbs += (i.food.carb100 * i.grams) / 100;
        acc.fat += (i.food.fat100 * i.grams) / 100;
        acc.fiber += (i.food.fiber100 * i.grams) / 100;
        return acc;
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [ingredients]);

  const serv = Math.max(1, Math.round(num(servings) || 1));
  const L = locale === "tr" ? { p: "P", c: "K", f: "Y" } : { p: "P", c: "C", f: "F" };

  const header = (
    <>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <ChefHat className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <div>
        <DialogTitle className="text-base font-bold">{dict.diary.recipes}</DialogTitle>
        <DialogDescription className="text-xs">{dict.diary.recipesSub}</DialogDescription>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {mode === "list" && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1 rounded-full active:scale-95"
            onClick={() => {
              resetImport();
              setMode("import");
            }}
            aria-label={dict.diary.recipeImport}
          >
            <Link2 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{dict.diary.recipeImport}</span>
          </Button>
        )}
        <Button
          variant={mode === "create" ? "secondary" : "default"}
          size="sm"
          className="gap-1 rounded-full active:scale-95"
          onClick={() => setMode(mode === "list" ? "create" : "list")}
        >
          {mode === "list" ? <Plus className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
          {mode === "list" ? dict.diary.createFood.replace(/.*/, dict.common.add) : dict.common.cancel}
        </Button>
      </div>
    </>
  );

  const body = (
    <div className="mt-4 min-h-0 flex-1 overflow-hidden">
      {mode === "list" ? (
        <div className="flex h-full min-h-0 flex-col">
          {recipesQuery.isLoading ? (
            <div className="space-y-2 pr-1">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : recipesQuery.data && recipesQuery.data.recipes.length > 0 ? (
            <ScrollArea className="kai-scroll max-h-[55vh] flex-1 pr-1 sm:max-h-[420px]">
              <div className="space-y-2 pb-2">
                {recipesQuery.data.recipes.map((r) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelected(selected?.id === r.id ? null : r)}
                        aria-expanded={selected?.id === r.id}
                      >
                        <p className="truncate text-sm font-semibold">{r.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Users className="h-3 w-3" aria-hidden />
                          {r.servings} · {dict.diary.recipePerServing}:{" "}
                          <strong className="tabular-nums">{r.perServing.kcal}</strong> {dict.common.kcal}
                        </p>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteRecipe.mutate(r.id)}
                        aria-label={`${dict.common.delete} ${r.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>

                    <AnimatePresence>
                      {selected?.id === r.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 space-y-1 rounded-lg bg-muted/60 p-2">
                            {r.items.map((it, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px]">
                                <span className="truncate text-muted-foreground">{it.name}</span>
                                <span className="tabular-nums">{it.grams} g</span>
                              </div>
                            ))}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <Badge variant="secondary" className="rounded-full text-[10px]">
                                {dict.diary.recipePerServing}: {r.perServing.kcal} {dict.common.kcal} · {L.p}
                                {r.perServing.protein} {L.c}
                                {r.perServing.carbs} {L.f}
                                {r.perServing.fat}
                              </Badge>
                              <Badge variant="outline" className="rounded-full text-[10px]">
                                {dict.diary.recipeTotal}: {r.total.kcal} {dict.common.kcal}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              value={portion}
                              onChange={(e) => setPortion(e.target.value)}
                              aria-label={dict.diary.recipeServings}
                              className="h-9 w-20"
                            />
                            <Button
                              size="sm"
                              className="min-h-9 flex-1 gap-1.5 active:scale-[0.98]"
                              onClick={() => addToDiary.mutate(r)}
                              disabled={addToDiary.isPending}
                            >
                              <UtensilsCrossed className="h-4 w-4" aria-hidden />
                              {dict.diary.recipeAddToMeal} → {mealType}
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ChefHat className="h-6 w-6 text-primary" aria-hidden />
              </span>
              <p className="max-w-[240px] text-xs text-muted-foreground">{dict.diary.recipeEmpty}</p>
            </div>
          )}
        </div>
      ) : mode === "import" ? (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="recipe-import-url" className="text-xs">
              {dict.diary.recipeImport}
            </Label>
            <p className="text-[11px] leading-snug text-muted-foreground">{dict.diary.recipeImportSub}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Globe
                  className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="recipe-import-url"
                  type="url"
                  inputMode="url"
                  value={importUrl}
                  onChange={(e) => {
                    setImportUrl(e.target.value);
                    setImportError(null);
                  }}
                  placeholder={dict.diary.recipeUrlPh}
                  className="h-10 pl-8"
                  disabled={analyzeImport.isPending || draft !== null}
                />
              </div>
              <Button
                className="min-h-10 gap-1.5 active:scale-[0.98]"
                onClick={() => {
                  const u = importUrl.trim();
                  try {
                    const p = new URL(u);
                    if (p.protocol !== "http:" && p.protocol !== "https:") throw new Error("bad");
                  } catch {
                    setImportError(dict.diary.recipeImportInvalid);
                    return;
                  }
                  setImportError(null);
                  analyzeImport.mutate();
                }}
                disabled={analyzeImport.isPending || draft !== null || importUrl.trim().length < 10}
              >
                {analyzeImport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                {dict.diary.recipeAnalyze}
              </Button>
            </div>
            {importError && (
              <p role="alert" className="text-xs text-destructive">
                {importError}
              </p>
            )}
          </div>

          {analyzeImport.isPending && (
            <div className="space-y-2" aria-busy="true" aria-label={dict.diary.recipeAnalyzing}>
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs font-medium text-primary">
                <Sparkles className="h-4 w-4 animate-pulse" aria-hidden />
                {dict.diary.recipeAnalyzing}
              </div>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          )}

          {draft && !analyzeImport.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="kai-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px]">
                <div className="space-y-1">
                  <Label htmlFor="import-name" className="text-xs">
                    {dict.diary.recipeName}
                  </Label>
                  <Input
                    id="import-name"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="import-servings" className="text-xs">
                    {dict.diary.recipeServings}
                  </Label>
                  <Input
                    id="import-servings"
                    type="number"
                    min={1}
                    max={20}
                    value={draftServings}
                    onChange={(e) => setDraftServings(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {sourceTitle && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Globe className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="shrink-0 font-medium">{dict.diary.recipeImportSource}:</span>
                  <span className="truncate">{sourceTitle}</span>
                </p>
              )}

              <div className="overflow-hidden rounded-lg border">
                {editItems.map((it, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 border-b px-2 py-1.5 text-xs last:border-0"
                  >
                    <Input
                      value={it.name}
                      maxLength={120}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditItems((prev) => prev.map((p, i) => (i === idx ? { ...p, name: v } : p)));
                      }}
                      aria-label={`${dict.diary.foodName} ${idx + 1}`}
                      className="h-8 min-w-0 flex-1 px-2 text-xs"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={5000}
                      value={String(it.grams)}
                      onChange={(e) => {
                        const g = Math.min(Math.max(Number(e.target.value.replace(",", ".")) || 1, 1), 5000);
                        setEditItems((prev) => prev.map((p, i) => (i === idx ? scaleItem(p, g) : p)));
                      }}
                      aria-label={`${it.name} ${dict.diary.gramsInput}`}
                      className="h-8 w-20 text-xs tabular-nums"
                    />
                    <span className="shrink-0 text-[10px] text-muted-foreground">g</span>
                    <span className="w-16 shrink-0 text-right font-medium tabular-nums">
                      {Math.round(it.kcal)} {dict.common.kcal}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setEditItems((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label={`${dict.diary.deleteItem} ${it.name}`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                ))}
                {editItems.length === 0 && (
                  <p className="p-3 text-center text-[11px] text-muted-foreground">{dict.diary.recipeImportAllRemoved}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 p-2 text-[11px]">
                <Badge variant="secondary" className="rounded-full tabular-nums">
                  {dict.diary.recipeTotal}: {Math.round(importTotals.kcal)} {dict.common.kcal}
                </Badge>
                <Badge variant="outline" className="rounded-full tabular-nums">
                  {dict.diary.recipePerServing}: {Math.round(importTotals.kcal / importServ)} {dict.common.kcal} ·{" "}
                  {L.p}
                  {Math.round(importTotals.protein / importServ)} {L.c}
                  {Math.round(importTotals.carbs / importServ)} {L.f}
                  {Math.round(importTotals.fat / importServ)}
                </Badge>
              </div>

              <p className="text-[11px] text-muted-foreground">{dict.common.estimateWarning}</p>

              <Button
                className="w-full min-h-11 active:scale-[0.98]"
                onClick={() => commitImport.mutate()}
                disabled={
                  commitImport.isPending || !draftName.trim() || editItems.length === 0 || editItems.some((i) => !i.name.trim())
                }
              >
                {commitImport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-4 w-4" aria-hidden />
                )}
                {dict.diary.recipeImportSave}
              </Button>
            </motion.div>
          )}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px]">
            <div className="space-y-1">
              <Label htmlFor="recipe-name" className="text-xs">
                {dict.diary.recipeName}
              </Label>
              <Input
                id="recipe-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={dict.diary.foodName}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recipe-servings" className="text-xs">
                {dict.diary.recipeServings}
              </Label>
              <Input
                id="recipe-servings"
                type="number"
                min={1}
                max={20}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{dict.diary.recipeIngredients}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={dict.diary.searchPh}
                className="h-9 pl-8"
                aria-label={dict.diary.recipeAddIngredient}
              />
            </div>
            {searching && <Skeleton className="h-8 w-full rounded-lg" />}
            {results.length > 0 && (
              <div className="kai-scroll max-h-36 overflow-y-auto rounded-lg border">
                {results.slice(0, 8).map((f) => {
                  const added = ingredients.some((i) => i.food.id === f.id);
                  return (
                    <button
                      key={f.id}
                      className="flex w-full items-center justify-between gap-2 border-b px-2.5 py-2 text-left text-xs last:border-0 hover:bg-accent disabled:opacity-50"
                      onClick={() => {
                        setIngredients((prev) => [...prev, { food: f, grams: 100 }]);
                        setResults([]);
                        setSearch("");
                      }}
                      disabled={added}
                    >
                      <span className="truncate">{f.name}</span>
                      <span className="flex shrink-0 items-center gap-1 text-muted-foreground tabular-nums">
                        {Math.round(f.kcal100)} {dict.common.kcal}
                        {added && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {ingredients.length > 0 && (
            <div className="kai-scroll max-h-40 space-y-1.5 overflow-y-auto rounded-lg border p-2">
              {ingredients.map((ing, idx) => (
                <div key={`${ing.food.id}-${idx}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs">{ing.food.name}</span>
                  <Input
                    type="number"
                    min={1}
                    value={String(ing.grams)}
                    onChange={(e) => {
                      const v = num(e.target.value);
                      setIngredients((prev) => prev.map((p, i) => (i === idx ? { ...p, grams: v } : p)));
                    }}
                    aria-label={`${ing.food.name} ${dict.diary.gramsInput}`}
                    className="h-8 w-20 text-xs tabular-nums"
                  />
                  <span className="text-[10px] text-muted-foreground">g</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={`${dict.common.delete} ${ing.food.name}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto space-y-2">
            {ingredients.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 p-2 text-[11px]">
                <Badge variant="secondary" className="rounded-full tabular-nums">
                  {dict.diary.recipeTotal}: {Math.round(totals.kcal)} {dict.common.kcal}
                </Badge>
                <Badge variant="outline" className="rounded-full tabular-nums">
                  {dict.diary.recipePerServing}: {Math.round(totals.kcal / serv)} {dict.common.kcal} · {L.p}
                  {Math.round(totals.protein / serv)} {L.c}
                  {Math.round(totals.carbs / serv)} {L.f}
                  {Math.round(totals.fat / serv)}
                </Badge>
              </div>
            )}
            <Button
              className="w-full min-h-11 active:scale-[0.98]"
              onClick={() => createRecipe.mutate()}
              disabled={!name.trim() || ingredients.length === 0 || createRecipe.isPending}
            >
              <Check className="h-4 w-4" aria-hidden />
              {dict.common.save}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="flex h-[88vh] flex-col px-4 pb-safe">
          <DrawerHeader className="flex flex-row items-center gap-2.5 px-0 pt-3">{header}</DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader className="flex flex-row items-center gap-2.5 space-y-0">{header}</DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
