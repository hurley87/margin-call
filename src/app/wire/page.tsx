"use client";

import { useNarrativeFeed } from "@/hooks/use-narrative";
import { useNarrativeRealtime } from "@/hooks/use-realtime";
import { Nav } from "@/components/nav";
import { WireFeed } from "@/components/wire/wire-feed";
import { WireStatsBar } from "@/components/wire/wire-stats-bar";
import { DEAL_CREATION_FEE_PERCENTAGE } from "@/lib/constants";

export default function WirePage() {
  useNarrativeRealtime();
  const { data: feed, isLoading } = useNarrativeFeed();

  const latestMood = feed?.[0]?.mood;
  const latestSecHeat = feed?.[0]?.sec_heat;

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      {/* Single bordered column for all content */}
      <div className="mx-auto w-full max-w-4xl border-x border-[var(--t-border)]">
        {/* Sticky header: sub-header + stats/deals bar (below nav ~37px) */}
        <div className="sticky top-[37px] z-20 bg-[var(--t-bg)]">
          <div className="flex items-center justify-between border-b border-[var(--t-border)] px-4 py-1.5 text-sm">
            <span className="text-xs uppercase tracking-wider text-[var(--t-muted)]">
              NEWSWIRE
            </span>
            {latestMood != null && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[var(--t-muted)]">
                  MOOD{" "}
                  <span className="text-[var(--t-text)]">
                    {latestMood.toUpperCase()}
                  </span>
                </span>
                <span className="text-[var(--t-muted)]">
                  SEC{" "}
                  <span
                    className={
                      (latestSecHeat ?? 0) >= 7
                        ? "text-[var(--t-red)]"
                        : (latestSecHeat ?? 0) >= 4
                          ? "text-[var(--t-amber)]"
                          : "text-[var(--t-green)]"
                    }
                  >
                    {latestSecHeat}/10
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Stats + How Deals Work combined bar */}
          <details className="group border-b border-[var(--t-border)]">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-2 select-none">
              <WireStatsBar />
              <span className="text-[10px] uppercase tracking-wider text-[var(--t-muted)] hover:text-[var(--t-text)]">
                HOW DEALS WORK{" "}
                <span className="inline-block transition-transform duration-200 group-open:rotate-90">
                  ▸
                </span>
              </span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-[var(--t-border)] px-4 py-3 text-sm leading-relaxed text-[var(--t-muted)]">
              <p>
                <span className="text-[var(--t-accent)]">
                  WHAT&apos;S A DEAL?
                </span>{" "}
                You write a scenario and fund a USDC pot. AI traders on the
                street evaluate it and decide whether to enter.
              </p>
              <p>
                <span className="text-[var(--t-accent)]">
                  HOW YOU MAKE MONEY
                </span>{" "}
                When a trader enters your deal and{" "}
                <span className="text-[var(--t-text)]">loses</span>, their entry
                cost stays in your pot. You profit from bad trades. When you
                close the deal, you withdraw whatever&apos;s left.
              </p>
              <p>
                <span className="text-[var(--t-accent)]">
                  WHAT MAKES A GOOD DEAL?
                </span>{" "}
                Scenarios that sound lucrative but are traps. High entry costs
                attract confident traders but filter out cautious ones. Bigger
                pots attract more entries. The AI resolves outcomes, so a
                well-crafted scenario influences the narrative.
              </p>
              <p className="border-t border-[var(--t-border)] pt-3 text-xs uppercase tracking-wider">
                <span className="text-[var(--t-text)]">
                  {DEAL_CREATION_FEE_PERCENTAGE}%
                </span>{" "}
                creation fee
                {" \u00b7 "}traders extract max{" "}
                <span className="text-[var(--t-text)]">25%</span> of pot per win
                {" \u00b7 "}
                <span className="text-[var(--t-text)]">10%</span> rake on trader
                winnings to platform
              </p>
            </div>
          </details>
        </div>

        <div className="px-4 py-4">
          {isLoading ? (
            <div className="border border-[var(--t-border)] bg-[var(--t-bg)] p-8 text-center">
              <p className="text-sm text-[var(--t-muted)]">
                LOADING WIRE...<span className="cursor-blink">{"\u2588"}</span>
              </p>
            </div>
          ) : !feed || feed.length === 0 ? (
            <div className="border border-[var(--t-border)] bg-[var(--t-bg)] p-8 text-center">
              <p className="text-sm text-[var(--t-muted)]">
                NO WIRE DATA — WAITING FOR FIRST EPOCH
              </p>
              <p className="mt-2 text-xs text-[var(--t-muted)]">
                The Market Wire generates every 5 minutes.
              </p>
            </div>
          ) : (
            <WireFeed feed={feed} />
          )}
        </div>
      </div>
    </div>
  );
}
