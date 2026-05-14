"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TraderAvatar } from "@/components/trader-avatar";
import { DatumCell } from "@/components/datum-cell";
import { formatStatus } from "@/lib/format-status";

type PublicTraderProfile = {
  traderId: string;
  name: string;
  status: "active" | "paused" | "wiped_out";
  tokenId: number | null;
  portraitStatus: "pending" | "generating" | "ready" | "error";
  archetype: string;
  riskProfile: string;
  escrowBalanceUsdc: number;
  profileImageUrl: string | null;
  recentActivity: Array<{
    activityType: string;
    message: string;
    dealId: string | null;
    createdAt: number;
  }>;
};

export function PublicTraderDialog({
  traderId,
  open,
  onOpenChange,
}: {
  traderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trader = useQuery(
    api.traders.getPublicProfile,
    traderId ? { traderId: traderId as Id<"traders"> } : "skip"
  ) as PublicTraderProfile | null | undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[94vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60">
          <Dialog.Title className="sr-only">Public trader dossier</Dialog.Title>
          <div className="max-h-[88vh] overflow-y-auto">
            {traderId ? (
              <PublicTraderContent
                trader={trader}
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <PublicTraderError onClose={() => onOpenChange(false)} />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PublicTraderContent({
  trader,
  onClose,
}: {
  trader: PublicTraderProfile | null | undefined;
  onClose: () => void;
}) {
  if (trader === undefined) {
    return (
      <div className="flex min-h-72 items-center justify-center bg-[var(--t-bg)]">
        <p className="text-sm uppercase tracking-wider text-[var(--t-muted)]">
          Loading trader dossier...<span className="cursor-blink">█</span>
        </p>
      </div>
    );
  }

  if (trader === null) {
    return <PublicTraderError onClose={onClose} />;
  }

  return (
    <div className="crt-scanlines bg-[var(--t-bg)]">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
            Public trader dossier
          </p>
          <h2 className="truncate font-[family-name:var(--font-plex-sans)] text-xl font-black uppercase tracking-wide text-[var(--t-amber)]">
            {trader.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
        >
          Close
        </button>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <section className="min-w-0">
          <div className="overflow-hidden border border-[var(--t-divider)] bg-[#070b09]">
            <div className="relative aspect-square">
              <TraderAvatar
                name={trader.name}
                src={trader.profileImageUrl}
                imageStatus={trader.portraitStatus}
                size="lg"
                className="absolute inset-0"
              />
            </div>
            <div className="grid grid-cols-2 border-t border-[var(--t-divider)] text-xs uppercase tracking-[0.16em]">
              <DatumCell label="Status" value={formatStatus(trader.status)} />
              <DatumCell
                label="Portrait"
                value={formatStatus(trader.portraitStatus)}
              />
            </div>
          </div>
        </section>

        <section className="grid min-w-0 content-start gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <DatumCell label="Token" value={tokenLabel(trader.tokenId)} />
            <DatumCell label="Archetype" value={trader.archetype} />
            <DatumCell label="Risk" value={trader.riskProfile} />
            <DatumCell
              label="Escrow"
              value={formatUsdc(trader.escrowBalanceUsdc)}
            />
          </div>

          <div className="border border-[var(--t-divider)] bg-[#070b09] p-4">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--t-divider)] pb-3">
              <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
                Recent Activity
              </h3>
              <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--t-green)]">
                Read only
              </span>
            </div>
            {trader.recentActivity.length > 0 ? (
              <ol className="grid gap-2">
                {trader.recentActivity.map((item) => (
                  <li
                    key={`${item.createdAt}:${item.activityType}:${item.dealId ?? ""}`}
                    className="border border-[var(--t-divider)] bg-[var(--t-bg)] p-3"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                      <span className="text-[var(--t-green)]">
                        {formatStatus(item.activityType)}
                      </span>
                      <time dateTime={new Date(item.createdAt).toISOString()}>
                        {formatTime(item.createdAt)}
                      </time>
                    </div>
                    <p className="text-sm leading-6 text-[var(--t-text)]">
                      {item.message}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm uppercase tracking-[0.14em] text-[var(--t-muted)]">
                No public activity on the tape yet
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PublicTraderError({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4 bg-[var(--t-bg)]">
      <p className="text-sm uppercase tracking-wider text-[var(--t-red)]">
        Trader not found
      </p>
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
      >
        [CLOSE]
      </button>
    </div>
  );
}

function tokenLabel(tokenId: number | null) {
  return tokenId === null ? "Pending" : `#${tokenId}`;
}

function formatUsdc(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}
