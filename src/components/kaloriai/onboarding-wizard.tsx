"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  TrendingDown,
  Equal,
  TrendingUp,
  Dumbbell,
  Medal,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Droplets,
  Flame,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { api, ApiError } from "@/lib/api";
import { calcAge } from "@/lib/calculations";
import { kgToLb, lbToKg, cmToFtIn, ftInToCm } from "@/lib/units";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

type Sex = "male" | "female";
type Goal = "lose" | "maintain" | "gain" | "muscle" | "performance";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
type UserType = "general" | "athlete";
type Diet = "any" | "vegetarian" | "vegan" | "gluten_free" | "halal";

interface PlanTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  bmr: number;
  tdee: number;
  floored: boolean;
  formula: string;
}

interface PlanResponse {
  ok: boolean;
  targets: PlanTargets;
  waterTarget: number;
}

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    locale: string;
    unitSystem: string;
    isPremium: boolean;
    onboarded: boolean;
  } | null;
}

interface FormState {
  sex: Sex | null;
  birthDate: string;
  heightCm: string; // display value: cm (metric) or ft (imperial)
  heightIn: string; // inches part (imperial only)
  weightKg: string; // display value: kg (metric) or lb (imperial)
  goalWeightKg: string; // display value: kg or lb
  bodyFatPct: string;
  goal: Goal | null;
  weeklyRateKg: number;
  activityLevel: ActivityLevel | null;
  userType: UserType;
  dietPreference: Diet;
  allergens: string;
  trainingDayTarget: boolean;
  carbCycling: boolean;
}

