"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, CartesianGrid } from "recharts";
import {
  Zap,
  Bike,
  Waves,
  Footprints,
  Dumbbell,
  Goal,
  CircleDot,
  Activity,
  Flower2,
  Timer,
  Sparkles,
  Trash2,
  Loader2,
  Plus,
  Info,
  FlameKindling,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Watch } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { metForIntensity, workoutCalories } from "@/lib/calculations";
import type { DiaryResponse, Workout } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";

const fmtDate = (d = new Date()) => d.toLocaleDateString("en-CA");

const WORKOUT_TYPES = [
  "running",
  "cycling",
  "swimming",
  "walking",
  "strength",
  "football",
  "basketball",
  "hiit",
  "yoga",
  "other",
] as const;

type WorkoutType = (typeof WORKOUT_TYPES)[number];

/** Mirrors server BASE_METS (src/app/api/workouts/route.ts) so the live estimate matches what gets saved */
const BASE_METS: Record<WorkoutType, number> = {
  running: 9.8,
  cycling: 7.5,
  swimming: 8.3,
  walking: 3.5,
  strength: 6.0,
  football: 8.5,
  basketball: 8.0,
  hiit: 8.0,
  yoga: 3.0,
  other: 5.0,
};

const TYPE_ICONS: Record<WorkoutType, typeof Zap> = {
  running: Zap,
  cycling: Bike,
  swimming: Waves,
  walking: Footprints,
  strength: Dumbbell,
  football: Goal,
  basketball: CircleDot,
  hiit: Activity,
  yoga: Flower2,
  other: Activity,
};

