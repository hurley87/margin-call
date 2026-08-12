"use client";

import { memo, useEffect, useRef } from "react";

const SEEN_KEY = "mc-round-explainer-seen";

const steps = [
  {
    title: "Enter",
    body: "Commit Margin at an Arcade Leverage Tier during the 45-second entry window. One Ticket per wallet per round.",
  },
  {
    title: "Reveal",
    body: "Entry locks; the encrypted Crash Point is attested onchain. Nothing is invented while you wait.",
  },
  {
    title: "Result",
    body: "Tiers at or below the Crash Point pay their full reserved payout. The Replay dramatizes the already-final result — a new round opens every 60 seconds.",
  },
] as const;

/**
 * First-visit disclosure of the round lifecycle. Default-open once per
 * browser, collapsed afterwards; a native <details> so it never blocks play.
 */
export const RoundExplainer = memo(function RoundExplainer() {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Uncontrolled on purpose: React never manages `open`, so the browser owns
  // toggling and the theater's 1s re-renders can't clobber the user's choice.
  useEffect(() => {
    const seen = window.localStorage.getItem(SEEN_KEY) === "1";
    if (!seen && detailsRef.current) detailsRef.current.open = true;
    window.localStorage.setItem(SEEN_KEY, "1");
  }, []);

  return (
    <details
      className="border border-[var(--t-border)] bg-[var(--t-panel)]"
      data-testid="round-explainer"
      ref={detailsRef}
    >
      <summary className="cursor-pointer px-3 py-2 text-[var(--t-type-label)] font-bold uppercase tracking-[0.18em] text-[var(--t-accent)] sm:px-4">
        How a round works
      </summary>
      <ol className="grid gap-4 border-t border-[var(--t-divider)] px-3 py-3 sm:grid-cols-3 sm:px-4">
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
    </details>
  );
});
