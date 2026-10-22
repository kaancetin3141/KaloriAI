"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  History,
  ImageOff,
  Loader2,
  Quote,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

interface HistoryItemSummary {
  name: string;
  grams: number;
  kcal: number;
}

interface HistoryItem {
  id: string;
  itemType: string;
  textInput: string | null;
  imageUrl: string | null;
  confidence: number;
  corrected: boolean;
  logged: boolean;
  createdAt: string;
  items: HistoryItemSummary[];
}

interface HistoryResponse {
  ok: boolean;
  items: HistoryItem[];
  hasMore: boolean;
}

/** Güven skoru → renk tonu: ≥0.8 emerald, ≥0.5 amber, altı nötr */
function confidenceTone(c: number): string {
  if (c >= 0.8) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-500 border-emerald-500/40";
  if (c >= 0.5) return "bg-amber-500/15 text-amber-600 dark:text-amber-500 border-amber-500/40";
  return "bg-muted text-muted-foreground border-border";
}

/**
 * AI Analiz Geçmişi — kullanıcının son fotoğraf/yazı analizleri (kendi hesabına özel).
 * Sayfalı yükleme (load more), güven rozeti, deftere kayıt işareti ve KVKK notu içerir.
 */
export function AiHistoryCard() {
  const dict = useAppStore((s) => s.dict);
  const locale = useAppStore((s) => s.locale);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const [pendingDelete, setPendingDelete] = useState<HistoryItem | null>(null);

  const q = useQuery<HistoryResponse>({
    queryKey: ["ai-history", page],
    // 0. sayfa listeyi tazeler; sonraki sayfalar önceki sayfanın önbelleğinin ÜZERİNE eklenir
    // (load more birikimi — state/effect yok, veri birebir sorgu önbelleğinden türetilir)
    queryFn: async () => {
      const res = await api<HistoryResponse>(`/api/ai/history?page=${page}&limit=${PAGE_SIZE}`);
      if (page === 0) return res;
      const prev = queryClient.getQueryData<HistoryResponse>(["ai-history", page - 1]);
      if (!prev) return res;
      const seen = new Set(prev.items.map((r) => r.id));
      return {
        ok: true,
        items: [...prev.items, ...res.items.filter((r) => !seen.has(r.id))],
        hasMore: res.hasMore,
      };
    },
    staleTime: 30_000,
  });

  // Silinenler yerel filtreyle gizlenir (optimistik — yeniden getirme yarışı olsa bile geri dönmez)
  const rows = useMemo(
    () => (q.data?.items ?? []).filter((r) => !deletedIds.has(r.id)),
    [q.data, deletedIds]
  );
  const hasMore = q.data?.hasMore ?? false;
  const initialLoading = q.isLoading && rows.length === 0;
  const showEmpty = !initialLoading && !q.isError && rows.length === 0;

  const del = useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean; deleted: number }>(`/api/ai/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: (_d, id) => {
      toast({ description: dict.ai.historyDeleted });
      setDeletedIds((prev) => new Set(prev).add(id));
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ["ai-history"] });
    },
    onError: () => toast({ description: dict.common.error, variant: "destructive" }),
  });

  // Kısa tarih: "22 Eki" / "Oct 22" (weekly-planner-dialog ile aynı Intl deseni)
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short" }),
    [locale]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0" aria-hidden>
            <History className="h-4 w-4 text-accent-foreground" />
          </span>
          {dict.ai.historyTitle}
        </CardTitle>
        <CardDescription>{dict.ai.historySub}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {initialLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : q.isError && rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-destructive/40 px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">{dict.common.error}</p>
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => q.refetch()}>
              {dict.common.retry}
            </Button>
          </div>
        ) : showEmpty ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
            <Sparkles className="h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-xs text-muted-foreground">{dict.ai.historyEmpty}</p>
          </div>
        ) : (
          <div className="kai-scroll -mx-1 max-h-[28rem] overflow-y-auto px-1">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {rows.map((it) => {
                const pct = Math.round(it.confidence * 100);
                const label =
                  it.itemType === "photo"
                    ? it.items.map((i) => i.name).join(", ") || dict.ai.historyTitle
                    : it.textInput || dict.ai.historyTitle;
                const summary = it.items
                  .map((i) => `${i.name} (${i.grams} ${dict.common.g} · ${Math.round(i.kcal)} ${dict.common.kcal})`)
                  .join(", ");
                return (
                  <li key={it.id} className="flex flex-col">
                    {it.itemType === "photo" && it.imageUrl && !imgFailed[it.id] ? (
                      // Fotoğraf döşemesi — tembel yüklenir, hata olursa Sparkles kutusuna düşer
                      <img
                        src={it.imageUrl}
                        alt={label}
                        loading="lazy"
                        onError={() => setImgFailed((m) => ({ ...m, [it.id]: true }))}
                        className="aspect-square w-full rounded-lg border object-cover"
                      />
                    ) : it.itemType === "photo" ? (
                      <div
                        className="flex aspect-square w-full items-center justify-center rounded-lg border bg-accent/60"
                        role="img"
                        aria-label={label}
                      >
                        <Sparkles className="h-6 w-6 text-muted-foreground" aria-hidden />
                      </div>
                    ) : (
                      // Yazılı analiz döşemesi — alıntı stili
                      <blockquote
                        className="flex aspect-square w-full flex-col gap-1.5 rounded-lg border bg-accent/40 p-3"
                        title={summary || undefined}
                      >
                        <Quote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <p className="line-clamp-3 flex-1 text-xs italic leading-snug text-foreground/90">{label}</p>
                      </blockquote>
                    )}

                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                          confidenceTone(it.confidence)
                        )}
                      >
                        {pct}%
                      </span>
                      <time
                        dateTime={it.createdAt}
                        className="truncate text-[10px] text-muted-foreground"
                        title={new Date(it.createdAt).toLocaleString(locale === "en" ? "en-US" : "tr-TR")}
                      >
                        {dateFmt.format(new Date(it.createdAt))}
                      </time>
                      {it.logged && (
                        <CheckCircle2
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-label={dict.ai.saveToDiary}
                        />
                      )}
                      <span className="flex-1" aria-hidden />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="-mr-1.5 -mt-1.5 h-11 w-11 text-muted-foreground/70 hover:text-destructive"
                        aria-label={`${dict.common.delete}: ${label}`}
                        onClick={() => setPendingDelete(it)}
                        disabled={del.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Sayfalı yükleme */}
        {hasMore && !q.isError && (
          <Button
            variant="outline"
            className="min-h-[44px] w-full"
            onClick={() => setPage((p) => p + 1)}
            disabled={q.isFetching}
          >
            {q.isFetching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {dict.ai.historyLoadMore}
          </Button>
        )}

        {/* Liste doluyken getirme hatası — sessiz kalma */}
        {q.isError && rows.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="alert">
            <ImageOff className="h-3.5 w-3.5" aria-hidden />
            {dict.common.error}
          </p>
        )}

        {/* KVKK notu */}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
          {dict.ai.historyPrivacy}
        </p>
      </CardContent>

      {/* Silme onayı — profil ekranındaki AlertDialog deseni */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.common.delete}</AlertDialogTitle>
            <AlertDialogDescription>{dict.ai.historyDeleteConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) del.mutate(pendingDelete.id);
              }}
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : dict.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
