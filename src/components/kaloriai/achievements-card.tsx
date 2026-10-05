"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Award,
  Footprints,
  Droplets,
  Dumbbell,
  Beef,
  Flame,
  CalendarCheck,
  Lock,
  Trophy,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ProgressSummary } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

interface Achievement {
  key: string;
  icon: typeof Award;
  title: string;
  desc: string;
  unlocked: boolean;
  color: string; // tailwind classes for unlocked badge
}

export function AchievementsCard() {
  const dict = useAppStore((s) => s.dict);
  const a = dict.achievements;

  const { data, isLoading } = useQuery({
    queryKey: ["summary", 30],
    queryFn: () => api<ProgressSummary>("/api/progress/summary?days=30"),
  });

  const list: Achievement[] = useMemo(() => {
    const s = data?.summary;
    const targets = data?.targets;
    const waterGoalHit = (data?.byDate ?? []).some((d) => {
      const t = targets ? Math.round(((data?.targets?.calories ?? 0) / 2000) * 2500) : 2500;
      return d.waterMl >= t * 0.95 && d.waterMl > 0;
    });
    const proteinHit = targets ? (s?.avgProtein ?? 0) >= targets.protein * 0.9 : false;
    return [
      { key: "firstLog", icon: Footprints, title: a.firstLog, desc: a.firstLogDesc, unlocked: (s?.loggedDays ?? 0) >= 1, color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
      { key: "log3", icon: CalendarCheck, title: a.log3, desc: a.log3Desc, unlocked: (s?.loggedDays ?? 0) >= 3, color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
      { key: "log7", icon: CalendarCheck, title: a.log7, desc: a.log7Desc, unlocked: (s?.loggedDays ?? 0) >= 7, color: "bg-lime-500/15 text-lime-600 dark:text-lime-400" },
      { key: "streak3", icon: Flame, title: a.streak3, desc: a.streak3Desc, unlocked: (s?.streak ?? 0) >= 3, color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
      { key: "streak7", icon: Flame, title: a.streak7, desc: a.streak7Desc, unlocked: (s?.streak ?? 0) >= 7, color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
      { key: "hydrator", icon: Droplets, title: a.hydrator, desc: a.hydratorDesc, unlocked: waterGoalHit, color: "bg-sky-400/15 text-sky-600 dark:text-sky-400" },
      { key: "workout1", icon: Dumbbell, title: a.workout1, desc: a.workout1Desc, unlocked: (s?.workoutCount ?? 0) >= 1, color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
      { key: "workout5", icon: Dumbbell, title: a.workout5, desc: a.workout5Desc, unlocked: (s?.workoutCount ?? 0) >= 5, color: "bg-red-500/15 text-red-600 dark:text-red-400" },
      { key: "protein", icon: Beef, title: a.protein, desc: a.proteinDesc, unlocked: proteinHit, color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
    ];
  }, [data, a]);

  const unlockedCount = list.filter((x) => x.unlocked).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4.5 w-4.5 text-amber-500" aria-hidden />
          {a.title}
          <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
            {unlockedCount}/{list.length}
          </span>
        </CardTitle>
        <CardDescription>{a.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="list" aria-label={a.title}>
            {list.map((item, idx) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.key}
                  role="listitem"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.22, delay: idx * 0.03 }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all",
                    item.unlocked ? "border-border bg-card hover:shadow-sm" : "border-dashed bg-muted/40 opacity-60"
                  )}
                  title={item.unlocked ? `${item.title} — ${item.desc}` : `${a.locked}: ${item.desc}`}
                >
                  <span
                    className={cn(
                      "relative flex h-10 w-10 items-center justify-center rounded-full",
                      item.unlocked ? item.color : "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.unlocked ? <Icon className="h-5 w-5" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
                    {item.unlocked && idx === 0 && (
                      <Award className="absolute -right-1 -top-1 h-3.5 w-3.5 text-amber-500" aria-hidden />
                    )}
                  </span>
                  <span className={cn("text-[11px] font-semibold leading-tight", !item.unlocked && "text-muted-foreground")}>
                    {item.title}
                  </span>
                  <span className="hidden text-[9px] leading-tight text-muted-foreground sm:block">{item.desc}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
