"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { X } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { useGlobalActivity } from "@/hooks/use-global-activity";
import {
  seedLiveToastSeenIds,
  selectNewLiveGameToasts,
  type LiveActivityToastSource,
  type LiveDealToastSource,
  type LiveGameToast,
} from "@/lib/live-game-toasts";
import { cn } from "@/lib/utils";
import { TraderAvatar } from "@/components/trader-avatar";

const TOAST_LIMIT = 3;
const DISMISS_MS = 6000;

export function LiveGameToasts({
  onDealSound,
  onWipeoutSound,
}: {
  onDealSound: () => void;
  onWipeoutSound: () => void;
}) {
  const router = useRouter();
  const recentDeals = useQuery(api.deals.listRecentCreatedForToasts, {
    limit: 8,
  });
  const { data: globalActivity } = useGlobalActivity();

  const [toasts, setToasts] = useState<LiveGameToast[]>([]);
  const seenDealIdsRef = useRef<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const initializedDealsRef = useRef(false);
  const initializedActivityRef = useRef(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const dealSources = useMemo<LiveDealToastSource[]>(() => {
    return (recentDeals ?? []).map((deal) => ({
      id: deal._id,
      prompt: deal.prompt,
      sourceHeadline: deal.sourceHeadline ?? null,
      potUsdc: deal.potUsdc,
      entryCostUsdc: deal.entryCostUsdc,
      creatorAddress: deal.creatorAddress ?? null,
      createdAt: deal.createdAt,
    }));
  }, [recentDeals]);

  const activitySources = useMemo<LiveActivityToastSource[]>(() => {
    return (globalActivity?.activity ?? []).map((entry) => ({
      id: entry.id,
      traderId: entry.trader_id,
      activityType: entry.activity_type,
      message: entry.message,
      metadata: entry.metadata,
      createdAt: Date.parse(entry.created_at),
    }));
  }, [globalActivity]);

  useEffect(() => {
    if (recentDeals !== undefined && !initializedDealsRef.current) {
      const seeded = seedLiveToastSeenIds({
        deals: dealSources,
        activity: [],
      });
      seenDealIdsRef.current = seeded.dealIds;
      initializedDealsRef.current = true;
    }

    if (globalActivity !== undefined && !initializedActivityRef.current) {
      const seeded = seedLiveToastSeenIds({
        deals: [],
        activity: activitySources,
      });
      seenActivityIdsRef.current = seeded.activityIds;
      initializedActivityRef.current = true;
    }

    if (
      recentDeals === undefined ||
      globalActivity === undefined ||
      !initializedDealsRef.current ||
      !initializedActivityRef.current
    ) {
      return;
    }

    const nextToasts = selectNewLiveGameToasts({
      deals: dealSources,
      activity: activitySources,
      seenDealIds: seenDealIdsRef.current,
      seenActivityIds: seenActivityIdsRef.current,
      traderNames: globalActivity.traderNames,
      traderProfiles: globalActivity.traderProfiles,
    });

    if (nextToasts.length === 0) return;

    for (const deal of dealSources) {
      seenDealIdsRef.current.add(deal.id);
    }
    for (const entry of activitySources) {
      seenActivityIdsRef.current.add(entry.id);
    }

    const displayToasts = nextToasts.slice(-TOAST_LIMIT);
    for (const toast of displayToasts) {
      if (toast.kind === "deal") onDealSound();
      else onWipeoutSound();
    }

    setToasts((current) => {
      const currentIds = new Set(current.map((toast) => toast.id));
      const additions = displayToasts.filter(
        (toast) => !currentIds.has(toast.id)
      );
      return [...additions.reverse(), ...current].slice(0, TOAST_LIMIT);
    });

    for (const toast of displayToasts) {
      if (timersRef.current.has(toast.id)) continue;
      const timer = setTimeout(() => {
        setToasts((current) =>
          current.filter((candidate) => candidate.id !== toast.id)
        );
        timersRef.current.delete(toast.id);
      }, DISMISS_MS);
      timersRef.current.set(toast.id, timer);
    }
  }, [
    activitySources,
    dealSources,
    globalActivity,
    onDealSound,
    onWipeoutSound,
    recentDeals,
  ]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const dismiss = (toastId: string) => {
    const timer = timersRef.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(toastId);
    }
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-14 z-[70] flex flex-col-reverse gap-2 sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-[24rem] sm:flex-col">
      {toasts.map((toast) => (
        <LiveGameToastCard
          key={toast.id}
          toast={toast}
          onOpen={() => router.push(toast.href)}
          onDismiss={() => dismiss(toast.id)}
        />
      ))}
    </div>
  );
}

function LiveGameToastCard({
  toast,
  onOpen,
  onDismiss,
}: {
  toast: LiveGameToast;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const isWipeout = toast.kind === "wipeout";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      className={cn(
        "live-toast-enter pointer-events-auto group relative w-full cursor-pointer overflow-hidden border p-3 text-left font-mono shadow-2xl shadow-black/50 backdrop-blur-md focus:outline-none",
        isWipeout
          ? "live-toast-wipeout border-[var(--t-red)]/70 bg-[#1d0808]/95"
          : "border-[var(--t-accent)]/70 bg-[#07100b]/95"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-px",
          isWipeout ? "bg-[var(--t-red)]" : "bg-[var(--t-green)]"
        )}
      />
      <span
        aria-hidden
        className="live-toast-scan absolute inset-0 opacity-45"
      />
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 h-full w-1",
          isWipeout ? "bg-[var(--t-red)]" : "bg-[var(--t-accent)]"
        )}
      />

      <span className="relative z-10 flex items-start gap-3">
        {isWipeout && (
          <TraderAvatar
            name={toast.traderName}
            src={toast.traderProfile?.profileImageUrl}
            imageStatus={toast.traderProfile?.imageStatus}
            size="md"
            className="mt-0.5 border border-[var(--t-red)]/50"
          />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[10px] font-black uppercase tracking-[0.2em]",
              isWipeout ? "text-[var(--t-red)]" : "text-[var(--t-accent)]"
            )}
          >
            {toast.title}
          </span>
          <span className="mt-1 block text-sm font-bold leading-snug text-[var(--t-text)]">
            {toast.body}
          </span>
          <span
            className={cn(
              "mt-2 block text-[10px] uppercase tracking-[0.16em]",
              isWipeout ? "text-[var(--t-red)]/85" : "text-[var(--t-green)]"
            )}
          >
            {toast.meta}
          </span>
        </span>
        <button
          type="button"
          aria-label="Dismiss alert"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
          className="grid h-7 w-7 shrink-0 place-items-center border border-white/10 text-[var(--t-muted)] transition-colors hover:border-white/30 hover:text-[var(--t-text)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </article>
  );
}
