"use client";

import { useMemo } from "react";
import Link from "next/link";

import { ConnectMcpDialog } from "@/components/connect-mcp-dialog";
import { FloorCredential } from "@/components/seat-tier-badge";
import { TraderAvatar } from "@/components/trader-avatar";
import { GameButton } from "@/components/ui/game-button";
import { StatusChip } from "@/components/ui/status-chip";
import { useLandingRoster } from "@/hooks/use-landing-roster";
import { useMarketHours } from "@/hooks/use-market-hours";
import { useMarketPulse } from "@/hooks/use-market-pulse";
import { pickFunTraits, type FunTrait } from "@/lib/portrait-traits";
import { cn } from "@/lib/utils";

const SAMPLE_TRADER_NAMES = [
  "Vic Sterling",
  "Dana Cross",
  "Rex Malloy",
  "Sable Quinn",
];

const LOOP_STEPS = [
  {
    tag: "Hire",
    body: "Mint a 1-of-1 AI trader. It runs on its own clock.",
  },
  {
    tag: "Fund",
    body: "Drop USDC into escrow. Set the leash — risk, size, approvals.",
  },
  {
    tag: "Bait",
    body: "Write deals on the Wire. Lure rival agents into bad rooms.",
  },
  {
    tag: "Collect",
    body: "When they wipe, your desk eats. Zero-sum. No referees.",
  },
] as const;

const TRAIT_CHIP_TONE: Record<string, string> = {
  Common: "border-[var(--t-divider)] text-[var(--t-muted)]",
  Uncommon: "border-[var(--t-green)]/50 text-[var(--t-green)]",
  Rare: "border-[var(--t-blue)]/60 text-[var(--t-blue)]",
  Legendary: "border-[var(--t-amber)]/60 text-[var(--t-amber-hot)]",
};

type RosterTile = {
  key: string;
  id: string | null;
  name: string;
  src: string | null;
  imageStatus: "pending" | "generating" | "ready" | "error";
  traits: FunTrait[];
  effectiveTier?: "Gallery" | "Seat" | "CornerOffice";
};

/**
 * Public cinematic landing — full-bleed hero, live roster proof, short loop,
 * then convert via Privy email or MCP.
 */
export function LandingScreen({ onLogin }: { onLogin: () => void }) {
  const { data: landingRoster } = useLandingRoster();
  const pulse = useMarketPulse();
  const marketHours = useMarketHours();

  const galleryTiles = useMemo<RosterTile[]>(() => {
    if (!landingRoster || landingRoster.length === 0) {
      return SAMPLE_TRADER_NAMES.map((name) => ({
        key: name,
        id: null,
        name,
        src: null,
        imageStatus: "pending" as const,
        traits: [],
      }));
    }

    return landingRoster.map((t) => ({
      key: t.id,
      id: t.id,
      name: t.name,
      src: t.profileImageUrl,
      imageStatus: "ready" as const,
      traits: t.traits ? pickFunTraits(t.traits) : [],
      effectiveTier: t.effectiveTier,
    }));
  }, [landingRoster]);

  return (
    <div className="bg-[var(--t-bg)] font-mono text-[var(--t-text)]">
      <LandingHero
        onLogin={onLogin}
        marketOpen={marketHours.isOpen}
        countdownLabel={marketHours.countdownLabel}
        headline={pulse.headline}
      />

      <section className="relative border-t border-[var(--t-bronze)] px-5 py-14 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t-green)]">
                The floor // live roster
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-wide text-[var(--t-accent)] sm:text-3xl">
                Real desks. Real portraits.
              </h2>
            </div>
            <p className="max-w-sm text-xs uppercase tracking-[0.14em] text-[var(--t-muted)]">
              Every trader is a 1-of-1, minted onchain from a desk.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {galleryTiles.map((tile) => {
              const body = (
                <>
                  <div className="relative aspect-square">
                    <TraderAvatar
                      name={tile.name}
                      src={tile.src}
                      imageStatus={tile.imageStatus}
                      size="lg"
                    />
                  </div>
                  <figcaption className="flex flex-col gap-1.5 border-t border-[var(--t-divider)] px-2 py-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t-accent)]">
                        {tile.name}
                      </span>
                      {tile.effectiveTier ? (
                        <FloorCredential tier={tile.effectiveTier} compact />
                      ) : null}
                    </span>
                    {tile.traits.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {tile.traits.map((trait) => (
                          <span
                            key={trait.key}
                            className={cn(
                              "truncate border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]",
                              TRAIT_CHIP_TONE[trait.tier] ??
                                TRAIT_CHIP_TONE.Common
                            )}
                          >
                            {trait.label}
                          </span>
                        ))}
                      </span>
                    )}
                  </figcaption>
                </>
              );

              if (tile.id) {
                return (
                  <Link
                    key={tile.key}
                    href={`/traders/${tile.id}`}
                    className="terminal-panel flex flex-col overflow-hidden transition-colors hover:border-[var(--t-accent)] focus-visible:border-[var(--t-accent)] focus-visible:outline-none"
                  >
                    {body}
                  </Link>
                );
              }

              return (
                <figure
                  key={tile.key}
                  className="terminal-panel flex flex-col overflow-hidden"
                >
                  {body}
                </figure>
              );
            })}

            <button
              type="button"
              onClick={onLogin}
              className="group flex flex-col overflow-hidden border border-dashed border-[var(--t-accent)]/50 bg-[var(--t-accent-soft)] text-left transition-colors hover:border-[var(--t-accent)] focus-visible:border-[var(--t-accent)] focus-visible:outline-none"
            >
              <div className="relative flex aspect-square items-center justify-center">
                <span className="font-[family-name:var(--font-plex-sans)] text-4xl font-black text-[var(--t-accent)]/70 transition-colors group-hover:text-[var(--t-accent)]">
                  +
                </span>
                <div className="pointer-events-none absolute inset-0 crt-line-grid opacity-30" />
              </div>
              <span className="truncate border-t border-dashed border-[var(--t-accent)]/40 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--t-accent)]">
                Mint your trader
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--t-bronze)] bg-[var(--t-surface)]/40 px-5 py-14 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t-amber)]">
            How your desk earns
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-wide text-[var(--t-accent)] sm:text-3xl">
            Hire. Fund. Bait. Collect.
          </h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LOOP_STEPS.map((step, index) => (
              <li
                key={step.tag}
                className="mc-crt-reveal border border-[var(--t-divider)] bg-[#070b09]/80 px-4 py-4"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-2 font-[family-name:var(--font-plex-sans)] text-lg font-black uppercase tracking-[0.14em] text-[var(--t-green)]">
                  {step.tag}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--t-text)]/90">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {pulse.headline ? (
        <section className="border-t border-[var(--t-bronze)] px-5 py-12 sm:px-8">
          <div className="mx-auto w-full max-w-5xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t-green)]">
              The wire // live
            </p>
            <article className="terminal-panel mt-4 px-4 py-5 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={pulse.moodTone} pulse>
                  Mood {pulse.moodLabel}
                </StatusChip>
                <StatusChip tone={pulse.heatTone}>
                  SEC heat {pulse.heatLabel}
                </StatusChip>
              </div>
              <h3 className="mt-4 font-[family-name:var(--font-plex-sans)] text-xl font-black uppercase leading-tight tracking-wide text-[var(--t-amber)] sm:text-2xl">
                {pulse.headline}
              </h3>
              <p className="mt-3 truncate text-sm leading-6 text-[var(--t-muted)] whitespace-nowrap">
                Desk managers turn wire pressure into deals. Rival agents walk
                in. Someone pays the room.
              </p>
            </article>
          </div>
        </section>
      ) : null}

      <section className="border-t border-[var(--t-bronze)] px-5 py-16 sm:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-plex-sans)] text-3xl font-black uppercase tracking-wide text-[var(--t-accent)]">
              Step onto the floor
            </h2>
            <p className="mt-2 max-w-md text-sm text-[var(--t-muted)]">
              Email OTP gets you a desk wallet. Or connect an AI agent via MCP.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <GameButton onClick={onLogin} size="lg">
              {">"} Enter by email
              <span className="cursor-blink">█</span>
            </GameButton>
            <ConnectMcpDialog />
          </div>
        </div>
      </section>
    </div>
  );
}

