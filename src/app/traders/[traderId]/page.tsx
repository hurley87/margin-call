import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { TRADER_PLACEHOLDER_IMAGE_PATH } from "@/lib/trader-metadata";
import { PersonaTraits, RarityBadge } from "@/components/persona-traits";
import { DatumCell } from "@/components/datum-cell";
import { EmptyState } from "@/components/empty-state";
import { AgentDeskBadge } from "@/components/agent-desk-badge";
import { FloorCredential } from "@/components/seat-tier-badge";
import { formatStatus } from "@/lib/format-status";
import {
  formatPortraitStatus,
  getEscrowTone,
  getPortraitTone,
  getStatusTone,
  tokenLabel,
  type PublicTraderProfile,
} from "@/lib/trader-display";
import { formatActivityTime, formatUsdc } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createPublicConvexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Add it to your environment."
    );
  }
  return new ConvexHttpClient(url);
}

async function loadTraderProfile(traderId: string) {
  try {
    const convex = createPublicConvexClient();
    return (await convex.query(api.traders.getPublicProfile, {
      traderId: traderId as Id<"traders">,
    })) as PublicTraderProfile | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Invalid ID")) {
      notFound();
    }
    throw error;
  }
}

export default async function PublicTraderPage({
  params,
}: {
  params: Promise<{ traderId: string }>;
}) {
  const { traderId } = await params;
  const trader = await loadTraderProfile(traderId);

  if (!trader) {
    notFound();
  }

  return <PublicTraderDossier trader={trader} />;
}

export function PublicTraderDossier({
  trader,
}: {
  trader: PublicTraderProfile;
}) {
  let portraitUrl: string = TRADER_PLACEHOLDER_IMAGE_PATH;
  if (trader.portraitStatus === "ready" && trader.profileImageUrl) {
    portraitUrl = trader.profileImageUrl;
  }
  const showFallbackInitials = trader.portraitStatus !== "ready";
  const statusTone = getStatusTone(trader.status);
  const portraitTone = getPortraitTone(trader.portraitStatus);
  const tier = trader.effectiveTier ?? "Gallery";
  const syncStatus = trader.seatSyncStatus;

  return (
    <main className="min-h-screen bg-[var(--t-bg)] font-mono text-[var(--t-text)]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--t-divider)] pb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--t-green)]">
              Public trader dossier // floor tape
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-plex-sans)] text-3xl font-black uppercase tracking-wide text-[var(--t-amber)] sm:text-5xl">
              {trader.name}
              {trader.isAgentDesk ? (
                <AgentDeskBadge className="ml-2 scale-125 align-baseline" />
              ) : null}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--t-muted)]">
              <FloorCredential tier={tier} syncStatus={syncStatus} />
              <span>
                Read-only reputation, escrow posture, and last public calls from
                the exchange floor.
              </span>
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center border border-[var(--t-divider)] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] focus:border-[var(--t-accent)] focus:text-[var(--t-accent)] focus:outline-none"
          >
            Back to desk
          </Link>
        </header>

        <section className="mb-5 grid gap-2 sm:grid-cols-3">
          <DatumCell
            label="Desk status"
            value={formatStatus(trader.status)}
            valueClassName={statusTone}
          />
          <DatumCell
            label="Escrow capital"
            value={formatUsdc(trader.escrowBalanceUsdc)}
            valueClassName={getEscrowTone(trader.escrowBalanceUsdc)}
          />
          <DatumCell
            label="Portrait"
            value={formatPortraitStatus(trader.portraitStatus)}
            valueClassName={portraitTone}
          />
        </section>

        <section className="grid flex-1 gap-5 lg:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="terminal-panel overflow-hidden">
              <div className="relative aspect-square bg-[linear-gradient(135deg,rgba(104,166,82,0.18),rgba(218,173,94,0.08)_45%,rgba(0,0,0,0.52))]">
                <Image
                  src={portraitUrl}
                  alt={`${trader.name} portrait`}
                  fill
                  unoptimized
                  sizes="(min-width: 1024px) 24rem, 100vw"
                  className="object-cover opacity-95"
                />
                <div className="absolute inset-0 crt-line-grid opacity-35" />
                {showFallbackInitials ? (
                  <div className="absolute inset-x-0 bottom-8 text-center font-[family-name:var(--font-plex-sans)] text-7xl font-black uppercase text-[var(--t-accent)]/80">
                    {initials(trader.name)}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--t-divider)] bg-[#070b09]/85 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
                  Token-bound operator
                </p>
                <RarityBadge rarity={trader.rarity} />
              </div>
            </div>

            {trader.traits ? (
              <div className="terminal-panel mt-5 overflow-hidden">
                <div className="border-b border-[var(--t-divider)] bg-[var(--t-surface)]/70 px-4 py-2.5">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--t-amber)]">
                    Persona traits
                  </h2>
                </div>
                <PersonaTraits
                  traits={trader.traits}
                  className="sm:grid-cols-1"
                />
              </div>
            ) : null}
          </div>

          <div className="grid min-w-0 content-start gap-5">
            <section className="terminal-panel p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--t-divider)] pb-3">
                <h2 className="font-[family-name:var(--font-plex-sans)] text-xl font-black uppercase tracking-wide text-[var(--t-amber)]">
                  Public tape
                </h2>
                <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--t-green)]">
                  Read only
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DatumCell
                  label="Token ID"
                  value={tokenLabel(trader.tokenId)}
                />
                <DatumCell
                  label="Rarity"
                  value={<RarityBadge rarity={trader.rarity} />}
                />
                <DatumCell label="Risk" value={trader.riskProfile} />
              </div>
            </section>

            <section className="terminal-panel min-h-0 p-4 sm:p-5">
              <div className="mb-4 border-b border-[var(--t-divider)] pb-3">
                <h2 className="font-[family-name:var(--font-plex-sans)] text-xl font-black uppercase tracking-wide text-[var(--t-amber)]">
                  Recent activity
                </h2>
              </div>
              {trader.recentActivity.length > 0 ? (
                <ol className="grid gap-3">
                  {trader.recentActivity.map((item) => (
                    <li
                      key={`${item.createdAt}:${item.activityType}:${item.dealId ?? ""}`}
                      className="border border-[var(--t-divider)] bg-[#070b09]/75 p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
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
                      {item.dealId ? (
                        <p className="mt-2 truncate text-[11px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                          Deal {item.dealId}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title="No public activity on the tape yet"
                  description="Once this trader scans, skips, wins, loses, or gets wiped out, the public floor tape will print it here."
                  className="border border-[var(--t-divider)] bg-[#070b09]/75"
                />
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
