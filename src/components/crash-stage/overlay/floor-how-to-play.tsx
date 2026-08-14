"use client";

import { memo, useEffect, useRef } from "react";
import { HOW_TO_PLAY_URL } from "@/lib/product-docs";

const SEEN_KEY = "mc-floor-howto-seen";

const steps = [
  {
    title: "Sign in",
    body: "Continue with a phone number. An embedded smart wallet is created automatically — no wallet app, seed phrase, or test ETH.",
  },
  {
    title: "Claim Desk Dollars",
    body: "Tap the in-app faucet for free testnet Desk Dollars. Gas is sponsored for every action on the Floor.",
  },
  {
    title: "Enter",
    body: "Pick Margin (1, 5, or 10) and one of six Arcade Leverage tiers during the 45-second entry window. One Ticket per wallet per round.",
  },
  {
    title: "Settle",
    body: "After lock, verify and settle. Tiers at or below the Crash Point pay their reserved payout. The Replay dramatizes an already-final result — a new round opens every 60 seconds.",
  },
] as const;

/**
 * Non-blocking Floor how-to-play. Default-open once per browser, collapsed
 * afterwards; native <details> so the theater's re-renders never clobber the
 * player's toggle. Expanded body overlays the pit without pushing layout.
 */
export const FloorHowToPlay = memo(function FloorHowToPlay() {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const seen = window.localStorage.getItem(SEEN_KEY) === "1";
    if (!seen && detailsRef.current) detailsRef.current.open = true;
    window.localStorage.setItem(SEEN_KEY, "1");
  }, []);

  return (
    <div className="relative" data-testid="floor-how-to-play">
      <details className="group" ref={detailsRef}>
        <summary className="cursor-pointer list-none rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-accent)] backdrop-blur-sm marker:content-none [&::-webkit-details-marker]:hidden">
          How to play
        </summary>
        <div className="pointer-events-auto absolute right-0 top-full z-30 mt-1.5 w-[min(calc(100vw-1.5rem),22rem)] border border-[var(--t-border)] bg-[var(--t-panel)] p-3 shadow-lg sm:w-[28rem] sm:p-4">
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li className="text-xs leading-5" key={step.title}>
                <p className="font-bold uppercase tracking-[0.14em] text-[var(--t-text)]">
                  <span aria-hidden="true" className="text-[var(--t-accent)]">
                    {index + 1}.{" "}
                  </span>
                  {step.title}
                </p>
                <p className="mt-1 text-[var(--t-muted)]">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-[var(--t-divider)] pt-3 text-xs leading-5 text-[var(--t-muted)]">
            Want the full playbook?{" "}
            <a
              className="font-bold uppercase tracking-[0.14em] text-[var(--t-accent)] underline-offset-2 hover:underline"
              data-testid="floor-how-to-play-docs"
              href={HOW_TO_PLAY_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Learn more in the docs
            </a>
          </p>
        </div>
      </details>
    </div>
  );
});
