"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ChartLine, Dumbbell, Loader2, RotateCcw, Soup, Sparkles, TrendingDown, Zap } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Dictionary } from "@/lib/i18n";

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

type Mode = "login" | "register";
type DemoId = "athlete" | "weightloss";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function DemoRow({
  icon: Icon,
  avatarClass,
  initial,
  title,
  desc,
  tags,
  busy,
  disabled,
  onLogin,
  onReset,
  loginLabel,
  resetTip,
  busyLabel,
}: {
  icon: typeof Dumbbell;
  avatarClass: string;
  initial: string;
  title: string;
  desc: string;
  tags: string[];
  busy: boolean;
  disabled: boolean;
  onLogin: () => void;
  onReset: () => void;
  loginLabel: string;
  resetTip: string;
  busyLabel: string;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-base font-bold text-white shadow-sm ${avatarClass}`}
        aria-hidden
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{title}</p>
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium leading-none text-primary"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mt-0.5 flex items-start gap-1 text-xs leading-snug text-muted-foreground">
          <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span className="line-clamp-2">{desc}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          aria-label={resetTip}
          title={resetTip}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
        </button>
        <Button type="button" size="sm" className="min-h-9 px-3" onClick={onLogin} disabled={disabled}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span className="hidden sm:inline">{busyLabel}</span>
            </>
          ) : (
            loginLabel
          )}
        </Button>
      </div>
    </div>
  );
}

function DemoSection({ onAfterAuth }: { onAfterAuth: () => Promise<void> }) {
  const { dict } = useAppStore();
  const { toast } = useToast();
  const [busy, setBusy] = useState<DemoId | null>(null);

  async function demoLogin(demoId: DemoId, reset: boolean) {
    setBusy(demoId);
    try {
      await api("/api/auth/demo", { body: { demoId, reset } });
      await onAfterAuth();
      toast({ title: reset ? dict.demo.resetDone : dict.demo.loggedIn });
    } catch (err) {
      const blocked = err instanceof ApiError && err.code === "COOKIE_BLOCKED";
      toast({
        title: dict.common.error,
        description: blocked ? dict.auth.cookieBlocked : dict.demo.failed,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.18 }}
      className="w-full max-w-md"
    >
      <Card className="border-primary/25 bg-gradient-to-br from-primary/[0.06] via-transparent to-amber-500/[0.05] shadow-sm">
        <CardContent className="p-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            </span>
            <h3 className="font-semibold tracking-tight">{dict.demo.title}</h3>
            <span className="ml-auto rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {dict.demo.daysOfData}
            </span>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">{dict.demo.subtitle}</p>

          <div className="space-y-2.5">
            <DemoRow
              icon={Dumbbell}
              avatarClass="from-emerald-500 to-teal-600"
              initial="K"
              title={dict.demo.athleteName}
              desc={dict.demo.athleteDesc}
              tags={[dict.demo.tagPremium, dict.demo.tagAthlete]}
              busy={busy === "athlete"}
              disabled={busy !== null}
              onLogin={() => void demoLogin("athlete", false)}
              onReset={() => void demoLogin("athlete", true)}
              loginLabel={dict.demo.login}
              resetTip={dict.demo.resetTip}
              busyLabel={dict.demo.preparing}
            />
            <DemoRow
              icon={TrendingDown}
              avatarClass="from-amber-500 to-orange-600"
              initial="E"
              title={dict.demo.weightlossName}
              desc={dict.demo.weightlossDesc}
              tags={[dict.demo.tagFree]}
              busy={busy === "weightloss"}
              disabled={busy !== null}
              onLogin={() => void demoLogin("weightloss", false)}
              onReset={() => void demoLogin("weightloss", true)}
              loginLabel={dict.demo.login}
              resetTip={dict.demo.resetTip}
              busyLabel={dict.demo.preparing}
            />
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">{dict.demo.creds}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function BrandPanel({ dict }: { dict: Dictionary }) {
  const features = [
    { icon: Camera, text: dict.today.takePhotoSub },
    { icon: ChartLine, text: dict.progress.adaptiveSub },
    { icon: Soup, text: dict.auth.cuisine },
  ];
  const stats = [
    { icon: Soup, text: dict.auth.statFoods },
    { icon: Sparkles, text: dict.auth.statAi },
    { icon: Zap, text: dict.auth.statFast },
  ];
  return (
    <div className="kai-hero-bg relative hidden flex-col justify-center gap-8 overflow-hidden p-10 lg:flex xl:p-14">
      {/* decorative gradient blobs */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative flex items-center gap-4">
        <div className="kai-pulse-ring relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <img src="/icon.svg" alt="KaloriAI" className="h-11 w-11" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{dict.meta.appName}</h1>
          <p className="kai-gradient-text text-lg font-semibold">{dict.meta.tagline}</p>
        </div>
      </div>
      <ul className="relative space-y-5" aria-label={dict.meta.appName}>
        {features.map((f) => (
          <li key={f.text} className="flex items-start gap-4">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <f.icon className="h-5 w-5 text-primary" aria-hidden />
            </span>
            <span className="pt-2 leading-snug text-foreground/90">{f.text}</span>
          </li>
        ))}
      </ul>
      <div className="relative flex flex-wrap gap-2" aria-label={dict.auth.statFoods}>
        {stats.map((s, i) => (
          <motion.span
            key={s.text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.12, duration: 0.4 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground/90 shadow-sm backdrop-blur-sm"
          >
            <s.icon className="h-3.5 w-3.5 text-primary" aria-hidden />
            {s.text}
          </motion.span>
        ))}
      </div>
      <p className="relative text-sm text-muted-foreground">{dict.auth.disclaimer}</p>
    </div>
  );
}

function EmbeddedHint() {
  const { dict } = useAppStore();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-foreground/90">
      <span className="leading-snug">{dict.auth.embeddedHint}</span>
      <a
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-lg bg-amber-500/20 px-2.5 py-1.5 font-medium text-foreground underline-offset-2 transition-colors hover:bg-amber-500/30 hover:underline"
      >
        {dict.auth.openInNewTab}
      </a>
    </div>
  );
}

export function AuthScreen() {
  const { dict, locale, setLocale } = useAppStore();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    try {
      setInIframe(window.self !== window.top);
    } catch {
      setInIframe(true); // cross-origin erişim hatası = iframe
    }
  }, []);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (mode === "register" && name.trim().length === 0) e.name = dict.auth.nameRequired;
    if (!EMAIL_RE.test(email.trim())) e.email = dict.auth.emailInvalid;
    if (mode === "register" && password.length < 8) e.password = dict.auth.passwordShort;
    if (mode === "login" && password.length === 0) e.password = dict.auth.passwordShort;
    if (mode === "register" && !consent) e.consent = dict.auth.consentRequired;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function afterAuth() {
    const res = await api<MeResponse>("/api/auth/me");
    // Login 200 döndü ama çerez tarayıcı tarafından reddedildiyse (ör. çapraz-site
    // iframe + katı çerez politikası) sessizce kutuda kalma yerine net hata ver.
    if (!res.user) throw new ApiError("COOKIE_BLOCKED", 401);
    useAppStore.getState().setUser(res.user);
  }

  function serverError(code: string): string {
    switch (code) {
      case "EMAIL_TAKEN":
        return dict.auth.emailTaken;
      case "LOGIN_FAILED":
        return dict.auth.loginFailed;
      case "CONSENT_REQUIRED":
        return dict.auth.consentRequired;
      case "PASSWORD_SHORT":
        return dict.auth.passwordShort;
      case "COOKIE_BLOCKED":
        return dict.auth.cookieBlocked;
      default:
        return dict.errors.network;
    }
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === "register") {
        await api("/api/auth/register", {
          body: { email: email.trim(), password, name: name.trim(), consent: true, locale },
        });
      } else {
        await api("/api/auth/login", { body: { email: email.trim(), password } });
      }
      await afterAuth();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "UNKNOWN";
      toast({ title: dict.common.error, description: serverError(code), variant: "destructive" });
      if (code === "EMAIL_TAKEN") setErrors({ email: dict.auth.emailTaken });
      if (code === "LOGIN_FAILED") setErrors({ password: dict.auth.loginFailed });
    } finally {
      setLoading(false);
    }
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`auth-${key}-error`} role="alert" className="text-sm text-destructive mt-1.5">
        {errors[key]}
      </p>
    ) : null;

  return (
    <main className="kai-app-shell min-h-screen bg-background lg:grid lg:grid-cols-2">
      <BrandPanel dict={dict} />

      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 sm:p-6 lg:min-h-0 lg:gap-5 lg:py-8">
        {/* Compact brand header — mobile only */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="kai-hero-bg flex w-full items-center gap-3 rounded-2xl p-4 lg:hidden"
        >
          <img src="/icon.svg" alt="KaloriAI" className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-bold leading-tight">{dict.meta.appName}</h1>
            <p className="text-sm text-muted-foreground">{dict.meta.tagline}</p>
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="w-full max-w-md"
        >
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold tracking-tight">{dict.auth.welcome}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{dict.auth.welcomeSub}</p>

              <Tabs
                value={mode}
                onValueChange={(v) => {
                  setMode(v as Mode);
                  setErrors({});
                }}
                className="mt-6"
              >
                <TabsList className="grid w-full grid-cols-2 h-11">
                  <TabsTrigger value="login" className="min-h-11 rounded-md">
                    {dict.auth.login}
                  </TabsTrigger>
                  <TabsTrigger value="register" className="min-h-11 rounded-md">
                    {dict.auth.register}
                  </TabsTrigger>
                </TabsList>

                {/* ---------- LOGIN ---------- */}
                <TabsContent value="login">
                  <form onSubmit={handleSubmit} noValidate className="mt-2 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">{dict.auth.email}</Label>
                      <Input
                        id="login-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="ornek@mail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? "auth-email-error" : undefined}
                        className="min-h-11"
                      />
                      {fieldError("email")}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">{dict.auth.password}</Label>
                      <Input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={!!errors.password}
                        aria-describedby={errors.password ? "auth-password-error" : undefined}
                        className="min-h-11"
                      />
                      {fieldError("password")}
                    </div>
                    <Button type="submit" disabled={loading} className="w-full min-h-11 text-base" aria-label={dict.auth.login}>
                      {loading && <Loader2 className="animate-spin" aria-hidden />}
                      {dict.auth.login}
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">
                      {dict.auth.noAccount}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setMode("register");
                          setErrors({});
                        }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {dict.auth.register}
                      </button>
                    </p>
                  </form>
                </TabsContent>

                {/* ---------- REGISTER ---------- */}
                <TabsContent value="register">
                  <form onSubmit={handleSubmit} noValidate className="mt-2 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">{dict.auth.name}</Label>
                      <Input
                        id="reg-name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        aria-invalid={!!errors.name}
                        aria-describedby={errors.name ? "auth-name-error" : undefined}
                        className="min-h-11"
                      />
                      {fieldError("name")}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-email">{dict.auth.email}</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="ornek@mail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? "auth-email-error" : undefined}
                        className="min-h-11"
                      />
                      {fieldError("email")}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">{dict.auth.password}</Label>
                      <Input
                        id="reg-password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={!!errors.password}
                        aria-describedby={errors.password ? "auth-password-error" : undefined}
                        className="min-h-11"
                      />
                      {fieldError("password")}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="reg-consent"
                          checked={consent}
                          onCheckedChange={(v) => setConsent(v === true)}
                          aria-invalid={!!errors.consent}
                          aria-describedby={errors.consent ? "auth-consent-error" : undefined}
                          className="mt-1 size-5"
                        />
                        <Label htmlFor="reg-consent" className="text-sm font-normal leading-snug cursor-pointer">
                          {dict.auth.consent}
                        </Label>
                      </div>
                      {fieldError("consent")}
                    </div>
                    <Button type="submit" disabled={loading} className="w-full min-h-11 text-base" aria-label={dict.auth.register}>
                      {loading && <Loader2 className="animate-spin" aria-hidden />}
                      {dict.auth.register}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">{dict.auth.disclaimer}</p>
                    <p className="text-center text-sm text-muted-foreground">
                      {dict.auth.haveAccount}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login");
                          setErrors({});
                        }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {dict.auth.login}
                      </button>
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>

        {inIframe && <EmbeddedHint />}

        <DemoSection onAfterAuth={afterAuth} />
      </div>
    </main>
  );
}
