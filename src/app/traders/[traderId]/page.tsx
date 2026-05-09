import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { TRADER_PLACEHOLDER_IMAGE_PATH } from "@/lib/trader-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let portraitUrl: string = TRADER_PLACEHOLDER_IMAGE_PATH;
  if (trader.portraitStatus === "ready" && trader.profileImageUrl) {
    portraitUrl = trader.profileImageUrl;
  }
  const showFallbackInitials = trader.portraitStatus !== "ready";

  return (
    <main className="min-h-screen bg-[var(--t-bg)] text-[var(--t-text)] crt-scanlines">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--t-divider)] pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--t-muted)]">
              Margin Call public trader dossier
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-plex-sans)] text-3xl font-black uppercase tracking-wide text-[var(--t-amber)] sm:text-5xl">
              {trader.name}
            </h1>
          </div>
          <Link
            href="/"
            className="border border-[var(--t-divider)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--t-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
          >
            DESK_OS
          </Link>
        </header>

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
              <div className="grid grid-cols-2 border-t border-[var(--t-divider)] text-xs uppercase tracking-[0.16em]">
                <ProfileDatum
                  label="Status"
                  value={formatStatus(trader.status)}
                />
                <ProfileDatum
                  label="Portrait"
                  value={formatPortraitStatus(trader.portraitStatus)}
                />
              </div>
            </div>
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
                <ProfileDatum
                  label="Token ID"
                  value={tokenLabel(trader.tokenId)}
                />
                <ProfileDatum label="Archetype" value={trader.archetype} />
                <ProfileDatum label="Risk" value={trader.riskProfile} />
                <ProfileDatum
                  label="Escrow Capital"
                  value={formatUsdc(trader.escrowBalanceUsdc)}
                />
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
                          {formatActivityType(item.activityType)}
                        </span>
                        <time dateTime={new Date(item.createdAt).toISOString()}>
                          {formatTime(item.createdAt)}
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
                <p className="border border-[var(--t-divider)] bg-[#070b09]/75 p-4 text-sm uppercase tracking-[0.14em] text-[var(--t-muted)]">
                  No public activity on the tape yet
                </p>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProfileDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-[var(--t-divider)] bg-[#070b09]/75 p-3">
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {label}
      </p>
      <p className="break-words text-sm font-bold uppercase tracking-wide text-[var(--t-text)]">
        {value}
      </p>
    </div>
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

function formatStatus(status: PublicTraderProfile["status"]): string {
  return status.replaceAll("_", " ");
}

function formatPortraitStatus(
  status: PublicTraderProfile["portraitStatus"]
): string {
  if (status === "error") return "Fallback";
  return status.replaceAll("_", " ");
}

function tokenLabel(tokenId: number | null): string {
  return tokenId === null ? "Pending" : `#${tokenId}`;
}

function formatUsdc(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatActivityType(activityType: string): string {
  return activityType.replaceAll("_", " ");
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}
