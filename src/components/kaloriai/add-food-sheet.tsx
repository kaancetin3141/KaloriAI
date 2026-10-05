"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Heart,
  Loader2,
  PackagePlus,
  Plus,
  ScanLine,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type { FoodItem } from "@/lib/types";

/** Local YYYY-MM-DD */
const fmtDate = (d = new Date()) => d.toLocaleDateString("en-CA");

const num = (v: string) => {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const BARCODE_FORMATS = ["ean_13", "ean_8", "code_128", "upc_a"];

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

const macroLetters = (locale: string) =>
  locale === "tr" ? { p: "P", c: "K", f: "Y" } : { p: "P", c: "C", f: "F" };

/** Localized meal label ("breakfast" → "Kahvaltı") */
function useMealLabel(mealType: string): string {
  const { dict } = useAppStore();
  const map: Record<string, string> = {
    breakfast: dict.today.breakfast,
    lunch: dict.today.lunch,
    dinner: dict.today.dinner,
    snacks: dict.today.snacks,
  };
  return map[mealType] ?? mealType;
}

/* ------------------------------------------------------------------ */
/* Selected-food panel: serving select + grams + computed macros + add */
/* ------------------------------------------------------------------ */

function AddFoodPanel({
  food,
  sourceTag,
  date,
  mealType,
  onClear,
}: {
  food: FoodItem;
  sourceTag: "manual" | "barcode";
  date: string;
  mealType: string;
  onClear: () => void;
}) {
  const { dict, locale } = useAppStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const L = macroLetters(locale);
  const mealLabel = useMealLabel(mealType);

  const first = food.servings[0];
  const [grams, setGrams] = useState(String(first ? first.grams : 100));
  const [servingKey, setServingKey] = useState(first ? `s:${first.id}` : "100");
  const [justAdded, setJustAdded] = useState(false);

  const g = num(grams);
  /** per100 × grams/100, 1 decimal */
  const scaled = (per100: number) => Math.round(((per100 * g) / 100) * 10) / 10;

  const addMutation = useMutation({
    mutationFn: () =>
      api<{ ok: boolean }>("/api/diary", {
        body: {
          date,
          mealType,
          items: [
            {
              foodId: food.id.startsWith("off_") ? undefined : food.id,
              name: food.name,
              grams: g,
              kcal: scaled(food.kcal100),
              protein: scaled(food.protein100),
              carbs: scaled(food.carb100),
              fat: scaled(food.fat100),
              fiber: scaled(food.fiber100),
              sugar: scaled(food.sugar100),
              sodium: scaled(food.sodium100),
              satFat: scaled(food.satFat100),
              source: sourceTag,
            },
          ],
        },
      }),
    onSuccess: () => {
      toast({ description: dict.diary.saved });
      void qc.invalidateQueries({ queryKey: ["diary"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1200);
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const servingOptions = useMemo(
    () => [
      ...food.servings.map((s) => ({ value: `s:${s.id}`, label: `${s.label} (${s.grams} g)` })),
      { value: "100", label: "100 g" },
      { value: "1", label: "1 g" },
    ],
    [food.servings]
  );

  const handleServing = (key: string) => {
    setServingKey(key);
    if (key === "100") setGrams("100");
    else if (key === "1") setGrams("1");
    else {
      const s = food.servings.find((x) => `s:${x.id}` === key);
      if (s) setGrams(String(s.grams));
    }
  };

  const canAdd = g >= 0.1 && g <= 5000;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18 }}
    >
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3" aria-label={dict.diary.addTo}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {food.name}
              {food.brand ? <span className="font-normal text-muted-foreground"> · {food.brand}</span> : null}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {Math.round(food.kcal100)} {dict.common.kcal} / 100 {dict.common.g}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-full"
            onClick={onClear}
            aria-label={dict.common.close}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <div className="mt-3 flex gap-2">
          <Select value={servingKey} onValueChange={handleServing}>
            <SelectTrigger className="min-h-[44px] w-full flex-1" aria-label={dict.diary.serving}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {servingOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-24 shrink-0">
            <Input
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              aria-label={dict.diary.gramsInput}
              className="min-h-[44px] pr-7"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {dict.common.g}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            <span className="text-sm font-semibold text-foreground">
              {Math.round(scaled(food.kcal100))} {dict.common.kcal}
            </span>
            <span className="ml-2">
              {L.p} {scaled(food.protein100)} · {L.c} {scaled(food.carb100)} · {L.f} {scaled(food.fat100)}
            </span>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {mealLabel}
          </Badge>
        </div>

        <Button
          className="mt-3 min-h-[44px] w-full"
          onClick={() => addMutation.mutate()}
          disabled={addMutation.isPending || !canAdd}
        >
          {addMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : justAdded ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          {justAdded ? dict.diary.saved : dict.diary.addLog}
        </Button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------ */
/* Food row (search / favorites / frequent results) */
/* ------------------------------------------------ */

function FoodRow({
  food,
  canFavorite,
  onSelect,
  onToggleFavorite,
}: {
  food: FoodItem;
  canFavorite: boolean;
  onSelect: (f: FoodItem) => void;
  onToggleFavorite: (f: FoodItem) => void;
}) {
  const { dict, locale } = useAppStore();
  const L = macroLetters(locale);
  return (
    <div className="flex items-stretch rounded-xl border bg-card transition-colors hover:bg-accent/40">
      <button
        type="button"
        onClick={() => onSelect(food)}
        className="flex min-h-[44px] flex-1 items-center gap-3 rounded-xl p-3 text-left"
        aria-label={`${food.name} — ${dict.common.edit}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{food.name}</span>
            {food.source === "OFF" && (
              <Badge
                variant="outline"
                className="shrink-0 text-[10px] font-normal text-muted-foreground"
              >
                {dict.diary.offSource}
              </Badge>
            )}
          </div>
          {food.brand ? (
            <div className="truncate text-xs text-muted-foreground">{food.brand}</div>
          ) : null}
          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {Math.round(food.kcal100)} {dict.common.kcal}/100{dict.common.g} · {L.p}{" "}
            {Math.round(food.protein100)} · {L.c} {Math.round(food.carb100)} · {L.f}{" "}
            {Math.round(food.fat100)}
          </div>
        </div>
      </button>
      {canFavorite && (
        <div className="flex items-center pr-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={dict.diary.favorites}
            onClick={() => onToggleFavorite(food)}
          >
            <Star
              className={cn(
                "h-4 w-4",
                food.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
              )}
              aria-hidden
            />
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- */
/* List + skeletons */
/* ---------------- */

function FoodList({
  foods,
  isLoading,
  emptyText,
  onSelect,
  onToggleFavorite,
}: {
  foods: FoodItem[];
  isLoading?: boolean;
  emptyText: string;
  onSelect: (f: FoodItem) => void;
  onToggleFavorite: (f: FoodItem) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (foods.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {foods.map((f) => (
        <FoodRow
          key={f.id}
          food={f}
          canFavorite={!f.id.startsWith("off_")}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {title}
    </h3>
  );
}

/* ------------- */
/* AddFoodSheet  */
/* ------------- */

type TabKey = "search" | "barcode" | "favorites" | "create";

const EMPTY_FORM = {
  name: "",
  brand: "",
  kcal: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  servingLabel: "",
  servingGrams: "",
};

/**
 * Thin wrapper: owns the Drawer shell. The stateful body is mounted only
 * while the sheet is open, so its state resets naturally on every open.
 */
export function AddFoodSheet({
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
  const { dict } = useAppStore();
  const mealLabel = useMealLabel(mealType);

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="h-[85vh] max-h-[92vh]">
        <DrawerHeader className="pb-1 text-left">
          <DrawerTitle className="flex items-center justify-between gap-2">
            {dict.diary.addTo}
            <Badge variant="secondary">{mealLabel}</Badge>
          </DrawerTitle>
          <DrawerDescription className="sr-only">{dict.diary.title}</DrawerDescription>
        </DrawerHeader>
        {open && <AddFoodSheetBody date={date} mealType={mealType} />}
      </DrawerContent>
    </Drawer>
  );
}

function AddFoodSheetBody({ date, mealType }: { date: string; mealType: string }) {
  const { dict } = useAppStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const mealLabel = useMealLabel(mealType);

  const [tab, setTab] = useState<TabKey>("search");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<{ food: FoodItem; sourceTag: "manual" | "barcode" } | null>(
    null
  );
  const [code, setCode] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState(false);
  const [hasDetector] = useState(
    () => typeof window !== "undefined" && "BarcodeDetector" in window
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /* 300 ms search debounce */
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  /* Camera + BarcodeDetector polling (every 400 ms) */
  useEffect(() => {
    if (!camOn) return;
    let timer: number | null = null;
    let cancelled = false;
    const stop = () => {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* autoplay guard */
          }
        }
        const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
        const Ctor = w.BarcodeDetector;
        if (!Ctor) {
          setCamError(true);
          setCamOn(false);
          return;
        }
        const detector = new Ctor({ formats: BARCODE_FORMATS });
        timer = window.setInterval(async () => {
          const v = videoRef.current;
          if (!v || v.readyState < 2) return;
          try {
            const found = await detector.detect(v);
            if (found.length > 0 && found[0].rawValue) {
              setCode(found[0].rawValue.replace(/\D/g, ""));
              setCamOn(false); /* cleanup stops the tracks */
            }
          } catch {
            /* frame not ready — skip */
          }
        }, 400);
      } catch {
        setCamError(true);
        setCamOn(false);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [camOn]);

  const search = useQuery({
    queryKey: ["foods", "search", debouncedQ],
    enabled: debouncedQ.length >= 2,
    queryFn: () =>
      api<{ foods: FoodItem[]; source: string }>(`/api/foods/search?q=${encodeURIComponent(debouncedQ)}`),
  });

  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () =>
      api<{ favorites: FoodItem[]; frequent: FoodItem[] }>("/api/foods/favorites"),
  });

  const toggleFav = useMutation({
    mutationFn: (foodId: string) =>
      api<{ isFavorite: boolean }>("/api/foods/favorites", { body: { foodId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["favorites"] });
      void qc.invalidateQueries({ queryKey: ["foods", "search"] });
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  const barcodeLookup = useMutation({
    mutationFn: (c: string) =>
      api<{ food: FoodItem; source: string }>(`/api/foods/barcode?code=${encodeURIComponent(c)}`),
    onSuccess: (data) => setSelected({ food: data.food, sourceTag: "barcode" }),
    onError: () => toast({ title: dict.diary.barcodeNotFound, variant: "destructive" }),
  });

  const createFood = useMutation({
    mutationFn: () =>
      api<{ food: FoodItem }>("/api/foods/create", {
        body: {
          name: form.name.trim(),
          brand: form.brand.trim() || undefined,
          kcal100: num(form.kcal),
          protein100: num(form.protein),
          carb100: num(form.carbs),
          fat100: num(form.fat),
          fiber100: num(form.fiber),
          sugar100: 0,
          sodium100: 0,
          satFat100: 0,
          servings:
            form.servingLabel.trim() && num(form.servingGrams) > 0
              ? [{ label: form.servingLabel.trim(), grams: num(form.servingGrams) }]
              : undefined,
        },
      }),
    onSuccess: (res) => {
      toast({ description: dict.diary.saved });
      setSelected({ food: { ...res.food, isFavorite: false }, sourceTag: "manual" });
      setForm(EMPTY_FORM);
      void qc.invalidateQueries({ queryKey: ["foods", "search"] });
    },
    onError: () => toast({ description: dict.errors.validation, variant: "destructive" }),
  });

  const canCreate = form.name.trim().length > 0 && num(form.kcal) > 0;
  const select = (food: FoodItem) => setSelected({ food, sourceTag: "manual" });

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <AnimatePresence mode="popLayout">
            {selected && (
              <div key="selected-panel" className="mb-3 shrink-0">
                <AddFoodPanel
                  key={selected.food.id}
                  food={selected.food}
                  sourceTag={selected.sourceTag}
                  date={date}
                  mealType={mealType}
                  onClear={() => setSelected(null)}
                />
              </div>
            )}
          </AnimatePresence>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="grid h-auto w-full grid-cols-4">
              {(
                [
                  { key: "search", icon: Search, label: dict.common.search },
                  { key: "barcode", icon: ScanLine, label: dict.diary.barcode },
                  { key: "favorites", icon: Heart, label: dict.diary.favorites },
                  { key: "create", icon: PackagePlus, label: dict.diary.createFood },
                ] as const
              ).map(({ key, icon: Icon, label }) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="h-11 min-h-[44px] flex-col gap-0.5 px-1 text-[10px] sm:flex-row sm:text-xs"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* -------- Search -------- */}
            <TabsContent value="search" className="kai-scroll min-h-0 flex-1 overflow-y-auto pb-4">
              <div className="space-y-3">
                <Input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={dict.diary.searchPh}
                  aria-label={dict.common.search}
                />
                {debouncedQ.length < 2 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {dict.common.search} — {dict.diary.searchPh}
                  </p>
                ) : (
                  <FoodList
                    foods={search.data?.foods ?? []}
                    isLoading={search.isFetching && !search.data}
                    emptyText={dict.common.emptyState}
                    onSelect={select}
                    onToggleFavorite={(f) => toggleFav.mutate(f.id)}
                  />
                )}
              </div>
            </TabsContent>

            {/* -------- Barcode -------- */}
            <TabsContent value="barcode" className="kai-scroll min-h-0 flex-1 overflow-y-auto pb-4">
              <div className="space-y-3">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.trim().length >= 6) barcodeLookup.mutate(code.trim());
                  }}
                >
                  <Input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder={dict.diary.barcodePh}
                    aria-label={dict.diary.barcode}
                    className="min-h-[44px] flex-1"
                  />
                  <Button
                    type="submit"
                    className="min-h-[44px]"
                    disabled={barcodeLookup.isPending || code.trim().length < 6}
                  >
                    {barcodeLookup.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <ScanLine className="h-4 w-4" aria-hidden />
                    )}
                    {dict.diary.barcodeLookup}
                  </Button>
                </form>

                {hasDetector && !camOn && (
                  <Button
                    variant="outline"
                    className="min-h-[44px] w-full"
                    onClick={() => {
                      setCamError(false);
                      setCamOn(true);
                    }}
                  >
                    <ScanLine className="h-4 w-4" aria-hidden />
                    {dict.diary.scanBarcode}
                  </Button>
                )}

                {camOn && (
                  <div className="space-y-2">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="h-44 w-full rounded-xl bg-black object-cover"
                      aria-label={dict.diary.scanBarcode}
                    />
                    <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setCamOn(false)}>
                      {dict.common.close}
                    </Button>
                  </div>
                )}

                {camError && <p className="text-xs text-destructive">{dict.errors.network}</p>}
              </div>
            </TabsContent>

            {/* -------- Favorites + frequent -------- */}
            <TabsContent value="favorites" className="kai-scroll min-h-0 flex-1 overflow-y-auto pb-4">
              <div className="space-y-5">
                <div className="space-y-2">
                  <SectionTitle
                    icon={<Heart className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />}
                    title={dict.diary.favorites}
                  />
                  <FoodList
                    foods={favorites.data?.favorites ?? []}
                    isLoading={favorites.isLoading}
                    emptyText={dict.common.emptyState}
                    onSelect={select}
                    onToggleFavorite={(f) => toggleFav.mutate(f.id)}
                  />
                </div>
                <div className="space-y-2">
                  <SectionTitle
                    icon={<Star className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                    title={dict.diary.frequent}
                  />
                  <FoodList
                    foods={favorites.data?.frequent ?? []}
                    isLoading={favorites.isLoading}
                    emptyText={dict.common.emptyState}
                    onSelect={select}
                    onToggleFavorite={(f) => toggleFav.mutate(f.id)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* -------- Create custom food -------- */}
            <TabsContent value="create" className="kai-scroll min-h-0 flex-1 overflow-y-auto pb-4">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canCreate) createFood.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="cf-name">{dict.diary.foodName}</Label>
                  <Input
                    id="cf-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    maxLength={120}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cf-brand">
                    {dict.diary.brand} <span className="text-muted-foreground">({dict.common.optional})</span>
                  </Label>
                  <Input
                    id="cf-brand"
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                    maxLength={80}
                    className="min-h-[44px]"
                  />
                </div>

                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">{dict.diary.macros100}</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {(
                      [
                        { key: "kcal", label: dict.common.kcal },
                        { key: "protein", label: dict.onboarding.protein },
                        { key: "carbs", label: dict.onboarding.carbs },
                        { key: "fat", label: dict.onboarding.fat },
                        { key: "fiber", label: dict.diary.fiber },
                      ] as const
                    ).map(({ key, label }) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={`cf-${key}`} className="text-xs text-muted-foreground">
                          {label}
                        </Label>
                        <Input
                          id={`cf-${key}`}
                          inputMode="decimal"
                          value={form[key]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder="0"
                          className="min-h-[44px]"
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">
                    {dict.common.portion}{" "}
                    <span className="text-muted-foreground">({dict.common.optional})</span>
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={form.servingLabel}
                      onChange={(e) => setForm((f) => ({ ...f, servingLabel: e.target.value }))}
                      placeholder={dict.common.portion}
                      aria-label={dict.diary.serving}
                      maxLength={40}
                      className="min-h-[44px]"
                    />
                    <div className="relative">
                      <Input
                        inputMode="decimal"
                        value={form.servingGrams}
                        onChange={(e) => setForm((f) => ({ ...f, servingGrams: e.target.value }))}
                        placeholder="100"
                        aria-label={dict.diary.gramsInput}
                        className="min-h-[44px] pr-7"
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {dict.common.g}
                      </span>
                    </div>
                  </div>
                </fieldset>

                <Button type="submit" className="min-h-[44px] w-full" disabled={!canCreate || createFood.isPending}>
                  {createFood.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <PackagePlus className="h-4 w-4" aria-hidden />
                  )}
                  {dict.common.save}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
    </div>
  );
}