export function TrainingScreen() {
  const dict = useAppStore((s) => s.dict);
  const setTab = useAppStore((s) => s.setTab);
  const { toast } = useToast();
  const qc = useQueryClient();

  const today = fmtDate();
  const [type, setType] = useState<WorkoutType>("running");
  const [durationMin, setDurationMin] = useState("30");
  const [intensity, setIntensity] = useState<"light" | "moderate" | "vigorous">("moderate");
  const [manual, setManual] = useState("");
  const [addToTarget, setAddToTarget] = useState(false);

  /* ---------- queries ---------- */
  const diaryQ = useQuery<DiaryResponse>({
    queryKey: ["diary", today],
    queryFn: () => api<DiaryResponse>(`/api/diary?date=${today}`),
  });

  const summaryQ = useQuery({
    queryKey: ["summary", 7],
    queryFn: () => api<{ byDate: { date: string; burned: number }[] }>("/api/progress/summary?days=7"),
  });

  const workoutsQ = useQuery<{ workouts: Workout[] }>({
    queryKey: ["workouts", today],
    queryFn: () => api<{ workouts: Workout[] }>(`/api/workouts?date=${today}`),
  });

  const stepsQ = useQuery<{ days: { date: string; count: number; source: string }[] }>({
    queryKey: ["steps", 7],
    queryFn: () => api<{ days: { date: string; count: number; source: string }[] }>("/api/steps?days=7"),
  });

  /* ---------- derived ---------- */
  const profile = diaryQ.data?.profile ?? null;
  const weightKg = profile?.weightKg ?? 70;

  const met = metForIntensity(BASE_METS[type], intensity);
  const estCalories = useMemo(() => {
    const dur = Number(durationMin);
    return workoutCalories(met, weightKg, Number.isFinite(dur) && dur > 0 ? dur : 0);
  }, [met, weightKg, durationMin]);

  const workouts = workoutsQ.data?.workouts ?? [];
  const weekByDate = summaryQ.data?.byDate ?? [];
  const weekBurned = weekByDate.reduce((a, d) => a + (d.burned || 0), 0);

  const targets = diaryQ.data?.targets ?? null;
  const athleteTargets =
    targets?.trainCalories != null && targets.trainCalories > 0
      ? {
          train: { cal: targets.trainCalories, p: targets.trainProtein, c: targets.trainCarbs, f: targets.trainFat },
          rest: { cal: targets.calories, p: targets.protein, c: targets.carbs, f: targets.fat },
        }
      : null;

  const perMealProtein = Math.round(0.4 * weightKg);

  /* ---------- steps ---------- */
  const [stepInput, setStepInput] = useState("");
  const STEP_GOAL = 8000;
  const stepDays = stepsQ.data?.days ?? [];
  const todaySteps = stepDays.find((d) => d.date === today)?.count ?? 0;
  const stepPct = Math.min(Math.round((todaySteps / STEP_GOAL) * 100), 100);
  const stepsFromWatch = stepDays.some((d) => d.source === "apple_health");
  const stepChartData = stepDays.map((d) => ({
    date: d.date.slice(5).replace("-", "/"),
    steps: d.count,
  }));

  const addSteps = useMutation({
    mutationFn: (count: number) => api("/api/steps", { body: { date: today, count } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["steps"] });
      setStepInput("");
      toast({ title: dict.steps.added });
    },
    onError: () => toast({ title: dict.errors.validation, variant: "destructive" }),
  });

  /* ---------- mutations ---------- */
  const logWorkout = useMutation({
    mutationFn: () =>
      api("/api/workouts", {
        body: {
          type,
          durationMin: Math.max(1, Math.round(Number(durationMin) || 0)),
          intensity,
          calories: manual.trim() !== "" ? Number(manual) : undefined,
          addToTarget,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diary"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      setManual("");
      toast({
        title: dict.training.logWorkout,
        description: addToTarget
          ? dict.today.burnedAdded
          : `${manual.trim() !== "" ? Number(manual) : estCalories} ${dict.common.kcal}`,
      });
    },
    onError: (e) => {
      toast({
        title: e instanceof ApiError && e.status === 401 ? dict.errors.unauthorized : dict.errors.validation,
        variant: "destructive",
      });
    },
  });

  const deleteWorkout = useMutation({
    mutationFn: (id: string) => api(`/api/workouts?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diary"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: () => toast({ title: dict.common.error, variant: "destructive" }),
  });

  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--card-foreground)",
    fontSize: 12,
  };

  return (
    <div className="space-y-5 pb-4">
      {/* Header + weekly volume */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{dict.training.title}</h1>
        <div className="flex items-center gap-2 text-sm">
          <FlameKindling className="h-4 w-4 text-amber-500" aria-hidden />
          <span className="text-muted-foreground">{dict.training.weeklyVolume}:</span>
          <span className="font-semibold">{Math.round(weekBurned)} {dict.common.kcal}</span>
        </div>
      </div>

      {/* Weekly volume mini bar */}
      <Card>
        <CardContent className="p-4">
          {weekByDate.length > 0 ? (
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={weekByDate} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => (typeof d === "string" ? d.slice(5).replace("-", "/") : d)}
                  fontSize={10}
                  minTickGap={20}
                  stroke="var(--muted-foreground)"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
                <Bar dataKey="burned" name={dict.training.caloriesBurned} fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[90px] flex items-center justify-center gap-2 text-muted-foreground">
              <Skeleton className="h-8 w-full max-w-sm rounded-lg" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* General user banner */}
      {profile && profile.userType !== "athlete" && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3" role="note">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-semibold">{dict.onboarding.athlete}</p>
            <p className="text-muted-foreground mt-0.5">{dict.onboarding.athleteSub}</p>
          </div>
          <Button variant="outline" size="sm" className="min-h-[36px] shrink-0" onClick={() => setTab("profile")}>
            {dict.nav.profile}
          </Button>
        </div>
      )}

      {/* Log workout */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" aria-hidden />
            {dict.training.logWorkout}
          </CardTitle>
          <CardDescription>{dict.training.metNote}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              logWorkout.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="wo-type">{dict.training.type}</Label>
              <Select value={type} onValueChange={(v) => setType(v as WorkoutType)}>
                <SelectTrigger id="wo-type" className="min-h-[44px] w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKOUT_TYPES.map((t) => {
                    const Icon = TYPE_ICONS[t];
                    return (
                      <SelectItem key={t} value={t}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" aria-hidden />
                          {dict.training.types[t]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wo-duration">{dict.training.duration} ({dict.common.min})</Label>
              <Input
                id="wo-duration"
                type="number"
                min="1"
                max="600"
                inputMode="numeric"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                required
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wo-intensity">{dict.training.intensity}</Label>
              <Select value={intensity} onValueChange={(v) => setIntensity(v as typeof intensity)}>
                <SelectTrigger id="wo-intensity" className="min-h-[44px] w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{dict.training.light}</SelectItem>
                  <SelectItem value="moderate">{dict.training.moderate}</SelectItem>
                  <SelectItem value="vigorous">{dict.training.vigorous}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wo-manual">{dict.training.addManual} ({dict.common.optional})</Label>
              <Input
                id="wo-manual"
                type="number"
                min="0"
                max="5000"
                inputMode="numeric"
                placeholder={`${estCalories}`}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                className="min-h-[44px]"
              />
            </div>

            {/* Live estimate */}
            <div className="sm:col-span-2 rounded-xl border bg-accent/40 p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">{dict.training.caloriesBurned}</div>
                <div className="text-xl font-bold">
                  {manual.trim() !== "" ? Number(manual) : estCalories}{" "}
                  <span className="text-xs font-medium text-muted-foreground">{dict.common.kcal}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  MET {met} × {weightKg} {dict.common.kg}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="wo-addtarget"
                  checked={addToTarget}
                  onCheckedChange={setAddToTarget}
                  aria-label={dict.training.addToTarget}
                />
                <Label htmlFor="wo-addtarget" className="text-sm cursor-pointer">
                  {dict.training.addToTarget}
                </Label>
              </div>
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" className="w-full min-h-[44px]" disabled={logWorkout.isPending}>
                {logWorkout.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                {dict.training.logWorkout}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Today's workouts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{dict.training.todayWorkouts}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {workoutsQ.isLoading ? (
            <div className="space-y-2" aria-busy>
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : workoutsQ.isError ? (
            <p className="text-sm text-muted-foreground">{dict.common.error}</p>
          ) : workouts.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-2 text-muted-foreground text-center">
              <Dumbbell className="h-8 w-8 opacity-40" aria-hidden />
              <p className="text-sm">{dict.training.restDay}</p>
            </div>
          ) : (
            workouts.map((w) => {
              const wt = (WORKOUT_TYPES as readonly string[]).includes(w.type) ? (w.type as WorkoutType) : "other";
              const Icon = TYPE_ICONS[wt];
              return (
                <div
                  key={w.id}
                  className="flex items-center gap-3 rounded-xl border p-3 hover:bg-accent/40 transition-colors"
                >
                  <span className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0" aria-hidden>
                    <Icon className="h-5 w-5 text-primary" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {dict.training.types[wt]}
                      {w.addedToTarget && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {dict.training.addToTarget}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {w.durationMin} {dict.common.min} · {w.intensity === "light" ? dict.training.light : w.intensity === "vigorous" ? dict.training.vigorous : dict.training.moderate}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-amber-600 dark:text-amber-500 shrink-0">
                    {w.calories} {dict.common.kcal}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteWorkout.mutate(w.id)}
                    disabled={deleteWorkout.isPending}
                    aria-label={`${dict.common.delete} ${dict.training.types[wt]}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Steps — Apple Watch / Health sync + manual entry */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Footprints className="h-4 w-4 text-primary" aria-hidden />
            {dict.steps.title}
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <Watch className="h-3.5 w-3.5" aria-hidden />
            {stepsFromWatch ? dict.steps.fromWatch : dict.integrations.appleHealthSub}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stepsQ.isLoading ? (
            <div className="space-y-2" aria-busy>
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {dict.steps.today}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold tabular-nums kai-gradient-text">
                      {todaySteps.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">/ 8.000</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={200000}
                    placeholder={dict.steps.countPh}
                    value={stepInput}
                    onChange={(e) => setStepInput(e.target.value)}
                    className="w-32 min-h-[44px] tabular-nums"
                    aria-label={dict.steps.addManual}
                  />
                  <Button
                    size="sm"
                    className="min-h-[44px]"
                    disabled={
                      addSteps.isPending ||
                      stepInput.trim() === "" ||
                      !Number.isFinite(Number(stepInput)) ||
                      Number(stepInput) < 0 ||
                      Number(stepInput) > 200000
                    }
                    onClick={() => addSteps.mutate(Math.round(Number(stepInput)))}
                  >
                    {addSteps.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden />
                    )}
                    {dict.steps.addManual}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Progress value={stepPct} aria-label={dict.steps.goal} />
                <p className="text-[11px] text-muted-foreground">
                  {todaySteps >= STEP_GOAL
                    ? dict.steps.reached
                    : `${(STEP_GOAL - todaySteps).toLocaleString()} ${dict.steps.remaining} · ${dict.steps.goal}`}
                </p>
              </div>
              <div className="h-28 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stepChartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number | string) => [Number(value).toLocaleString(), dict.steps.title]}
                    />
                    <Bar dataKey="steps" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {dict.steps.week} · {dict.steps.goal}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Athlete targets */}
      {athleteTargets && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{dict.training.trainingTargets}</CardTitle>
            {profile?.carbCycling && <CardDescription>{dict.training.carbCycling}</CardDescription>}
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
              <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Dumbbell className="h-3.5 w-3.5" aria-hidden />
                {dict.training.trainingDay}
              </div>
              <div className="text-2xl font-bold mt-1">
                {athleteTargets.train.cal} <span className="text-xs text-muted-foreground">{dict.common.kcal}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                P {athleteTargets.train.p ?? "–"} · C {athleteTargets.train.c ?? "–"} · F {athleteTargets.train.f ?? "–"} {dict.common.g}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs font-semibold text-muted-foreground">
                {dict.training.restDay}
              </div>
              <div className="text-2xl font-bold mt-1">
                {athleteTargets.rest.cal} <span className="text-xs text-muted-foreground">{dict.common.kcal}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                P {athleteTargets.rest.p} · C {athleteTargets.rest.c} · F {athleteTargets.rest.f} {dict.common.g}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Protein distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{dict.training.proteinDist}</CardTitle>
          <CardDescription>{dict.training.proteinDistSub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {([dict.today.breakfast, dict.today.lunch, dict.today.dinner, dict.today.snacks] as const).map((meal) => (
              <div key={meal} className="rounded-xl border bg-accent/30 p-2.5 text-center">
                <div className="text-sm font-bold">{perMealProtein}{dict.common.g}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{meal}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="rounded-xl border p-3 flex items-start gap-2.5">
              <span className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0" aria-hidden>
                <Timer className="h-4 w-4 text-amber-600" />
              </span>
              <div>
                <div className="text-sm font-semibold">{dict.training.preWorkout}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{dict.training.preWorkoutSub}</div>
              </div>
            </div>
            <div className="rounded-xl border p-3 flex items-start gap-2.5">
              <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0" aria-hidden>
                <Sparkles className="h-4 w-4 text-primary" />
              </span>
              <div>
                <div className="text-sm font-semibold">{dict.training.postWorkout}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{dict.training.postWorkoutSub}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diary loading safety banner (targets not ready yet) */}
      {diaryQ.isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3 text-sm" role="alert">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" aria-hidden />
          <span className="flex-1">{dict.common.error}</span>
          <Button variant="outline" size="sm" className="min-h-[36px]" onClick={() => diaryQ.refetch()}>
            {dict.common.retry}
          </Button>
        </div>
      )}
    </div>
  );
}
