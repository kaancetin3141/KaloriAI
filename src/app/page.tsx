"use client";

import dynamic from "next/dynamic";
import { useAppStore } from "@/stores/app-store";
import { AuthScreen } from "@/components/kaloriai/auth-screen";
import { OnboardingWizard } from "@/components/kaloriai/onboarding-wizard";
import { MainLayout } from "@/components/kaloriai/main-layout";
import { TodayScreen } from "@/components/kaloriai/today-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaf } from "lucide-react";

/**
 * Sekme ekranları lazy-loaded: varsayılan sekme (Bugün) hariç tüm ağır
 * ekranlar (recharts grafikleri, 2000+ satırlık profil vb.) ilk bundle'da
 * taşınmaz — kullanıcı sekmeye geçtiğinde paralel chunk olarak yüklenir.
 */
function TabSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-36 w-full rounded-2xl" />
    </div>
  );
}

const DiaryScreen = dynamic(
  () => import("@/components/kaloriai/diary-screen").then((m) => ({ default: m.DiaryScreen })),
  { loading: () => <TabSkeleton /> }
);
const ProgressScreen = dynamic(
  () => import("@/components/kaloriai/progress-screen").then((m) => ({ default: m.ProgressScreen })),
  { loading: () => <TabSkeleton /> }
);
const TrainingScreen = dynamic(
  () => import("@/components/kaloriai/training-screen").then((m) => ({ default: m.TrainingScreen })),
  { loading: () => <TabSkeleton /> }
);
const ProfileScreen = dynamic(
  () => import("@/components/kaloriai/profile-screen").then((m) => ({ default: m.ProfileScreen })),
  { loading: () => <TabSkeleton /> }
);
// AI Koç çekmecesi: açılış anında yüklenir (ilk boyamaya girmez)
const CoachDrawer = dynamic(
  () => import("@/components/kaloriai/coach-drawer").then((m) => ({ default: m.CoachDrawer })),
  { ssr: false }
);

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
