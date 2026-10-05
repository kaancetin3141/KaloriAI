"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useAppStore, type Tab } from "@/stores/app-store";
import { ReminderNotifier } from "@/components/kaloriai/reminder-notifier";
import { cn } from "@/lib/utils";
import {
  Home,
  BookOpen,
  TrendingUp,
  Dumbbell,
  User,
  Sparkles,
  Crown,
} from "lucide-react";

const TABS: { key: Tab; icon: typeof Home }[] = [
  { key: "today", icon: Home },
  { key: "diary", icon: BookOpen },
  { key: "progress", icon: TrendingUp },
  { key: "training", icon: Dumbbell },
  { key: "profile", icon: User },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { tab, setTab, dict, setCoachOpen, user } = useAppStore();

  useEffect(() => {
    document.documentElement.lang = useAppStore.getState().locale;
  }, []);

  return (
    <div className="kai-app-shell min-h-screen flex bg-background">
      <ReminderNotifier />
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 flex-col border-r bg-sidebar/60 backdrop-blur sticky top-0 h-screen p-4">
        <div className="flex items-center gap-2 px-2 py-4">
          <div className="kai-pulse-ring relative h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-sm shadow-primary/30">
            <Sparkles className="h-5 w-5 text-primary-foreground" aria-hidden />
          </div>
          <div>
            <div className="font-bold text-lg leading-none">{dict.meta.appName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{dict.meta.tagline}</div>
          </div>
        </div>

        <nav className="mt-4 space-y-1" aria-label="Main">
          {TABS.map(({ key, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="kai-nav-active"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-primary shadow-sm shadow-primary/25"
                    aria-hidden
                  />
                )}
                <Icon
                  className={cn(
                    "relative h-4.5 w-4.5 transition-transform duration-200",
                    active ? "scale-110" : "group-hover:scale-105"
                  )}
                  aria-hidden
                />
                <span className="relative">{dict.nav[key]}</span>
                {active && (
                  <motion.span
                    layoutId="kai-nav-dot"
                    className="relative ml-auto h-1.5 w-1.5 rounded-full bg-primary-foreground/80"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Premium mini-banner / coach CTA */}
        <button
          onClick={() => setCoachOpen(true)}
          className="mt-auto group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm font-medium transition-all hover:bg-accent hover:shadow-md active:scale-[0.98] text-left"
        >
          <span className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center transition-transform group-hover:scale-110">
            <Sparkles className="h-4 w-4 text-accent-foreground" aria-hidden />
          </span>
          <span>
            {dict.today.aiCoach}
            <span className="block text-xs text-muted-foreground font-normal">{dict.coach.ctaSub}</span>
          </span>
        </button>

        {user && (
          <div className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary" aria-hidden>
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 truncate">{user.name ?? user.email}</span>
            {user.isPremium && (
              <Crown className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-500" aria-label={dict.profile.premium} />
            )}
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 w-full max-w-3xl xl:max-w-4xl mx-auto px-4 pt-4 pb-28 lg:pb-10" role="main">
          {children}
        </main>
        <footer className="hidden lg:block pb-4 text-center text-xs text-muted-foreground">
          {dict.meta.appName} · {dict.auth.disclaimer}
        </footer>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        aria-label="Bottom navigation"
      >
        <div className="grid grid-cols-5 pb-safe">
          {TABS.map(({ key, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={active ? "page" : undefined}
                aria-label={dict.nav[key]}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors min-h-[44px]",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <motion.span
                  animate={active ? { scale: 1.12, y: -1 } : { scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  className={cn(
                    "relative rounded-full px-3 py-0.5",
                    active && "bg-primary/10"
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </motion.span>
                {dict.nav[key]}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
