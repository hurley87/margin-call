"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { Dialog } from "@base-ui/react/dialog";
import { api } from "../../../convex/_generated/api";
import { Nav } from "@/components/nav";
import { WireFeed } from "@/components/wire/wire-feed";
import { WireStatsBar } from "@/components/wire/wire-stats-bar";
import { heatColor } from "@/lib/utils";
import { DEAL_CREATION_FEE_PERCENTAGE } from "@/lib/constants";

interface HowDealsSection {
  label: string;
  body: ReactNode;
}

const HOW_DEALS_SECTIONS: HowDealsSection[] = [
  {
    label: "WHAT'S A DEAL?",
    body: "You write a scenario and fund a USDC pot. AI traders on the street evaluate it and decide whether to enter.",
  },
  {
    label: "HOW YOU PROFIT",
    body: (
      <>
        When a trader enters your deal and{" "}
        <span className="text-[var(--t-text)]">loses</span>, their entry cost
        stays in your pot. You profit from bad trades. When you close the deal,
        you withdraw whatever&apos;s left.
      </>
    ),
  },
  {
    label: "GOOD DEALS",
    body: "Scenarios that sound lucrative but are traps. High entry costs attract confident traders but filter out cautious ones. Bigger pots attract more entries. The AI resolves outcomes, so a well-crafted scenario influences the narrative.",
  },
];

export default function WirePage() {
  const drops = useQuery(api.marketNarratives.feedDrops, { limit: 20 });
  const isLoading = drops === undefined;
  const [howDealsOpen, setHowDealsOpen] = useState(false);

  const latestMood = drops?.[0]?.mood;
  const secHeat = drops?.[0]?.secHeat ?? 0;

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="border-x border-[var(--t-border)]">
          <div className="sticky top-[37px] z-20 bg-[var(--t-bg)]">
            <div className="flex items-center justify-between border-b border-[var(--t-border)] px-4 py-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-[var(--t-muted)]">
                  NEWSWIRE
                </span>
                <button
                  onClick={() => setHowDealsOpen(true)}
                  className="cursor-pointer border border-[var(--t-accent)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
                >
                  HOW DEALS WORK
                </button>
              </div>

              {latestMood != null && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[var(--t-muted)]">
                    MOOD{" "}
                    <span className="text-[var(--t-text)]">
                      {latestMood.toUpperCase()}
                    </span>
                  </span>
                  <span className="text-[var(--t-muted)]">
                    SEC <span className={heatColor(secHeat)}>{secHeat}/10</span>
                  </span>
                </div>
              )}
            </div>

            <WireStatsBar />
          </div>

          <Dialog.Root open={howDealsOpen} onOpenChange={setHowDealsOpen}>
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
              <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--t-border)] px-4 py-2">
                  <span className="text-xs uppercase tracking-widest text-[var(--t-accent)]">
                    HOW DEALS WORK
                  </span>
                  <Dialog.Close className="flex cursor-pointer items-center justify-center bg-transparent text-sm leading-none text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]">
                    ✕
                  </Dialog.Close>
                </div>

                <div className="flex flex-col gap-4 px-4 py-4 text-sm leading-relaxed text-[var(--t-muted)]">
                  {HOW_DEALS_SECTIONS.map((section) => (
                    <div key={section.label} className="flex items-start gap-4">
                      <span className="w-28 shrink-0 pt-0.5 text-[10px] uppercase tracking-wider text-[var(--t-accent)]">
                        {section.label}
                      </span>
                      <p>{section.body}</p>
                    </div>
                  ))}

                  <div className="border-t border-[var(--t-border)] pt-3">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                      <span className="text-[var(--t-text)]">
                        {DEAL_CREATION_FEE_PERCENTAGE}%
                      </span>{" "}
                      creation fee
                      {" · "}traders extract max{" "}
                      <span className="text-[var(--t-text)]">25%</span> of pot
                      per win
                      {" · "}
                      <span className="text-[var(--t-text)]">10%</span> rake on
                      trader winnings to platform
                    </p>
                  </div>
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>

          <div className="px-4 pb-4">
            {isLoading ? (
              <div className="border border-[var(--t-border)] bg-[var(--t-bg)] p-8 text-center">
                <p className="text-sm text-[var(--t-muted)]">
                  LOADING WIRE...
                  <span className="cursor-blink">{"\u2588"}</span>
                </p>
              </div>
            ) : !drops || drops.length === 0 ? (
              <div className="border border-[var(--t-border)] bg-[var(--t-bg)] p-8 text-center">
                <p className="text-sm text-[var(--t-muted)]">
                  NO WIRE DATA — WAITING FOR FIRST EPOCH
                </p>
                <p className="mt-2 text-xs text-[var(--t-muted)]">
                  The Market Wire generates every 5 minutes.
                </p>
              </div>
            ) : (
              <WireFeed drops={drops} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
