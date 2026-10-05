"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useAppStore, getStoredSkin } from "@/stores/app-store";
import { api } from "@/lib/api";
import type { MealNames, SessionUser } from "@/stores/app-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      })
  );
  const setUser = useAppStore((s) => s.setUser);
  const setAuthChecked = useAppStore((s) => s.setAuthChecked);
  const setLocale = useAppStore((s) => s.setLocale);
  const setMealNames = useAppStore((s) => s.setMealNames);
  const setSkin = useAppStore((s) => s.setSkin);

  useEffect(() => {
    const stored = window.localStorage.getItem("kaloriai_locale");
    if (stored === "en" || stored === "tr") setLocale(stored);
    // Sync persisted skin into store (class itself already applied by head script)
    setSkin(getStoredSkin());
    api<{ user: SessionUser | null; mealNames?: MealNames | null }>("/api/auth/me")
      .then((res) => {
        setUser(res.user);
        setMealNames(res.mealNames ?? null);
      })
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, [setUser, setAuthChecked, setLocale, setMealNames, setSkin]);

  // PWA: register service worker in production only (avoids caching dev/HMR assets)
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