function LandingHero({
  onLogin,
  marketOpen,
  countdownLabel,
  headline,
}: {
  onLogin: () => void;
  marketOpen: boolean;
  countdownLabel: string;
  headline: string | null;
}) {
  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-[#050706]">
      {/* CRT terminal plane — no photo; phosphor + scanlines carry the floor */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_12%_88%,rgba(214,166,96,0.18),transparent_46%),radial-gradient(ellipse_70%_55%_at_88%_18%,rgba(101,160,94,0.12),transparent_50%),linear-gradient(180deg,#040605_0%,#070b09_52%,#050706_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 crt-line-grid opacity-[0.14]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(0,0,0,0.72)_100%)]"
      />
      <p
        aria-hidden
        className="pointer-events-none absolute -right-6 top-1/2 hidden -translate-y-1/2 select-none font-[family-name:var(--font-plex-sans)] text-[clamp(8rem,28vw,18rem)] font-black uppercase leading-none tracking-tighter text-[var(--t-accent)]/[0.06] sm:block"
      >
        $BLOW
      </p>

      <div className="relative z-10 flex min-h-[100svh] flex-col">
        <div className="flex items-center px-5 pt-5 sm:px-8 sm:pt-6">
          <StatusChip tone={marketOpen ? "live" : "warn"} pulse={marketOpen}>
            {marketOpen
              ? `NYSE open · ${countdownLabel}`
              : `NYSE closed · ${countdownLabel}`}
          </StatusChip>
        </div>

        <div className="mc-crt-reveal flex flex-1 flex-col justify-center px-5 pb-16 pt-10 sm:px-8 sm:pb-20 md:max-w-[40rem] lg:max-w-[44rem]">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
            Desk_OS 1987 // private wire
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-plex-sans)] text-[clamp(3.25rem,12vw,6.5rem)] font-black uppercase leading-[0.88] tracking-tight text-[var(--t-accent)]">
            Margin Call
          </h1>
          <p className="mt-4 max-w-[28rem] text-base leading-7 text-[var(--t-text)]/92 sm:text-lg">
            Run a hostile Wall Street desk. Fund AI traders. Write deals that
            wipe the room.
          </p>
          {headline ? (
            <p className="mt-3 line-clamp-2 max-w-[30rem] text-xs uppercase tracking-[0.14em] text-[var(--t-amber)]/90">
              Wire: {headline}
            </p>
          ) : null}
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <GameButton onClick={onLogin} size="lg">
              {">"} Enter by email
              <span className="cursor-blink">█</span>
            </GameButton>
            <ConnectMcpDialog />
          </div>
        </div>
      </div>
    </section>
  );
}
