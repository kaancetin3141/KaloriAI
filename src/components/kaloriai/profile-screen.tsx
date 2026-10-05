"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  Crown,
  Loader2,
  LogOut,
  Pencil,
  Send,
  Target,
  Bell,
  BellOff,
  BellRing,
  Clock,
  Shield,
  HeartPulse,
  Download,
  FileJson,
  Trash2,
  Globe,
  Ruler,
  Moon,
  CreditCard,
  Database,
  BadgeCheck,
  UtensilsCrossed,
  RotateCcw,
  Coffee,
  Sun,
  Apple,
  Search,
  Server,
  Palette,
  Lock,
  Watch,
  Smartphone,
  Upload,
  Footprints,
  Weight,
  Percent,
  CalendarRange,
  Check,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { PwaInstallCard } from "@/components/kaloriai/pwa-install-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { CALORIE_FLOOR, type Goal, type ActivityLevel, type UserType, type Sex } from "@/lib/calculations";
import { kgToLb, lbToKg } from "@/lib/units";
import type { Locale, Dictionary } from "@/lib/i18n";
import type { Reminder } from "@/lib/types";
import { useAppStore, PREMIUM_SKINS, type MealKey, type Skin } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import { PaywallDialog } from "@/components/kaloriai/paywall-dialog";
import { cn } from "@/lib/utils";

interface ProfileFull {
  sex?: string | null;
  weightKg?: number | null;
  goalWeightKg?: number | null;
  goal?: string | null;
  weeklyRateKg?: number | null;
  activityLevel?: string | null;
  userType?: string | null;
}
interface CustomFood {
  id: string;
  name: string;
  brand: string | null;
  source: string;
  kcal100: number;
  protein100: number;
  carb100: number;
  fat100: number;
  fiber100: number;
  sugar100: number;
  sodium100: number;
  satFat100: number;
  createdAt: string;
}

interface FoodEditForm {
  name: string;
  brand: string;
  kcal100: string;
  protein100: string;
  carb100: string;
  fat100: string;
  fiber100: string;
  sugar100: string;
  sodium100: string;
  satFat100: string;
}

const toEditForm = (f: CustomFood): FoodEditForm => ({
  name: f.name,
  brand: f.brand ?? "",
  kcal100: String(Math.round(f.kcal100)),
  protein100: String(Math.round(f.protein100 * 10) / 10),
  carb100: String(Math.round(f.carb100 * 10) / 10),
  fat100: String(Math.round(f.fat100 * 10) / 10),
  fiber100: String(Math.round(f.fiber100 * 10) / 10),
  sugar100: String(Math.round(f.sugar100 * 10) / 10),
  sodium100: String(Math.round(f.sodium100)),
  satFat100: String(Math.round(f.satFat100 * 10) / 10),
});

