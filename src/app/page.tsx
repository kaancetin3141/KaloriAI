"use client";

import { useAppStore } from "@/stores/app-store";
import { AuthScreen } from "@/components/kaloriai/auth-screen";
import { OnboardingWizard } from "@/components/kaloriai/onboarding-wizard";
import { MainLayout } from "@/components/kaloriai/main-layout";
import { TodayScreen } from "@/components/kaloriai/today-screen";
import { DiaryScreen } from "@/components/kaloriai/diary-screen";
import { ProgressScreen } from "@/components/kaloriai/progress-screen";
import { TrainingScreen } from "@/components/kaloriai/training-screen";
import { ProfileScreen } from "@/components/kaloriai/profile-screen";
import { CoachDrawer } from "@/components/kaloriai/coach-drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaf } from "lucide-react";

export default function Home() {
  const { user, authChecked, tab } = useAppStore();

  if (!authChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Leaf className="h-8 w-8 text-primary" aria-hidden />
        </div>
        <div className="w-48 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;
  if (!user.onboarded) return <OnboardingWizard />;

  return (
    <MainLayout>
      {tab === "today" && <TodayScreen />}
      {tab === "diary" && <DiaryScreen />}
      {tab === "progress" && <ProgressScreen />}
      {tab === "training" && <TrainingScreen />}
      {tab === "profile" && <ProfileScreen />}
      <CoachDrawer />
    </MainLayout>
  );
}
