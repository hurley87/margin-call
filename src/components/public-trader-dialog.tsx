"use client";

import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TraderAvatar } from "@/components/trader-avatar";
import { AgentDeskBadge } from "@/components/agent-desk-badge";
import { PersonaTraits, RarityBadge } from "@/components/persona-traits";
import { formatStatus } from "@/lib/format-status";
import {
  getEscrowTone,
  getPortraitTone,
  getStatusTone,
  tokenLabel,
  type PublicTraderProfile,
} from "@/lib/trader-display";
import {
  cn,
  DIALOG_BACKDROP_CLASS,
  dialogPopupClass,
  formatActivityTime,
  formatUsdc,
} from "@/lib/utils";

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
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={dialogPopupClass("xl")}>
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

  const statusTone = getStatusTone(trader.status);
  const portraitTone = getPortraitTone(trader.portraitStatus);
  const escrowTone = getEscrowTone(trader.escrowBalanceUsdc);

  return (
    <div className="bg-[var(--t-bg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--t-divider)] bg-[var(--t-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--t-surface)]/80">
        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--t-green)]">
              <span className="text-[var(--t-muted)]">[</span>
              Public dossier
              <span className="text-[var(--t-muted)]">]</span>
              <span className="ml-2 text-[var(--t-muted)]">
                {"// floor tape"}
              </span>
            </p>
            <h2 className="mt-1.5 truncate font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-wide text-[var(--t-amber)] sm:text-3xl">
              {trader.name}
              {trader.isAgentDesk ? (
                <AgentDeskBadge className="ml-2 align-middle" />
              ) : null}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
              <span>
                File{" "}
                <span className="text-[var(--t-text)]">
                  {tokenLabel(trader.tokenId)}
                </span>
              </span>
              <span className="text-[var(--t-divider)]">/</span>
              <RarityBadge
                rarity={trader.rarity}
                className="px-1.5 py-0 text-[10px] tracking-[0.16em]"
              />
              <span className="text-[var(--t-divider)]">/</span>
              <span>
                <span className="text-[var(--t-text)]">
                  {trader.riskProfile}
                </span>{" "}
                risk
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 shrink-0 items-center gap-2 border border-[var(--t-divider)] px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--t-muted)] transition-colors hover:border-[var(--t-amber)] hover:text-[var(--t-amber)] focus:border-[var(--t-amber)] focus:text-[var(--t-amber)] focus:outline-none"
          >
            Close
            <span className="text-[var(--t-muted)]/60">[ESC]</span>
          </button>
        </div>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <section className="min-w-0">
          <div className="terminal-panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--t-divider)] bg-[var(--t-surface)]/70 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--t-muted)]">
                Portrait
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--t-green)]">
                {tokenLabel(trader.tokenId)}
              </span>
            </div>
            <div className="relative aspect-square">
              <TraderAvatar
                name={trader.name}
                src={trader.profileImageUrl}
                imageStatus={trader.portraitStatus}
                size="lg"
                className="absolute inset-0"
              />
              <div className="pointer-events-none absolute inset-0 crt-line-grid opacity-20" />
            </div>
            <dl className="grid grid-cols-2 gap-px border-t border-[var(--t-divider)] bg-[var(--t-divider)]/40">
              <StatusFact
                label="Desk"
                value={formatStatus(trader.status)}
                tone={statusTone}
              />
              <StatusFact
                label="Portrait"
                value={formatStatus(trader.portraitStatus)}
                tone={portraitTone}
              />
            </dl>
          </div>

          {trader.traits ? (
            <div className="terminal-panel mt-5 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--t-divider)] bg-[var(--t-surface)]/70 px-3 py-2 sm:px-4">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--t-amber)]">
                  Persona traits
                </h3>
                <RarityBadge
                  rarity={trader.rarity}
                  className="px-1.5 py-0.5 text-[9px] tracking-[0.16em]"
                />
              </div>
              <PersonaTraits
                traits={trader.traits}
                className="sm:grid-cols-1"
              />
            </div>
          ) : null}
        </section>

        <section className="grid min-w-0 content-start gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <HeroStat
              label="Escrow capital"
              value={formatUsdc(trader.escrowBalanceUsdc)}
              valueClassName={cn("text-2xl sm:text-3xl", escrowTone)}
              accent
            />
            <HeroStat label="Risk profile" value={trader.riskProfile} />
          </div>

          <div className="terminal-panel overflow-hidden">
            <SectionHeader
              label="Recent activity"
              hint="Read only"
              hintTone="text-[var(--t-green)]"
            />
            <div className="p-3 sm:p-4">
              {trader.recentActivity.length > 0 ? (
                <ol className="grid gap-2">
                  {trader.recentActivity.map((item) => (
                    <li
                      key={`${item.createdAt}:${item.activityType}:${item.dealId ?? ""}`}
                      className="border-l-2 border-[var(--t-green)]/50 bg-[#070b09]/75 px-3 py-2.5"
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--t-muted)]">
                        <span className="text-[var(--t-green)]">
                          {formatStatus(item.activityType)}
                        </span>
                        <time dateTime={new Date(item.createdAt).toISOString()}>
                          {formatActivityTime(item.createdAt)}
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
          </div>
        </section>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  valueClassName,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 border border-[var(--t-divider)] bg-[#070b09]/75 px-4 py-3",
        accent && "border-[var(--t-amber)]/40 bg-[var(--t-amber)]/[0.04]"
      )}
    >
      {accent ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-0.5 bg-[var(--t-amber)]/70"
        />
      ) : null}
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 break-words font-[family-name:var(--font-plex-sans)] text-lg font-black uppercase leading-tight tracking-wide text-[var(--t-text)]",
          valueClassName
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatusFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone: string;
}) {
  return (
    <div className="bg-[#070b09]/85 px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--t-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-xs font-bold uppercase tracking-[0.16em]",
          tone
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SectionHeader({
  label,
  hint,
  hintTone,
}: {
  label: string;
  hint?: string;
  hintTone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--t-divider)] bg-[var(--t-surface)]/70 px-3 py-2 sm:px-4">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--t-amber)]">
        {label}
      </h3>
      {hint ? (
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-[0.2em]",
            hintTone ?? "text-[var(--t-muted)]"
          )}
        >
          {hint}
        </span>
      ) : null}
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
        className="min-h-10 px-2 text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none"
      >
        [CLOSE]
      </button>
    </div>
  );
}