const foodNum = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Manage user-created + AI-imported custom foods (search, inspect, edit nutrition, soft delete) */
function CustomFoodsDialog({
  open,
  onOpenChange,
  dict,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dict: Dictionary;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomFood | null>(null);
  const [form, setForm] = useState<FoodEditForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const foodsQ = useQuery({
    queryKey: ["customFoods"],
    queryFn: () => api<{ foods: CustomFood[] }>("/api/foods/custom"),
    enabled: open,
  });

  const deleteFood = useMutation({
    mutationFn: (id: string) => api(`/api/foods/custom?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ description: dict.profile.foodDeleted });
      void qc.invalidateQueries({ queryKey: ["customFoods"] });
      void qc.invalidateQueries({ queryKey: ["foods", "search"] });
      void qc.invalidateQueries({ queryKey: ["favorites"] });
      void qc.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
    onSettled: () => setDeletingId(null),
  });

  const saveFood = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<{ food: CustomFood }>("/api/foods/custom", { body: payload, method: "PATCH" }),
    onSuccess: () => {
      toast({ description: dict.profile.foodUpdated });
      setEditing(null);
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["customFoods"] });
      void qc.invalidateQueries({ queryKey: ["foods", "search"] });
      void qc.invalidateQueries({ queryKey: ["favorites"] });
      void qc.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: () => setFormError(dict.common.error),
  });

  const openEdit = (f: CustomFood) => {
    setEditing(f);
    setForm(toEditForm(f));
    setFormError(null);
  };

  const submitEdit = () => {
    if (!editing || !form) return;
    if (!form.name.trim()) {
      setFormError(dict.common.error);
      return;
    }
    const kcal = foodNum(form.kcal100);
    const protein = foodNum(form.protein100);
    const carbs = foodNum(form.carb100);
    const fat = foodNum(form.fat100);
    const fiber = foodNum(form.fiber100);
    const sugar = foodNum(form.sugar100);
    const sodium = foodNum(form.sodium100);
    const satFat = foodNum(form.satFat100);
    if (
      kcal === null ||
      protein === null ||
      carbs === null ||
      fat === null ||
      fiber === null ||
      sugar === null ||
      sodium === null ||
      satFat === null
    ) {
      setFormError(dict.common.error);
      return;
    }
    const invalid =
      kcal > 900 ||
      protein > 100 ||
      carbs > 100 ||
      fat > 100 ||
      fiber > 100 ||
      sugar > 100 ||
      sodium > 10000 ||
      satFat > 100;
    if (invalid) {
      setFormError(dict.common.error);
      return;
    }
    saveFood.mutate({
      id: editing.id,
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      kcal100: kcal,
      protein100: protein,
      carb100: carbs,
      fat100: fat,
      fiber100: fiber,
      sugar100: sugar,
      sodium100: sodium,
      satFat100: satFat,
    });
  };

  const filtered = (foodsQ.data?.foods ?? []).filter((f) =>
    f.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const macroMini = (f: CustomFood) => {
    const L = " · ";
    const parts: string[] = [];
    if (f.protein100 > 0) parts.push(`P ${Math.round(f.protein100)}g`);
    if (f.carb100 > 0) parts.push(`K ${Math.round(f.carb100)}g`);
    if (f.fat100 > 0) parts.push(`Y ${Math.round(f.fat100)}g`);
    return parts.join(L);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md" aria-describedby="custom-foods-desc">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10" aria-hidden>
                <Apple className="h-4 w-4 text-primary" />
              </span>
              {dict.diary.customFoods}
            </DialogTitle>
            <DialogDescription id="custom-foods-desc" className="text-xs">
              {dict.profile.myFoodsSub}
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={dict.common.search}
              className="h-9 pl-8"
              aria-label={dict.common.search}
            />
          </div>

          <div className="kai-scroll -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {foodsQ.isLoading ? (
              <div className="space-y-2 py-1">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <ul className="space-y-1.5 py-1" aria-label={dict.diary.customFoods}>
                {filtered.map((f) => (
                  <li
                    key={f.id}
                    className="group rounded-xl border bg-card p-2.5 transition-all hover:border-primary/30 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary"
                        aria-hidden
                      >
                        <span className="text-[13px] font-bold leading-none tabular-nums">{Math.round(f.kcal100)}</span>
                        <span className="text-[8px] font-medium uppercase leading-none opacity-70">
                          {dict.common.kcal}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">{f.name}</p>
                          <Badge
                            variant="outline"
                            className={
                              f.source === "AI_IMPORT"
                                ? "hidden shrink-0 rounded-full border-primary/30 px-1.5 text-[9px] font-medium text-primary sm:inline-flex"
                                : "hidden shrink-0 rounded-full px-1.5 text-[9px] font-medium sm:inline-flex"
                            }
                          >
                            {f.source === "AI_IMPORT" ? dict.profile.srcAi : dict.profile.srcCustom}
                          </Badge>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                          {macroMini(f)}
                          {f.brand ? ` · ${f.brand}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => openEdit(f)}
                          aria-label={`${dict.profile.editFood} ${f.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          disabled={deleteFood.isPending}
                          onClick={() => {
                            setDeletingId(f.id);
                            deleteFood.mutate(f.id);
                          }}
                          aria-label={`${dict.common.delete} ${f.name}`}
                        >
                          {deletingId === f.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Apple className="h-6 w-6 text-primary" aria-hidden />
                </span>
                <p className="max-w-[260px] text-xs text-muted-foreground">{dict.profile.myFoodsEmpty}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit nutrition dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setForm(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-sm" aria-describedby="food-edit-desc">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-bold">{dict.profile.editFood}</DialogTitle>
            <DialogDescription id="food-edit-desc" className="text-xs">
              {dict.profile.foodEditHint}
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="kai-scroll -mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
              <div className="space-y-1">
                <Label htmlFor="food-edit-name" className="text-xs">
                  {dict.diary.foodName}
                </Label>
                <Input
                  id="food-edit-name"
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="food-edit-brand" className="text-xs">
                  {dict.diary.brand}
                </Label>
                <Input
                  id="food-edit-brand"
                  value={form.brand}
                  maxLength={80}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="h-9"
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{dict.diary.macros100}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="food-edit-kcal" className="text-xs text-muted-foreground">
                      {dict.common.kcal}
                    </Label>
                    <Input
                      id="food-edit-kcal"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={900}
                      value={form.kcal100}
                      onChange={(e) => setForm({ ...form, kcal100: e.target.value })}
                      className="h-9 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="food-edit-protein" className="text-xs text-muted-foreground">
                      {dict.onboarding.protein} (g)
                    </Label>
                    <Input
                      id="food-edit-protein"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={form.protein100}
                      onChange={(e) => setForm({ ...form, protein100: e.target.value })}
                      className="h-9 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="food-edit-carbs" className="text-xs text-muted-foreground">
                      {dict.onboarding.carbs} (g)
                    </Label>
                    <Input
                      id="food-edit-carbs"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={form.carb100}
                      onChange={(e) => setForm({ ...form, carb100: e.target.value })}
                      className="h-9 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="food-edit-fat" className="text-xs text-muted-foreground">
                      {dict.onboarding.fat} (g)
                    </Label>
                    <Input
                      id="food-edit-fat"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={form.fat100}
                      onChange={(e) => setForm({ ...form, fat100: e.target.value })}
                      className="h-9 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="food-edit-fiber" className="text-xs text-muted-foreground">
                      {dict.diary.fiber} (g)
                    </Label>
                    <Input
                      id="food-edit-fiber"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={form.fiber100}
                      onChange={(e) => setForm({ ...form, fiber100: e.target.value })}
                      className="h-9 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="food-edit-sugar" className="text-xs text-muted-foreground">
                      {dict.diary.sugar} (g)
                    </Label>
                    <Input
                      id="food-edit-sugar"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={form.sugar100}
                      onChange={(e) => setForm({ ...form, sugar100: e.target.value })}
                      className="h-9 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="food-edit-satfat" className="text-xs text-muted-foreground">
                      {dict.diary.satFat} (g)
                    </Label>
                    <Input
                      id="food-edit-satfat"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={form.satFat100}
                      onChange={(e) => setForm({ ...form, satFat100: e.target.value })}
                      className="h-9 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="food-edit-sodium" className="text-xs text-muted-foreground">
                      {dict.diary.sodium} (mg)
                    </Label>
                    <Input
                      id="food-edit-sodium"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={10000}
                      value={form.sodium100}
                      onChange={(e) => setForm({ ...form, sodium100: e.target.value })}
                      className="h-9 text-xs tabular-nums"
                    />
                  </div>
                </div>
              </div>
              {formError && (
                <p role="alert" className="text-xs text-destructive">
                  {formError}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="min-h-10 flex-1 active:scale-[0.98]"
              onClick={() => {
                setEditing(null);
                setForm(null);
                setFormError(null);
              }}
            >
              {dict.common.cancel}
            </Button>
            <Button
              className="min-h-10 flex-1 gap-1.5 active:scale-[0.98]"
              onClick={submitEdit}
              disabled={saveFood.isPending || !form?.name.trim()}
            >
              {saveFood.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BadgeCheck className="h-4 w-4" aria-hidden />}
              {dict.common.save}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

interface ProfileGet {
  user: { id: string; email: string; name: string | null; createdAt: string };
  profile: ProfileFull | null;
  targets: { calories: number; protein: number; carbs: number; fat: number } | null;
}

const REMINDER_TYPES = ["breakfast", "lunch", "dinner", "water", "weigh_in", "workout"] as const;
type ReminderType = (typeof REMINDER_TYPES)[number];
const DEFAULT_TIMES: Record<ReminderType, string> = {
  breakfast: "08:00",
  lunch: "12:30",
  dinner: "19:00",
  water: "15:00",
  weigh_in: "08:30",
  workout: "18:00",
};

export function ProfileScreen() {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const setTab = useAppStore((s) => s.setTab);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const skin = useAppStore((s) => s.skin);
  const setSkin = useAppStore((s) => s.setSkin);

  const [targetsOpen, setTargetsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [foodsOpen, setFoodsOpen] = useState(false);
  const foodsCountQ = useQuery({
    queryKey: ["customFoods"],
    queryFn: () => api<{ foods: CustomFood[] }>("/api/foods/custom"),
  });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [mealNamesOpen, setMealNamesOpen] = useState(false);
  const [remOverrides, setRemOverrides] = useState<Partial<Record<ReminderType, { time?: string; enabled?: boolean }>>>({});
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(() => {
    // ProfileScreen mounts client-side only (after auth gate), safe to read here
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });

  /* ---------- web push (VAPID) ---------- */
  const [pushState, setPushState] = useState<"checking" | "unsupported" | "blocked" | "off" | "on">("checking");
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (alive) setPushState("unsupported");
        return;
      }
      if ("Notification" in window && Notification.permission === "denied") {
        if (alive) setPushState("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (alive) setPushState(sub ? "on" : "off");
      } catch {
        if (alive) setPushState("off");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const enablePush = async () => {
    setPushBusy(true);
    try {
      if ("Notification" in window && Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        setNotifPerm(perm);
        if (perm !== "granted") {
          setPushState(perm === "denied" ? "blocked" : "off");
          return;
        }
      }
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      const keyRes = await api<{ publicKey: string | null }>("/api/push");
      if (!keyRes.publicKey) throw new Error("push-not-configured");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
      await api("/api/push", {
        body: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
          userAgent: navigator.userAgent.slice(0, 300),
        },
      });
      setPushState("on");
      toast({ description: dict.profile.pushOn });
    } catch {
      toast({ description: dict.common.error, variant: "destructive" });
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        await api(`/api/push?endpoint=${encodeURIComponent(endpoint)}`, { method: "DELETE" }).catch(() => {});
      }
      setPushState("off");
      toast({ description: dict.profile.pushOff });
    } finally {
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    setPushBusy(true);
    try {
      const res = await api<{ sent: number }>("/api/push", { method: "PUT" });
      toast({ description: res.sent > 0 ? dict.profile.pushTestSent : dict.profile.pushTestNone });
    } catch {
      toast({ description: dict.common.error, variant: "destructive" });
    } finally {
      setPushBusy(false);
    }
  };

  /* ---------- fitness integrations (Apple Health import) ---------- */
  interface IntegrationPreview {
    massDays: number;
    bodyFatDays: number;
    stepDays: number;
    stepTotal: number;
    workouts: number;
    dateFrom: string | null;
    dateTo: string | null;
    sampleMass: [string, number][];
    sampleWorkouts: { date: string; type: string; durationMin: number }[];
  }
  const healthInputRef = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<IntegrationPreview | null>(null);

  const integrationError = (e: unknown) => {
    if (e instanceof ApiError && e.code === "PREMIUM_REQUIRED") {
      setPaywallOpen(true);
    } else if (e instanceof ApiError && e.code === "NO_HEALTH_DATA") {
      toast({ title: dict.integrations.noData, variant: "destructive" });
    } else {
      toast({ title: dict.common.error, variant: "destructive" });
    }
  };

  const onImportFile = async (file: File) => {
    setImportBusy(true);
    setPendingFile(file);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dryRun", "1");
      const res = await api<{ preview: IntegrationPreview }>("/api/integrations/apple-health", { form });
      setImportPreview(res.preview);
    } catch (e) {
      setPendingFile(null);
      integrationError(e);
    } finally {
      setImportBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    setImportBusy(true);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("dryRun", "0");
      const res = await api<{ imported: { measurements: number; workouts: number; stepDays: number } }>(
        "/api/integrations/apple-health",
        { form }
      );
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["steps"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setImportPreview(null);
      setPendingFile(null);
      const total = res.imported.measurements + res.imported.workouts + res.imported.stepDays;
      toast({ title: dict.integrations.importDone, description: `${total} ${dict.integrations.imported}` });
    } catch (e) {
      integrationError(e);
    } finally {
      setImportBusy(false);
    }
  };


  /* ---------- queries ---------- */
  const profileQ = useQuery<ProfileGet>({
    queryKey: ["profile"],
    queryFn: () => api<ProfileGet>("/api/profile"),
  });

  const remindersQ = useQuery<{ reminders: Reminder[] }>({
    queryKey: ["reminders"],
    queryFn: () => api<{ reminders: Reminder[] }>("/api/reminders"),
  });

  /* ---------- derived ---------- */
  const prof = profileQ.data?.profile;
  const sex: Sex = prof?.sex === "female" ? "female" : "male";
  const floor = CALORIE_FLOOR[sex];
  const memberSince = profileQ.data?.user.createdAt
    ? new Date(profileQ.data.user.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR")
    : null;

  const serverRems = remindersQ.data?.reminders ?? [];
  const remFor = (t: ReminderType) => {
    const found = serverRems.find((r) => r.type === t);
    const o = remOverrides[t] ?? {};
    return { time: o.time ?? found?.time ?? DEFAULT_TIMES[t], enabled: o.enabled ?? found?.enabled ?? false };
  };

  /* ---------- mutations ---------- */
  const saveTargets = useMutation({
    mutationFn: (body: { calories: number; protein: number; carbs: number; fat: number }) =>
      api("/api/targets", { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diary"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setTargetsOpen(false);
      toast({ title: dict.profile.editTargets, description: dict.profile.manualOverride });
    },
    onError: (e) => {
      toast({
        title:
          e instanceof ApiError && e.code === "CALORIE_FLOOR"
            ? dict.profile.healthDisclaimerText
            : dict.errors.validation,
        variant: "destructive",
      });
    },
  });

  const saveProfile = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/profile", { method: "PATCH", body: { ...body, recalculate: true } }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["diary"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setProfileOpen(false);
      try {
        const res = await api<{ user: typeof user }>("/api/auth/me");
        setUser(res.user);
      } catch {
        /* keep current user */
      }
      toast({ title: dict.profile.recalculate });
    },
    onError: () => toast({ title: dict.errors.validation, variant: "destructive" }),
  });

  const patchSettings = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/profile", { method: "PATCH", body }),
    onSuccess: async () => {
      // unitSystem/locale take effect immediately — refresh session user
      try {
        const res = await api<{ user: NonNullable<typeof user> }>("/api/auth/me");
        setUser(res.user);
      } catch {
        /* keep current user */
      }
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const saveReminder = useMutation({
    mutationFn: (body: { type: ReminderType; time: string; enabled: boolean }) =>
      api("/api/reminders", { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reminders"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => toast({ title: dict.errors.validation, variant: "destructive" }),
  });

  const cancelPremium = useMutation({
    mutationFn: () => api("/api/subscription", { body: { action: "cancel" } }),
    onSuccess: async () => {
      setCancelConfirm(false);
      try {
        const res = await api<{ user: typeof user }>("/api/auth/me");
        setUser(res.user);
      } catch {
        /* noop */
      }
      toast({ title: dict.profile.cancelPremium });
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api("/api/account/delete", { method: "DELETE" }),
    onSuccess: () => {
      setDeleteConfirm(false);
      setUser(null);
      setTab("today");
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  /* ---------- loading ---------- */
  if (!user) return null;

  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? "?").toUpperCase();

  return (
    <div className="space-y-5 pb-4">
      {/* Header card */}
      <Card>
        <CardContent className="p-6 flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/30">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold" aria-hidden>
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold truncate">{user.name ?? dict.profile.title}</h1>
              {user.isPremium && (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-amber-950 gap-1">
                  <Crown className="h-3 w-3" aria-hidden />
                  {dict.profile.premium}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            {memberSince && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {dict.profile.memberSince}: {memberSince}
              </p>
            )}
          </div>
        </CardContent>
        <Separator />
        <CardContent className="p-4 grid grid-cols-2 gap-2.5">
          <Button variant="outline" className="min-h-[44px]" onClick={() => setTargetsOpen(true)}>
            <Target className="h-4 w-4" aria-hidden />
            {dict.profile.editTargets}
          </Button>
          <Button variant="outline" className="min-h-[44px]" onClick={() => setProfileOpen(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            {dict.profile.editProfile}
          </Button>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{dict.profile.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Language */}
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0" aria-hidden>
              <Globe className="h-4 w-4 text-accent-foreground" />
            </span>
            <Label htmlFor="set-lang" className="flex-1 text-sm">{dict.profile.language}</Label>
            <Select
              value={locale}
              onValueChange={(v) => {
                setLocale(v as Locale);
                patchSettings.mutate({ locale: v });
              }}
            >
              <SelectTrigger id="set-lang" className="w-28 min-h-[44px]" aria-label={dict.profile.language}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tr">Türkçe</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Units */}
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0" aria-hidden>
              <Ruler className="h-4 w-4 text-accent-foreground" />
            </span>
            <Label htmlFor="set-units" className="flex-1 text-sm">{dict.profile.unitSystem}</Label>
            <Select
              value={user.unitSystem === "imperial" ? "imperial" : "metric"}
              onValueChange={(v) => patchSettings.mutate({ unitSystem: v })}
            >
              <SelectTrigger id="set-units" className="w-40 min-h-[44px]" aria-label={dict.profile.unitSystem}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="metric">{dict.profile.metric}</SelectItem>
                <SelectItem value="imperial">{dict.profile.imperial}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Meal names */}
          <button
            type="button"
            onClick={() => setMealNamesOpen(true)}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg text-left transition-colors hover:bg-accent/50"
            aria-label={dict.profile.mealNames}
          >
            <span className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0" aria-hidden>
              <UtensilsCrossed className="h-4 w-4 text-accent-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{dict.profile.mealNames}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{dict.profile.mealNamesSub}</span>
            </span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>

          <Separator />
        </CardContent>
      </Card>

      {/* Appearance — theme skins (premium-gated) + dark mode */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" aria-hidden />
            {dict.appearance.title}
          </CardTitle>
          <CardDescription>{dict.appearance.sub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const SKINS: { id: Skin; name: string; desc: string; swatch: string; premium: boolean }[] = [
              {
                id: "default",
                name: dict.appearance.default,
                desc: dict.appearance.defaultDesc,
                swatch: "linear-gradient(135deg,#e6f4e9 0%,#8fd3a8 55%,#2f9e63 100%)",
                premium: false,
              },
              {
                id: "glass",
                name: dict.appearance.glass,
                desc: dict.appearance.glassDesc,
                swatch:
                  "linear-gradient(135deg,rgba(126,217,196,.9) 0%,rgba(255,255,255,.55) 48%,rgba(125,196,255,.85) 100%)",
                premium: true,
              },
              {
                id: "midnight",
                name: dict.appearance.midnight,
                desc: dict.appearance.midnightDesc,
                swatch: "linear-gradient(135deg,#0d1322 0%,#123044 62%,#37d9a5 135%)",
                premium: true,
              },
              {
                id: "aurora",
                name: dict.appearance.aurora,
                desc: dict.appearance.auroraDesc,
                swatch: "linear-gradient(135deg,#0f2733 0%,#2c8c99 48%,#7b5be6 105%)",
                premium: true,
              },
            ];
            return (
              <div
                role="radiogroup"
                aria-label={dict.appearance.theme}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3"
              >
                {SKINS.map((s) => {
                  const active = skin === s.id;
                  const locked = s.premium && !user.isPremium;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`${s.name}${locked ? ` — ${dict.appearance.premiumLocked}` : ""}`}
                      onClick={() => {
                        if (locked) {
                          setPaywallOpen(true);
                          return;
                        }
                        setSkin(s.id);
                      }}
                      className={cn(
                        "kai-pressable relative rounded-xl border p-2.5 text-left min-h-[44px] transition-all",
                        active
                          ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <div
                        className="relative h-14 w-full overflow-hidden rounded-lg border border-border/60 shadow-inner"
                        style={{ background: s.swatch }}
                        aria-hidden
                      >
                        {/* mini glass card preview */}
                        <div className="absolute left-2 top-2 h-6 w-10 rounded-md border border-white/70 bg-white/55 shadow-sm backdrop-blur-[2px]" />
                        <div className="absolute left-2 bottom-2 h-1.5 w-14 rounded-full bg-white/50" />
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{s.name}</span>
                        {locked && (
                          <Lock className="h-3 w-3 shrink-0 text-amber-500" aria-label={dict.appearance.premiumLocked} />
                        )}
                        {!locked && active && (
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        )}
                      </div>
                      <span className="block text-[11px] leading-tight text-muted-foreground">{s.desc}</span>
                      {locked && (
                        <span className="mt-0.5 block text-[10px] font-medium text-amber-600 dark:text-amber-500">
                          {dict.appearance.lockedSub}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Dark mode */}
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0" aria-hidden>
              <Moon className="h-4 w-4 text-accent-foreground" />
            </span>
            <Label htmlFor="set-dark" className="flex-1 text-sm">{dict.profile.darkMode}</Label>
            <Switch
              id="set-dark"
              checked={theme === "dark"}
              onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fitness integrations — Apple Health / Watch */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Watch className="h-4 w-4 text-primary" aria-hidden />
            {dict.integrations.title}
          </CardTitle>
          <CardDescription>{dict.integrations.sub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Apple Health — file import */}
          <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/10"
              aria-hidden
            >
              <HeartPulse className="h-5 w-5 text-rose-500" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{dict.integrations.appleHealth}</p>
              <p className="text-[11px] text-muted-foreground">{dict.integrations.appleHealthSub}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{dict.integrations.fileHint}</p>
            </div>
            <input
              ref={healthInputRef}
              type="file"
              accept=".zip,.xml,application/xml,text/xml,application/zip"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onImportFile(f);
              }}
            />
            {!user.isPremium ? (
              <Button
                size="sm"
                variant="outline"
                className="min-h-[36px] w-full shrink-0 justify-center gap-1.5 sm:ml-auto sm:w-auto"
                onClick={() => setPaywallOpen(true)}
              >
                <Lock className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                {dict.integrations.importBtn}
              </Button>
            ) : (
              <Button
                size="sm"
                className="min-h-[36px] w-full shrink-0 justify-center sm:ml-auto sm:w-auto"
                onClick={() => healthInputRef.current?.click()}
                disabled={importBusy}
              >
                {importBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden />
                )}
                {importBusy ? dict.integrations.importing : dict.integrations.importBtn}
              </Button>
            )}
          </div>

          {/* Apple Watch — flows in via Apple Health */}
          <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent" aria-hidden>
              <Watch className="h-5 w-5 text-accent-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{dict.integrations.appleWatch}</p>
              <p className="text-[11px] text-muted-foreground">{dict.integrations.appleWatchSub}</p>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 w-fit gap-1 border-primary/40 bg-primary/5 text-primary"
            >
              <Check className="h-3 w-3" aria-hidden />
              {dict.integrations.viaHealth}
            </Badge>
          </div>

          {/* Google Fit — coming soon */}
          <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent" aria-hidden>
              <Smartphone className="h-5 w-5 text-accent-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{dict.integrations.googleFit}</p>
              <p className="text-[11px] text-muted-foreground">{dict.integrations.googleFitSub}</p>
            </div>
            <Badge variant="outline" className="shrink-0 w-fit text-muted-foreground">
              {dict.integrations.comingSoon}
            </Badge>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden />
            {dict.integrations.supported}
          </p>
        </CardContent>
      </Card>

      {/* Reminders */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" aria-hidden />
            {dict.profile.reminders}
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {dict.profile.quietHours}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Browser notification permission */}
          <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-accent/30 p-3 sm:flex-row sm:items-center">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card"
              aria-hidden
            >
              {notifPerm === "granted" ? (
                <BellRing className="h-4 w-4 text-primary" />
              ) : notifPerm === "denied" ? (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Bell className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {notifPerm === "granted"
                  ? dict.profile.notificationsOn
                  : notifPerm === "denied"
                    ? dict.profile.notificationsBlocked
                    : notifPerm === "unsupported"
                      ? dict.profile.notificationsTest
                      : dict.profile.notificationsEnable}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{dict.profile.reminders}</p>
            </div>
            {notifPerm === "default" && (
              <Button
                size="sm"
                className="min-h-[36px] w-full shrink-0 justify-center sm:ml-auto sm:w-auto"
                onClick={async () => {
                  try {
                    const perm = await Notification.requestPermission();
                    setNotifPerm(perm);
                    if (perm === "granted") {
                      new Notification("KaloriAI", { body: dict.profile.notificationsOn });
                    }
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <BellRing className="h-3.5 w-3.5" aria-hidden />
                {dict.profile.notificationsEnable}
              </Button>
            )}
            {notifPerm === "granted" && (
              <Badge variant="outline" className="shrink-0 gap-1 border-primary/40 bg-primary/5 text-primary">
                <BadgeCheck className="h-3 w-3" aria-hidden />
                ON
              </Badge>
            )}
          </div>
          {/* Web push — background notifications (VAPID) */}
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card" aria-hidden>
              {pushState === "on" ? (
                <Send className="h-4 w-4 text-primary" />
              ) : pushState === "blocked" || pushState === "unsupported" ? (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Send className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {pushState === "on"
                  ? dict.profile.pushOn
                  : pushState === "unsupported"
                    ? dict.profile.pushUnsupported
                    : pushState === "blocked"
                      ? dict.profile.notificationsBlocked
                      : dict.profile.pushOff}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{dict.profile.pushSub}</p>
            </div>
            {pushState === "checking" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : pushState === "off" ? (
              <Button
                size="sm"
                className="min-h-[36px] w-full shrink-0 justify-center sm:ml-auto sm:w-auto"
                onClick={enablePush}
                disabled={pushBusy}
              >
                {pushBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <BellRing className="h-3.5 w-3.5" aria-hidden />}
                {dict.profile.pushEnable}
              </Button>
            ) : pushState === "on" ? (
              <div className="flex w-full shrink-0 items-center gap-1.5 sm:ml-auto sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[36px] flex-1 justify-center gap-1.5 sm:flex-none"
                  onClick={testPush}
                  disabled={pushBusy}
                >
                  {pushBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                  {dict.profile.pushTest}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[36px] shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={disablePush}
                  disabled={pushBusy}
                  aria-label={dict.profile.pushDisable}
                >
                  <BellOff className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
          {pushState === "on" && (
            <p className="flex items-start gap-1.5 rounded-lg bg-primary/[0.06] px-3 py-2 text-[11px] leading-snug text-primary">
              <Server className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>{dict.profile.pushServerHint}</span>
            </p>
          )}
          {remindersQ.isLoading ? (
            <div className="space-y-2" aria-busy>
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : (
            REMINDER_TYPES.map((t) => {
              const rem = remFor(t);
              return (
                <div key={t} className="flex items-center gap-3 rounded-xl border p-3">
                  <Label htmlFor={`rem-${t}`} className="flex-1 text-sm cursor-pointer">
                    {dict.profile.reminderTypes[t]}
                  </Label>
                  <Input
                    type="time"
                    id={`rem-time-${t}`}
                    value={rem.time}
                    onChange={(e) => {
                      const time = e.target.value;
                      setRemOverrides((s) => ({ ...s, [t]: { ...s[t], time } }));
                      if (time) saveReminder.mutate({ type: t, time, enabled: rem.enabled });
                    }}
                    className="w-32 min-h-[44px] text-sm"
                    aria-label={`${dict.profile.reminderTypes[t]} — ${dict.profile.reminders}`}
                  />
                  <Switch
                    id={`rem-${t}`}
                    checked={rem.enabled}
                    onCheckedChange={(v) => {
                      setRemOverrides((s) => ({ ...s, [t]: { ...s[t], enabled: v } }));
                      saveReminder.mutate({ type: t, time: rem.time, enabled: v });
                    }}
                    aria-label={dict.profile.reminderTypes[t]}
                  />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" aria-hidden />
            {dict.profile.subscription}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Badge variant={user.isPremium ? "default" : "secondary"} className="text-xs">
              {user.isPremium ? dict.profile.premium : dict.profile.free}
            </Badge>
            {user.isPremium && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                {dict.profile.premiumActive}
              </span>
            )}
          </div>
          <div className="sm:ml-auto">
            {user.isPremium ? (
              <Button
                variant="outline"
                className="min-h-[44px] text-destructive hover:text-destructive"
                onClick={() => setCancelConfirm(true)}
                disabled={cancelPremium.isPending}
              >
                {cancelPremium.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {dict.profile.cancelPremium}
              </Button>
            ) : (
              <Button
                onClick={() => setPaywallOpen(true)}
                className="min-h-[44px] bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold"
              >
                <Crown className="h-4 w-4" aria-hidden />
                {dict.profile.upgrade}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PWA install (visible when the browser marks the app installable) */}
      <PwaInstallCard />

      {/* Custom foods manager */}
      <Card className="kai-card-hover">
        <CardContent className="p-4">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg p-2 text-left min-h-[44px] transition-colors hover:bg-accent/40"
            onClick={() => setFoodsOpen(true)}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden>
              <Apple className="h-4 w-4 text-primary" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{dict.diary.customFoods}</span>
              <span className="block text-xs text-muted-foreground">{dict.profile.myFoodsSub}</span>
            </span>
            <Badge variant="outline" className="shrink-0 rounded-full tabular-nums">
              {foodsCountQ.data?.foods.length ?? "…"}
            </Badge>
          </button>
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" aria-hidden />
            {dict.profile.data}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => window.open("/api/export?format=json", "_blank")}
            >
              <FileJson className="h-4 w-4" aria-hidden />
              {dict.profile.exportData}
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => window.open("/api/export?format=csv", "_blank")}
            >
              <Download className="h-4 w-4" aria-hidden />
              {dict.profile.exportCsv}
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full min-h-[44px] text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteConfirm(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {dict.profile.deleteAccount}
          </Button>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card>
        <CardContent className="p-4">
          <button
            type="button"
            className="w-full flex items-center gap-3 text-left min-h-[44px] rounded-lg hover:bg-accent/40 transition-colors p-2"
            onClick={() => setPrivacyOpen(true)}
          >
            <span className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0" aria-hidden>
              <Shield className="h-4 w-4 text-accent-foreground" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{dict.profile.privacy}</span>
              <span className="block text-xs text-muted-foreground">{dict.profile.privacySub}</span>
            </span>
          </button>
          <div className="my-2 h-px bg-border" role="separator" />
          <button
            type="button"
            className="w-full flex items-center gap-3 text-left min-h-[44px] rounded-lg hover:bg-accent/40 transition-colors p-2 disabled:opacity-60"
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await api("/api/auth/logout", { method: "POST" });
              } catch {
                /* session already gone — continue to local clear */
              }
              setUser(null);
            }}
          >
            <span className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0" aria-hidden>
              {loggingOut ? (
                <Loader2 className="h-4 w-4 text-destructive animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 text-destructive" />
              )}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{dict.auth.logout}</span>
              <span className="block text-xs text-muted-foreground">{user.email}</span>
            </span>
          </button>
        </CardContent>
      </Card>

      {/* Targets dialog — mounted only while open so fields seed from fresh data */}
      {targetsOpen && (
        <TargetsDialog
          open
          onOpenChange={setTargetsOpen}
          dict={dict}
          floor={floor}
          initial={profileQ.data?.targets ?? null}
          pending={saveTargets.isPending}
          onSave={(b) => saveTargets.mutate(b)}
        />
      )}

      {/* Profile edit dialog — mounted only while open */}
      {profileOpen && (
        <ProfileDialog
          open
          onOpenChange={setProfileOpen}
          dict={dict}
          userName={user.name ?? ""}
          profile={prof ?? null}
          pending={saveProfile.isPending}
          onSave={(b) => saveProfile.mutate(b)}
        />
      )}

      {/* Privacy dialog */}
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby="privacy-desc">
          <DialogHeader>
            <DialogTitle>{dict.privacy.title}</DialogTitle>
            <DialogDescription id="privacy-desc">{dict.profile.privacySub}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="leading-relaxed">{dict.privacy.intro}</p>
            <p className="leading-relaxed">{dict.privacy.rights}</p>
            <p className="leading-relaxed">{dict.privacy.storage}</p>
            <p className="leading-relaxed">{dict.privacy.aiData}</p>
            <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4" role="note">
              <div className="flex items-center gap-2 font-semibold text-sm mb-1.5">
                <HeartPulse className="h-4 w-4 text-amber-600" aria-hidden />
                {dict.profile.healthDisclaimer}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{dict.profile.healthDisclaimerText}</p>
            </div>
            <p className="text-xs text-muted-foreground">{dict.auth.disclaimer}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel premium confirm */}
      <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.profile.cancelPremium}</AlertDialogTitle>
            <AlertDialogDescription>{dict.premium.legal}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                cancelPremium.mutate();
              }}
            >
              {dict.profile.cancelPremium}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete account confirm */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.profile.deleteAccount}</AlertDialogTitle>
            <AlertDialogDescription>{dict.profile.deleteConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                deleteAccount.mutate();
              }}
            >
              {dict.profile.deleteAccount}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apple Health import preview */}
      <Dialog
        open={importPreview !== null}
        onOpenChange={(v) => {
          if (!v) {
            setImportPreview(null);
            setPendingFile(null);
          }
        }}
      >
        <DialogContent className="max-w-md" aria-describedby="ah-preview-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" aria-hidden />
              {dict.integrations.previewTitle}
            </DialogTitle>
            <DialogDescription id="ah-preview-desc">{dict.integrations.previewSub}</DialogDescription>
          </DialogHeader>
          {importPreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Weight className="h-3.5 w-3.5" aria-hidden />
                    {dict.integrations.massDays}
                  </div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums">{importPreview.massDays}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Percent className="h-3.5 w-3.5" aria-hidden />
                    {dict.integrations.bodyFatDays}
                  </div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums">{importPreview.bodyFatDays}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Footprints className="h-3.5 w-3.5" aria-hidden />
                    {dict.integrations.stepDays}
                  </div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums">
                    {importPreview.stepDays}
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                      {importPreview.stepTotal.toLocaleString()} {dict.integrations.stepTotal}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" aria-hidden />
                    {dict.integrations.workouts}
                  </div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums">{importPreview.workouts}</div>
                </div>
              </div>

              {importPreview.dateFrom && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {dict.integrations.range}: {importPreview.dateFrom} → {importPreview.dateTo}
                </p>
              )}

              {importPreview.sampleMass.length > 0 && (
                <div className="rounded-xl border bg-accent/30 p-3">
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{dict.integrations.sample}</p>
                  <ul className="space-y-1">
                    {importPreview.sampleMass.map(([d, kg]) => (
                      <li key={d} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{d}</span>
                        <span className="font-semibold tabular-nums">{kg} kg</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => {
                    setImportPreview(null);
                    setPendingFile(null);
                  }}
                >
                  {dict.integrations.cancel}
                </Button>
                <Button className="min-h-[44px]" onClick={confirmImport} disabled={importBusy}>
                  {importBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  {dict.integrations.confirmImport}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PaywallDialog open={paywallOpen} onClose={() => setPaywallOpen(false)} />

      {mealNamesOpen && <MealNamesDialog onClose={() => setMealNamesOpen(false)} />}

      {/* Custom foods manager dialog */}
      <CustomFoodsDialog open={foodsOpen} onOpenChange={setFoodsOpen} dict={dict} />
    </div>
  );
}

/* ================= Meal names dialog ================= */
const MEAL_KEY_LIST: { key: MealKey; icon: typeof Coffee }[] = [
  { key: "breakfast", icon: Coffee },
  { key: "lunch", icon: Sun },
  { key: "dinner", icon: Moon },
  { key: "snacks", icon: Apple },
];

function MealNamesDialog({ onClose }: { onClose: () => void }) {
  const dict = useAppStore((s) => s.dict);
  const mealNames = useAppStore((s) => s.mealNames);
  const setMealNames = useAppStore((s) => s.setMealNames);
  const { toast } = useToast();

  // mounted only when open → initializer reads latest store each time
  const [names, setNames] = useState<Record<MealKey, string>>(() => ({
    breakfast: mealNames?.breakfast ?? "",
    lunch: mealNames?.lunch ?? "",
    dinner: mealNames?.dinner ?? "",
    snacks: mealNames?.snacks ?? "",
  }));

  const save = useMutation({
    mutationFn: (payload: string | null) =>
      api("/api/profile", { method: "PATCH", body: { mealNames: payload } }),
    onSuccess: (_data, payload) => {
      setMealNames(payload === null ? null : (JSON.parse(payload) as Partial<Record<MealKey, string>>));
      toast({ title: dict.profile.mealNamesSaved });
      onClose();
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const submit = () => {
    const cleaned: Partial<Record<MealKey, string>> = {};
    for (const { key } of MEAL_KEY_LIST) {
      const v = names[key].trim().slice(0, 24);
      if (v) cleaned[key] = v;
    }
    save.mutate(Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-primary" aria-hidden />
            {dict.profile.mealNames}
          </DialogTitle>
          <DialogDescription>{dict.profile.mealNamesSub}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {MEAL_KEY_LIST.map(({ key, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden>
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <Label htmlFor={`mn-${key}`} className="text-xs text-muted-foreground">
                  {dict.today[key]}
                </Label>
                <Input
                  id={`mn-${key}`}
                  value={names[key]}
                  maxLength={24}
                  onChange={(e) => setNames((s) => ({ ...s, [key]: e.target.value }))}
                  placeholder={dict.today[key]}
                  className="mt-1 min-h-[40px]"
                  autoComplete="off"
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setNames({ breakfast: "", lunch: "", dinner: "", snacks: "" })}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {dict.profile.mealNamesReset}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {dict.common.cancel}
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {dict.common.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================= Targets dialog ================= */
function TargetsDialog({
  open,
  onOpenChange,
  dict,
  floor,
  initial,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dict: ReturnType<typeof useAppStore.getState>["dict"];
  floor: number;
  initial: { calories: number; protein: number; carbs: number; fat: number } | null;
  pending: boolean;
  onSave: (b: { calories: number; protein: number; carbs: number; fat: number }) => void;
}) {
  const [calories, setCalories] = useState(initial ? String(initial.calories) : "");
  const [protein, setProtein] = useState(initial ? String(initial.protein) : "");
  const [carbs, setCarbs] = useState(initial ? String(initial.carbs) : "");
  const [fat, setFat] = useState(initial ? String(initial.fat) : "");

  const calNum = Number(calories);
  const belowFloor = calories !== "" && Number.isFinite(calNum) && calNum < floor;

  const fields: [string, string, string, (v: string) => void][] = [
    ["calories", dict.onboarding.calorieTarget, dict.common.kcal, setCalories],
    ["protein", dict.onboarding.protein, dict.common.g, setProtein],
    ["carbs", dict.onboarding.carbs, dict.common.g, setCarbs],
    ["fat", dict.onboarding.fat, dict.common.g, setFat],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="targets-desc">
        <DialogHeader>
          <DialogTitle>{dict.profile.editTargets}</DialogTitle>
          <DialogDescription id="targets-desc">{dict.profile.manualOverride}</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (belowFloor) return;
            onSave({
              calories: Math.round(calNum),
              protein: Math.max(0, Math.round(Number(protein) || 0)),
              carbs: Math.max(0, Math.round(Number(carbs) || 0)),
              fat: Math.max(0, Math.round(Number(fat) || 0)),
            });
          }}
        >
          {fields.map(([id, label, unit, set]) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={`tg-${id}`}>{`${label} (${unit})`}</Label>
              <Input
                id={`tg-${id}`}
                type="number"
                min="0"
                inputMode="numeric"
                value={id === "calories" ? calories : id === "protein" ? protein : id === "carbs" ? carbs : fat}
                onChange={(e) => set(e.target.value)}
                required
                className="min-h-[44px]"
              />
            </div>
          ))}
          {belowFloor && (
            <p className="col-span-2 rounded-lg bg-amber-500/10 border border-amber-500/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-500" role="alert">
              {dict.onboarding.flooredWarning} (≥ {floor} {dict.common.kcal})
            </p>
          )}
          <DialogFooter className="col-span-2 gap-2 sm:gap-0">
            <Button type="button" variant="ghost" className="min-h-[44px]" onClick={() => onOpenChange(false)}>
              {dict.common.cancel}
            </Button>
            <Button type="submit" className="min-h-[44px]" disabled={pending || belowFloor}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {dict.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ================= Profile edit dialog ================= */
function ProfileDialog({
  open,
  onOpenChange,
  dict,
  userName,
  profile,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dict: ReturnType<typeof useAppStore.getState>["dict"];
  userName: string;
  profile: ProfileFull | null;
  pending: boolean;
  onSave: (b: Record<string, unknown>) => void;
}) {
  const unitSystem = useAppStore((s) => s.user?.unitSystem ?? "metric");
  const isImperial = unitSystem === "imperial";
  const toDisplayWeight = (kg: number | null | undefined) =>
    kg == null ? "" : String(isImperial ? Math.round(kgToLb(kg) * 10) / 10 : Math.round(kg * 10) / 10);
  const [name, setName] = useState(userName);
  const [weightKg, setWeightKg] = useState(toDisplayWeight(profile?.weightKg));
  const [goalWeightKg, setGoalWeightKg] = useState(toDisplayWeight(profile?.goalWeightKg));
  const [goal, setGoal] = useState<Goal>((profile?.goal as Goal) ?? "maintain");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>((profile?.activityLevel as ActivityLevel) ?? "moderate");
  const [weeklyRateKg, setWeeklyRateKg] = useState(
    profile?.weeklyRateKg != null
      ? String(isImperial ? Math.round(kgToLb(profile.weeklyRateKg) * 100) / 100 : profile.weeklyRateKg)
      : isImperial ? "1.1" : "0.5"
  );
  const [userType, setUserType] = useState<UserType>((profile?.userType as UserType) ?? "general");
  const wMin = isImperial ? 55 : 25;
  const wMax = isImperial ? 880 : 400;
  const rateMax = isImperial ? 2.2 : 1;
  const rateStep = isImperial ? 0.1 : 0.05;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby="profedit-desc">
        <DialogHeader>
          <DialogTitle>{dict.profile.editProfile}</DialogTitle>
          <DialogDescription id="profedit-desc">{dict.profile.recalculate}</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const convW = (v: string) => {
              const n = Number(v);
              if (!Number.isFinite(n)) return null;
              return Math.round((isImperial ? lbToKg(n) : n) * 10) / 10;
            };
            const rate = Number(weeklyRateKg);
            onSave({
              name: name.trim(),
              weightKg: convW(weightKg),
              goalWeightKg: goalWeightKg.trim() === "" ? null : convW(goalWeightKg),
              goal,
              activityLevel,
              weeklyRateKg: Math.round((isImperial ? lbToKg(rate) : rate) * 100) / 100,
              userType,
            });
          }}
        >
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="pf-name">{dict.auth.name}</Label>
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-weight">{`${dict.onboarding.weight} (${isImperial ? dict.common.lb : dict.common.kg})`}</Label>
            <Input id="pf-weight" type="number" step="0.1" min={wMin} max={wMax} inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} required className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-goalweight">{`${dict.onboarding.goalWeight} (${isImperial ? dict.common.lb : dict.common.kg})`}</Label>
            <Input id="pf-goalweight" type="number" step="0.1" min={wMin} max={wMax} inputMode="decimal" value={goalWeightKg} onChange={(e) => setGoalWeightKg(e.target.value)} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-goal">{dict.onboarding.goal}</Label>
            <Select value={goal} onValueChange={(v) => setGoal(v as Goal)}>
              <SelectTrigger id="pf-goal" className="min-h-[44px] w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lose">{dict.onboarding.lose}</SelectItem>
                <SelectItem value="maintain">{dict.onboarding.maintain}</SelectItem>
                <SelectItem value="gain">{dict.onboarding.gain}</SelectItem>
                <SelectItem value="muscle">{dict.onboarding.muscle}</SelectItem>
                <SelectItem value="performance">{dict.onboarding.performance}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-activity">{dict.onboarding.activity}</Label>
            <Select value={activityLevel} onValueChange={(v) => setActivityLevel(v as ActivityLevel)}>
              <SelectTrigger id="pf-activity" className="min-h-[44px] w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentary">{dict.onboarding.sedentary}</SelectItem>
                <SelectItem value="light">{dict.onboarding.light}</SelectItem>
                <SelectItem value="moderate">{dict.onboarding.moderate}</SelectItem>
                <SelectItem value="active">{dict.onboarding.active}</SelectItem>
                <SelectItem value="very_active">{dict.onboarding.veryActive}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-rate">{`${dict.onboarding.weeklyRate} (${isImperial ? dict.common.lb : dict.common.kg})`}</Label>
            <Input id="pf-rate" type="number" step={rateStep} min={rateStep} max={rateMax} inputMode="decimal" value={weeklyRateKg} onChange={(e) => setWeeklyRateKg(e.target.value)} required className="min-h-[44px]" />
            <p className="text-[11px] text-muted-foreground">{dict.onboarding.weeklyRateSub}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-usertype">{dict.onboarding.userType}</Label>
            <Select value={userType} onValueChange={(v) => setUserType(v as UserType)}>
              <SelectTrigger id="pf-usertype" className="min-h-[44px] w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">{dict.onboarding.general}</SelectItem>
                <SelectItem value="athlete">{dict.onboarding.athlete}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="col-span-2 gap-2 sm:gap-0">
            <Button type="button" variant="ghost" className="min-h-[44px]" onClick={() => onOpenChange(false)}>
              {dict.common.cancel}
            </Button>
            <Button type="submit" className="min-h-[44px]" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {dict.profile.recalculate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