const TOTAL_STEPS = 6;
const EMPTY: FormState = {
  sex: null,
  birthDate: "",
  heightCm: "",
  heightIn: "",
  weightKg: "",
  goalWeightKg: "",
  bodyFatPct: "",
  goal: null,
  weeklyRateKg: 0.5,
  activityLevel: null,
  userType: "general",
  dietPreference: "any",
  allergens: "",
  trainingDayTarget: false,
  carbCycling: false,
};

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function OnboardingWizard() {
  const { dict, locale, setLocale } = useAppStore();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const isImperial = unit === "imperial";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const age = useMemo(() => (form.birthDate ? calcAge(form.birthDate) : null), [form.birthDate]);
  const under18 = age !== null && age < 18;
  const showWeeklyRate = form.goal === "lose" || form.goal === "gain";

  /** Per-step validation; returns error key → message using dict strings only */
  function validateStep(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    const o = dict.onboarding;
    if (s === 1) {
      if (!form.sex) e.sex = dict.errors.validation;
      const bd = form.birthDate;
      if (!bd || isNaN(new Date(bd).getTime()) || new Date(bd) > new Date()) e.birthDate = dict.errors.validation;
      if (isImperial) {
        const ft = num(form.heightCm);
        const inch = num(form.heightIn) ?? 0;
        if (ft === null || ft < 2 || ft > 8) e.heightCm = dict.errors.validation;
        else if (inch < 0 || inch > 11.9) e.heightIn = dict.errors.validation;
        const cm = ft === null ? null : ftInToCm(ft, inch);
        if (cm !== null && (cm < 80 || cm > 250)) e.heightCm = dict.errors.validation;
      } else {
        const h = num(form.heightCm);
        if (h === null || h < 80 || h > 250) e.heightCm = dict.errors.validation;
      }
      const wLimit = isImperial ? { min: 55, max: 880 } : { min: 25, max: 400 };
      const w = num(form.weightKg);
      if (w === null || w < wLimit.min || w > wLimit.max) e.weightKg = dict.errors.validation;
      const gw = num(form.goalWeightKg);
      if (gw !== null && (gw < wLimit.min || gw > wLimit.max)) e.goalWeightKg = dict.errors.validation;
      const bf = num(form.bodyFatPct);
      if (bf !== null && (bf < 3 || bf > 60)) e.bodyFatPct = dict.errors.validation;
    }
    if (s === 2 && !form.goal) e.goal = dict.errors.validation;
    if (s === 3 && !form.activityLevel) e.activityLevel = dict.errors.validation;
    if (s === 4 && form.allergens.length > 200) e.allergens = dict.errors.validation;
    void o;
    return e;
  }

  function goNext() {
    const e = validateStep(step);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    if (step === TOTAL_STEPS - 2) {
      void submitPlan();
    } else {
      setDir(1);
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    }
  }

  function goBack() {
    setDir(-1);
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submitPlan() {
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api<PlanResponse>("/api/onboarding", {
        body: {
          locale,
          unitSystem: unit,
          sex: form.sex,
          birthDate: form.birthDate,
          heightCm: isImperial
            ? (() => {
                const ft = num(form.heightCm);
                const inch = num(form.heightIn) ?? 0;
                return ft === null ? null : Math.round(ftInToCm(ft, inch) * 10) / 10;
              })()
            : num(form.heightCm),
          weightKg: (() => {
            const w = num(form.weightKg);
            return w === null ? null : Math.round((isImperial ? lbToKg(w) : w) * 10) / 10;
          })(),
          goalWeightKg: (() => {
            const gw = num(form.goalWeightKg);
            return gw === null ? null : Math.round((isImperial ? lbToKg(gw) : gw) * 10) / 10;
          })(),
          bodyFatPct: num(form.bodyFatPct),
          goal: form.goal,
          weeklyRateKg: form.weeklyRateKg,
          activityLevel: form.activityLevel,
          userType: form.userType,
          dietPreference: form.dietPreference,
          allergens: form.allergens.trim(),
          trainingDayTarget: form.trainingDayTarget,
          carbCycling: form.carbCycling,
        },
      });
      setPlan(res);
      setDir(1);
      setStep(TOTAL_STEPS - 1);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "UNKNOWN";
      toast({
        title: dict.common.error,
        description: code === "VALIDATION" ? dict.errors.validation : dict.errors.network,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function finish() {
    try {
      const res = await api<MeResponse>("/api/auth/me");
      if (res.user) useAppStore.getState().setUser(res.user);
    } catch {
      toast({ title: dict.common.error, description: dict.errors.network, variant: "destructive" });
    }
  }

  /* ---------- Small building blocks ---------- */

  function ChoiceCard({
    selected,
    onSelect,
    icon: Icon,
    label,
    sub,
    name,
  }: {
    selected: boolean;
    onSelect: () => void;
    icon?: React.ComponentType<{ className?: string }>;
    label: string;
    sub?: string;
    name: string;
  }) {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
          selected
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border bg-card hover:bg-accent"
        )}
      >
        {Icon && (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <span className="flex-1">
          <span className="block font-medium leading-tight">{label}</span>
          {sub && <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>}
        </span>
        {selected && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
        <span className="sr-only">{name}</span>
      </button>
    );
  }

  function Segmented({
    options,
    value,
    onChange,
    label,
  }: {
    options: { value: string; label: string }[];
    value: string | null;
    onChange: (v: string) => void;
    label: string;
  }) {
    return (
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 rounded-xl border px-4 py-2.5 font-medium transition-colors",
              value === o.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card hover:bg-accent"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  const stepHeader = (title: string, sub?: string) => (
    <div className="space-y-1">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  );

  const errLine = (key: string) =>
    errors[key] ? (
      <p id={`ob-${key}-error`} role="alert" className="text-sm text-destructive mt-1.5">
        {errors[key]}
      </p>
    ) : null;

  const numberField = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { unit?: string; placeholder?: string; sub?: string; errorKey?: string; optional?: boolean } = {}
  ) => (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {opts.optional && (
          <span className="text-xs text-muted-foreground">{dict.common.optional}</span>
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          placeholder={opts.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!(opts.errorKey && errors[opts.errorKey])}
          aria-describedby={opts.errorKey && errors[opts.errorKey] ? `ob-${opts.errorKey}-error` : undefined}
          className={cn("min-h-11 pr-12", opts.errorKey && errors[opts.errorKey] && "border-destructive")}
        />
        {opts.unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {opts.unit}
          </span>
        )}
      </div>
      {opts.sub && <p className="text-xs text-muted-foreground">{opts.sub}</p>}
      {opts.errorKey && errLine(opts.errorKey)}
    </div>
  );

  /* ---------- Steps ---------- */

  const languageStep = (
    <div className="space-y-4">
      {stepHeader(dict.onboarding.language, dict.onboarding.languageSub)}
      <div role="radiogroup" aria-label={dict.onboarding.language} className="grid gap-3 sm:grid-cols-2">
        {(["tr", "en"] as Locale[]).map((l) => (
          <ChoiceCard
            key={l}
            name={`locale-${l}`}
            selected={locale === l}
            onSelect={() => setLocale(l)}
            label={l === "tr" ? "Türkçe" : "English"}
            sub={l === "tr" ? "Varsayılan" : "Default"}
          />
        ))}
      </div>
      <div className="space-y-2 pt-1">
        <Label>{dict.profile.unitSystem}</Label>
        <Segmented
          label={dict.profile.unitSystem}
          value={unit}
          onChange={(v) => setUnit(v === "imperial" ? "imperial" : "metric")}
          options={[
            { value: "metric", label: dict.profile.metric },
            { value: "imperial", label: dict.profile.imperial },
          ]}
        />
      </div>
    </div>
  );

  const aboutStep = (
    <div className="space-y-5">
      {stepHeader(dict.onboarding.aboutYou, dict.onboarding.aboutYouSub)}
      {under18 && (
        <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600">
          <AlertTriangle aria-hidden />
          <AlertTitle>{dict.onboarding.under18Warning}</AlertTitle>
        </Alert>
      )}
      <div className="space-y-2">
        <Label>{dict.onboarding.sex}</Label>
        <Segmented
          label={dict.onboarding.sex}
          value={form.sex}
          onChange={(v) => set("sex", v as Sex)}
          options={[
            { value: "male", label: dict.onboarding.male },
            { value: "female", label: dict.onboarding.female },
          ]}
        />
        {errLine("sex")}
      </div>
      <div className="space-y-2">
        <Label htmlFor="ob-birthdate">{dict.onboarding.birthDate}</Label>
        <Input
          id="ob-birthdate"
          type="date"
          value={form.birthDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => set("birthDate", e.target.value)}
          aria-invalid={!!errors.birthDate}
          aria-describedby={errors.birthDate ? "ob-birthDate-error" : undefined}
          className="min-h-11"
        />
        {age !== null && !errors.birthDate && (
          <p className="text-xs text-muted-foreground">{age}</p>
        )}
        {errLine("birthDate")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {isImperial ? (
          <div className="space-y-2">
            <Label htmlFor="ob-height-ft">{dict.onboarding.height}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ob-height-ft"
                type="number"
                inputMode="decimal"
                placeholder="5"
                value={form.heightCm}
                onChange={(e) => set("heightCm", e.target.value)}
                aria-invalid={!!errors.heightCm}
                aria-describedby={errors.heightCm ? "ob-heightCm-error" : undefined}
                className={cn("min-h-11 pr-9", errors.heightCm && "border-destructive")}
              />
              <span className="shrink-0 text-sm text-muted-foreground">{dict.common.ft}</span>
              <Input
                id="ob-height-in"
                type="number"
                inputMode="decimal"
                placeholder="9"
                value={form.heightIn}
                onChange={(e) => set("heightIn", e.target.value)}
                aria-invalid={!!errors.heightIn}
                aria-describedby={errors.heightIn ? "ob-heightIn-error" : undefined}
                className={cn("min-h-11 pr-9", errors.heightIn && "border-destructive")}
              />
              <span className="shrink-0 text-sm text-muted-foreground">{dict.common.inch}</span>
            </div>
            {errLine("heightCm")}
            {errLine("heightIn")}
          </div>
        ) : (
          numberField("ob-height", dict.onboarding.height, form.heightCm, (v) => set("heightCm", v), {
            unit: dict.common.cm,
            errorKey: "heightCm",
          })
        )}
        {numberField(
          "ob-weight",
          dict.onboarding.weight,
          form.weightKg,
          (v) => set("weightKg", v),
          {
            unit: isImperial ? dict.common.lb : dict.common.kg,
            errorKey: "weightKg",
          }
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {numberField(
          "ob-goalweight",
          dict.onboarding.goalWeight,
          form.goalWeightKg,
          (v) => set("goalWeightKg", v),
          {
            unit: isImperial ? dict.common.lb : dict.common.kg,
            optional: true,
            errorKey: "goalWeightKg",
          }
        )}
        {numberField("ob-bodyfat", dict.onboarding.bodyFat, form.bodyFatPct, (v) => set("bodyFatPct", v), {
          unit: "%",
          optional: true,
          sub: dict.onboarding.bodyFatSub,
          errorKey: "bodyFatPct",
        })}
      </div>
    </div>
  );

  const GOALS: { value: Goal; icon: React.ComponentType<{ className?: string }>; key: keyof typeof dict.onboarding }[] = [
    { value: "lose", icon: TrendingDown, key: "lose" },
    { value: "maintain", icon: Equal, key: "maintain" },
    { value: "gain", icon: TrendingUp, key: "gain" },
    { value: "muscle", icon: Dumbbell, key: "muscle" },
    { value: "performance", icon: Medal, key: "performance" },
  ];

  const goalStep = (
    <div className="space-y-5">
      {stepHeader(dict.onboarding.goal)}
      <div role="radiogroup" aria-label={dict.onboarding.goal} className="grid gap-2">
        {GOALS.map((g) => (
          <ChoiceCard
            key={g.value}
            name={`goal-${g.value}`}
            selected={form.goal === g.value}
            onSelect={() => set("goal", g.value)}
            icon={g.icon}
            label={dict.onboarding[g.key]}
          />
        ))}
      </div>
      {errLine("goal")}
      {showWeeklyRate && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ob-weeklyrate">{dict.onboarding.weeklyRate}</Label>
            <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-semibold text-primary tabular-nums">
              {isImperial
                ? `${(Math.round(kgToLb(form.weeklyRateKg) * 100) / 100).toFixed(2)} ${dict.common.lb}`
                : `${form.weeklyRateKg.toFixed(2)} ${dict.common.kg}`}
            </span>
          </div>
          <Slider
            id="ob-weeklyrate"
            min={0.1}
            max={1.0}
            step={0.05}
            value={[form.weeklyRateKg]}
            onValueChange={(v) => set("weeklyRateKg", v[0] ?? 0.5)}
            aria-label={dict.onboarding.weeklyRate}
            className="py-2"
          />
          <p className="text-xs text-muted-foreground">{dict.onboarding.weeklyRateSub}</p>
        </div>
      )}
    </div>
  );

  const ACTIVITY: { value: ActivityLevel; key: keyof typeof dict.onboarding }[] = [
    { value: "sedentary", key: "sedentary" },
    { value: "light", key: "light" },
    { value: "moderate", key: "moderate" },
    { value: "active", key: "active" },
    { value: "very_active", key: "veryActive" },
  ];

  const activityStep = (
    <div className="space-y-5">
      {stepHeader(dict.onboarding.activity)}
      <div role="radiogroup" aria-label={dict.onboarding.activity} className="grid gap-2">
        {ACTIVITY.map((a) => (
          <ChoiceCard
            key={a.value}
            name={`activity-${a.value}`}
            selected={form.activityLevel === a.value}
            onSelect={() => set("activityLevel", a.value)}
            label={dict.onboarding[a.key]}
          />
        ))}
      </div>
      {errLine("activityLevel")}

      <div className="space-y-2 pt-2">
        <Label>{dict.onboarding.userType}</Label>
        <div role="radiogroup" aria-label={dict.onboarding.userType} className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            name="usertype-general"
            selected={form.userType === "general"}
            onSelect={() => set("userType", "general")}
            icon={Equal}
            label={dict.onboarding.general}
          />
          <ChoiceCard
            name="usertype-athlete"
            selected={form.userType === "athlete"}
            onSelect={() => set("userType", "athlete")}
            icon={Dumbbell}
            label={dict.onboarding.athlete}
          />
        </div>
      </div>

      {form.userType === "athlete" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.25 }}
          className="space-y-3 overflow-hidden rounded-xl border bg-accent/40 p-4"
        >
          <p className="text-sm text-muted-foreground">{dict.onboarding.athleteSub}</p>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="ob-trainday" className="text-sm font-normal leading-snug cursor-pointer">
              {dict.training.trainingDay}
            </Label>
            <Switch
              id="ob-trainday"
              checked={form.trainingDayTarget}
              onCheckedChange={(v) => set("trainingDayTarget", v)}
              className="scale-125"
              aria-label={dict.training.trainingTargets}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="ob-carbcycling" className="text-sm font-normal leading-snug cursor-pointer">
              {dict.training.carbCycling}
            </Label>
            <Switch
              id="ob-carbcycling"
              checked={form.carbCycling}
              onCheckedChange={(v) => set("carbCycling", v)}
              className="scale-125"
              aria-label={dict.training.carbCycling}
            />
          </div>
        </motion.div>
      )}
    </div>
  );

  const DIETS: { value: Diet; key: keyof typeof dict.onboarding }[] = [
    { value: "any", key: "any" },
    { value: "vegetarian", key: "vegetarian" },
    { value: "vegan", key: "vegan" },
    { value: "gluten_free", key: "glutenFree" },
    { value: "halal", key: "halal" },
  ];

  const dietStep = (
    <div className="space-y-5">
      {stepHeader(dict.onboarding.diet)}
      <div role="radiogroup" aria-label={dict.onboarding.diet} className="grid gap-2 sm:grid-cols-2">
        {DIETS.map((d) => (
          <ChoiceCard
            key={d.value}
            name={`diet-${d.value}`}
            selected={form.dietPreference === d.value}
            onSelect={() => set("dietPreference", d.value)}
            label={dict.onboarding[d.key]}
          />
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="ob-allergens">{dict.onboarding.allergens}</Label>
        <Input
          id="ob-allergens"
          type="text"
          value={form.allergens}
          maxLength={200}
          onChange={(e) => set("allergens", e.target.value)}
          placeholder={dict.onboarding.allergensPh}
          aria-invalid={!!errors.allergens}
          aria-describedby={errors.allergens ? "ob-allergens-error" : undefined}
          className="min-h-11"
        />
        {errLine("allergens")}
      </div>
    </div>
  );

  const planStep = (
    <div className="space-y-5">
      {stepHeader(dict.onboarding.yourPlan, dict.onboarding.yourPlanSub)}
      {!plan ? (
        <div className="flex min-h-40 items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <span>{dict.common.loading}</span>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="space-y-5 p-6">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Flame className="h-7 w-7 text-primary" aria-hidden />
                </div>
                <p className="mt-3 text-sm font-medium text-muted-foreground">{dict.onboarding.calorieTarget}</p>
                <p className="text-5xl font-bold tabular-nums tracking-tight text-primary">
                  {plan.targets.calories.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}
                </p>
                <p className="text-sm text-muted-foreground">{dict.common.kcal}</p>
              </div>

              {plan.targets.floored && (
                <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600">
                  <AlertTriangle aria-hidden />
                  <AlertTitle>{dict.onboarding.flooredWarning}</AlertTitle>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">{dict.onboarding.bmr}</p>
                  <p className="text-lg font-semibold tabular-nums">{plan.targets.bmr.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}</p>
                </div>
                <div className="rounded-xl border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">{dict.onboarding.tdee}</p>
                  <p className="text-lg font-semibold tabular-nums">{plan.targets.tdee.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{dict.today.macroPlan}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary/10 px-4 text-sm font-medium" aria-label={`${dict.onboarding.protein}: ${plan.targets.protein} ${dict.common.g}`}>
                    <Dumbbell className="h-4 w-4 text-primary" aria-hidden />
                    {dict.onboarding.protein} <strong className="tabular-nums">{plan.targets.protein}{dict.common.g}</strong>
                  </span>
                  <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium" aria-label={`${dict.onboarding.carbs}: ${plan.targets.carbs} ${dict.common.g}`}>
                    <Sparkles className="h-4 w-4 text-accent-foreground" aria-hidden />
                    {dict.onboarding.carbs} <strong className="tabular-nums">{plan.targets.carbs}{dict.common.g}</strong>
                  </span>
                  <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium" aria-label={`${dict.onboarding.fat}: ${plan.targets.fat} ${dict.common.g}`}>
                    <Droplets className="h-4 w-4 text-secondary-foreground" aria-hidden />
                    {dict.onboarding.fat} <strong className="tabular-nums">{plan.targets.fat}{dict.common.g}</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Droplets className="h-5 w-5 text-primary" aria-hidden />
                  </span>
                  <span className="font-medium">{dict.today.water}</span>
                </div>
                <span className="text-lg font-semibold tabular-nums">
                  {plan.waterTarget.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")} {dict.common.ml}
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );

  const STEPS = [languageStep, aboutStep, goalStep, activityStep, dietStep, planStep];

  return (
    <main className="min-h-screen bg-background py-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl px-4">
        <header className="mb-6 space-y-3">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="KaloriAI" className="h-9 w-9" />
            <p className="font-semibold">{dict.meta.appName}</p>
            <p className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary tabular-nums" aria-live="polite">
              {dict.onboarding.step} {step + 1} {dict.onboarding.of} {TOTAL_STEPS}
            </p>
          </div>
          <Progress value={((step + 1) / TOTAL_STEPS) * 100} aria-label={`${dict.onboarding.step} ${step + 1}`} />
        </header>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.section
                key={step}
                custom={dir}
                initial={{ opacity: 0, x: dir * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -40 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                aria-live="polite"
              >
                {STEPS[step]}
              </motion.section>
            </AnimatePresence>

            {step < TOTAL_STEPS - 1 ? (
              <div className="mt-8 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={step === 0 || submitting}
                  className="min-h-11 flex-1 sm:flex-none sm:px-6"
                  aria-label={dict.common.back}
                >
                  <ArrowLeft aria-hidden />
                  {dict.common.back}
                </Button>
                <Button
                  type="button"
                  onClick={goNext}
                  disabled={submitting}
                  className="min-h-11 flex-1 sm:flex-none sm:px-8"
                  aria-label={dict.common.next}
                >
                  {submitting && step === TOTAL_STEPS - 2 ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : null}
                  {dict.common.next}
                  <ArrowRight aria-hidden />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                onClick={finish}
                disabled={!plan}
                className="mt-8 w-full min-h-12 text-base"
                aria-label={dict.onboarding.finish}
              >
                <Check aria-hidden />
                {dict.onboarding.finish}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
