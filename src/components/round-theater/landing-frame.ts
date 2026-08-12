/**
 * Shared post-climb landing frame for the round theater.
 *
 * Climb surfaces decide *when* the freeze applies; this module decides *what*
 * Won / Margin called / spectator Crash Point looks like so ReplayCurve and
 * RoundResultCard cannot drift.
 */

import { isWinningTicket, type CrashTicket } from "@/lib/margin-call-crash";
import { theaterCopy } from "./theater-copy";

export type TicketLanding =
  { kind: "spectator" } | { kind: "won" } | { kind: "margin-called" };

export type LandingPresentation = {
  heroLabel: string;
  heroValue: string;
  /** Tailwind text color class for the hero value. */
  heroColorClass: string;
  /** True when heroValue is a multiplier (tabular nums). */
  heroIsMultiplier: boolean;
  supportingCrashPoint: string | null;
  outcomeDetail: string | null;
  showMarginCallStamp: boolean;
  /** Body under the Margin call stamp; never duplicates outcomeDetail. */
  stampDetail: string | null;
  /** Crash-moment edge flash color (curve juice only). */
  momentColor: string;
};

/** Domain boundary: ticket + Crash Point → personal or spectator landing. */
export function ticketLanding(
  ticket: CrashTicket | null,
  crashPointBps: bigint
): TicketLanding {
  if (ticket === null) return { kind: "spectator" };
  return isWinningTicket(ticket.leverageBps, crashPointBps)
    ? { kind: "won" }
    : { kind: "margin-called" };
}

/**
 * Pure presentation of a finalized freeze. Both animated and reduced-motion
 * surfaces render these fields; they do not re-derive policy.
 */
export function presentLanding(
  landing: TicketLanding,
  crashPointLabel: string
): LandingPresentation {
  switch (landing.kind) {
    case "won":
      return {
        heroLabel: theaterCopy.yourTicket,
        heroValue: theaterCopy.playerWon,
        heroColorClass: "text-[var(--t-green-hot)]",
        heroIsMultiplier: false,
        supportingCrashPoint: theaterCopy.crashPointSupporting(crashPointLabel),
        outcomeDetail: theaterCopy.playerWonDetail,
        showMarginCallStamp: false,
        stampDetail: null,
        momentColor: "var(--t-safe)",
      };
    case "margin-called":
      return {
        heroLabel: theaterCopy.yourTicket,
        heroValue: theaterCopy.playerMarginCalled,
        heroColorClass: "text-[var(--t-red-hot)]",
        heroIsMultiplier: false,
        supportingCrashPoint: theaterCopy.crashPointSupporting(crashPointLabel),
        // Personal why sits under the hero; stamp keeps the market-die copy.
        outcomeDetail: theaterCopy.playerMarginCalledDetail,
        showMarginCallStamp: true,
        stampDetail: theaterCopy.marginCallDetail,
        momentColor: "var(--t-threat)",
      };
    case "spectator":
      return {
        heroLabel: theaterCopy.verifiedCrashPoint,
        heroValue: crashPointLabel,
        // Match the climb freeze: Crash Point lands red with the margin call.
        heroColorClass: "text-[var(--t-red-hot)]",
        heroIsMultiplier: true,
        supportingCrashPoint: null,
        outcomeDetail: null,
        showMarginCallStamp: true,
        stampDetail: theaterCopy.marginCallDetail,
        momentColor: "var(--t-amber-hot)",
      };
    default: {
      const _exhaustive: never = landing;
      return _exhaustive;
    }
  }
}
