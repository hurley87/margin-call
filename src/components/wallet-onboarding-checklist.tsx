"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  TraderAvatar,
  type TraderAvatarImageStatus,
} from "@/components/trader-avatar";
import { PersonaTraits, RarityBadge } from "@/components/persona-traits";
import type { PublicPortraitTraits } from "@/lib/portrait-traits";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useSfx } from "@/hooks/use-sfx";
import type { Doc } from "../../convex/_generated/dataModel";

type WalletStatus = Doc<"traders">["walletStatus"];
type WalletStep = Doc<"traders">["walletStep"];

/** Ordinal of the last completed checkpoint; ready means all four are done. */
const STEP_RANK: Record<NonNullable<WalletStep>, number> = {
  paperwork: 1,
  id_minted: 2,
  seat_registered: 3,
};
const TOTAL_STEPS = 4;

const FLAVOR_LINES = [
  "COMPLIANCE NEVER SLEEPS",
  "BADGE PHOTO IS NON-NEGOTIABLE",
  "LEGAL IS REVIEWING THE REVIEW",
  "THE FLOOR SMELLS LIKE MONEY",
  "SHARPEN PENCILS. AND ELBOWS.",
  "THE CORNER OFFICE IS WATCHING",
  "DRESS CODE: PINSTRIPES, ALWAYS",
];

const FLAVOR_INTERVAL_MS = 4500;

/**
 * Sticky flag that flips true only when `value` is observed transitioning to
 * `target` while mounted. Stays false if it was already at `target` on mount,
 * so payoff animations fire on a real arrival — not on a re-open or re-render.
 */
function useArrivedAt<T>(value: T, target: T): boolean {
  const [prev, setPrev] = useState(value);
  const [arrived, setArrived] = useState(false);
  if (prev !== value) {
    setPrev(value);
    if (value === target) setArrived(true);
  }
  return arrived;
}

export function WalletOnboardingChecklist({
  walletStatus,
  walletStep,
  tokenId,
  traderName,
  imageStatus,
  profileImageUrl,
  traits,
  rarity,
}: {
  walletStatus: WalletStatus;
  walletStep: WalletStep | null;
  tokenId: number | null;
  traderName: string;
  imageStatus: TraderAvatarImageStatus | null;
  profileImageUrl: string;
  traits: PublicPortraitTraits | null;
  rarity: string;
}) {
  const reducedMotion = useReducedMotion();
  const { playStinger } = useSfx();

  const ready = walletStatus === "ready";
  const doneCount = ready
    ? TOTAL_STEPS
    : walletStep
      ? STEP_RANK[walletStep]
      : 0;

  const lines = [
    { active: "FILING PAPERWORK", done: "PAPERWORK FILED" },
    {
      active: "MINTING TRADER ID",
      done: tokenId ? `TRADER ID MINTED #${tokenId}` : "TRADER ID MINTED",
    },
    { active: "REGISTERING SEAT", done: "SEAT REGISTERED" },
    { active: "ISSUING FLOOR BADGE", done: "FLOOR BADGE ISSUED" },
  ];

  // Payoff only on an observed transition to ready — re-opening the dialog on
  // an already-ready wallet renders the static completed state silently. Same
  // guard for the portrait's CRT reveal: only when it lands while mounted.
  const justCompleted = useArrivedAt(walletStatus, "ready");
  const portraitRevealed = useArrivedAt(imageStatus, "ready");
  useEffect(() => {
    if (justCompleted) playStinger();
  }, [justCompleted, playStinger]);

  const [flavorIdx, setFlavorIdx] = useState(0);
  const provisioning =
    walletStatus === "pending" || walletStatus === "creating";
  useEffect(() => {
    if (!provisioning) return;
    const interval = setInterval(
      () => setFlavorIdx((i) => (i + 1) % FLAVOR_LINES.length),
      FLAVOR_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, [provisioning]);

  return (
    <div className="terminal-panel p-4">
      {justCompleted && !reducedMotion && (
        <span
          aria-hidden
          className="mc-onboard-flash pointer-events-none absolute inset-0"
        />
      )}
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-[var(--t-divider)] pb-3">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Back office — onboarding
        </h3>
        <span className="hidden text-right text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]/70 sm:inline">
          Getting {traderName} on the books
        </span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <ul className="min-w-0 flex-1 space-y-1.5 text-[11px] uppercase tracking-[0.14em]">
          {lines.map((line, idx) => {
            const isDone = idx < doneCount;
            const isCurrent = idx === doneCount && !ready;
            return (
              <li
                key={line.active}
                className={cn(
                  "flex items-baseline gap-2",
                  isDone && "text-[var(--t-green)]",
                  isCurrent && "text-[var(--t-amber)]",
                  !isDone && !isCurrent && "text-[var(--t-muted)]/40"
                )}
              >
                <span className="shrink-0">
                  {isDone ? "✓" : isCurrent ? "▸" : " "}
                </span>
                <span className="min-w-0 truncate">
                  {isDone ? line.done : line.active}
                </span>
                {isDone && (
                  <>
                    <span className="mx-1 min-w-4 flex-1 overflow-hidden whitespace-nowrap text-[var(--t-green)]/30">
                      ............................
                    </span>
                    <span className="shrink-0">OK</span>
                  </>
                )}
                {isCurrent && <span className="cursor-blink shrink-0">█</span>}
              </li>
            );
          })}
        </ul>

        <div
          className={cn(
            "h-20 w-20 shrink-0 border border-[var(--t-divider)]",
            portraitRevealed && !reducedMotion && "mc-crt-reveal"
          )}
        >
          <TraderAvatar
            name={traderName}
            src={profileImageUrl || null}
            imageStatus={imageStatus}
            size="lg"
          />
        </div>
      </div>

      {ready ? (
        <div className="mt-4 flex justify-center">
          <span
            className={cn(
              "inline-block -rotate-3 border-2 border-[var(--t-green)] px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-[var(--t-green)]",
              justCompleted && !reducedMotion && "mc-stamp-in"
            )}
          >
            TRADER ON THE FLOOR
          </span>
        </div>
      ) : (
        <p
          key={flavorIdx}
          className={cn(
            "mt-4 border-t border-[var(--t-divider)] pt-2 text-center text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]/70",
            !reducedMotion && "mc-flavor-fade"
          )}
        >
          {FLAVOR_LINES[flavorIdx]}
        </p>
      )}

      {traits && imageStatus === "ready" ? (
        <div
          className={cn(
            "mt-4 border-t border-[var(--t-divider)] pt-3",
            portraitRevealed && !reducedMotion && "mc-stamp-in"
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--t-amber)]">
              Persona revealed
            </h4>
            <RarityBadge
              rarity={rarity}
              className="px-1.5 py-0.5 text-[9px] tracking-[0.16em]"
            />
          </div>
          <PersonaTraits traits={traits} className="sm:grid-cols-1" />
        </div>
      ) : null}
    </div>
  );
}
