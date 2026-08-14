/**
 * Pure dock kind for the Floor action surface. Settle/refund take precedence;
 * otherwise enter when the round can accept tickets, arm when the player can
 * pre-pick for the next window, and none during climb/outcome theater.
 */

import {
  canOfferEntry,
  isExpiryRefundTicket,
  type CrashRoundPhase,
  type TicketOutcome,
} from "@/lib/margin-call-crash";
import type { CrashStageMode } from "../use-crash-stage-mode";

export type StageDockKind = "enter" | "arm" | "settle" | "refund" | "none";

/** Phases where the player may arm picks for the next entry window. */
const ARMABLE_PHASES: ReadonlySet<CrashRoundPhase> = new Set([
  "prelaunch",
  "uninitialized",
  "open",
  "locked",
  "reveal-requested",
  "finalized",
]);

export type StageDockStateInput = {
  mode: CrashStageMode;
  phase: CrashRoundPhase;
  countdownSeconds: number;
  /** Live-round or stale ticket that blocks a fresh entry. */
  hasTicket: boolean;
  /** Settlement hook recovered a ticket (may differ from hasTicket). */
  hasSettlementTicket: boolean;
  canVerify: boolean;
  canClaim: boolean;
  canSettle: boolean;
  canRetry: boolean;
  settlementPhase: CrashRoundPhase | null;
  settlementOutcome: TicketOutcome | null;
};

export function deriveStageDockKind(input: StageDockStateInput): StageDockKind {
  const showSettle =
    input.hasSettlementTicket &&
    (input.canVerify || input.canClaim || input.canSettle || input.canRetry);

  if (showSettle) return "settle";

  // Expiry leftovers can block the next Open round — show refund even when the
  // live theater is no longer on the expired round.
  if (
    input.mode === "expired" ||
    isExpiryRefundTicket(input.settlementPhase, input.settlementOutcome)
  ) {
    return "refund";
  }

  if (canOfferEntry(input.phase, input.countdownSeconds) && !input.hasTicket) {
    return "enter";
  }

  // Keep the climb uncluttered — no arm dock over replay/outcome unless enter
  // already won above (next-round entry during a previous-round outcome).
  if (input.mode === "replay" || input.mode === "outcome") {
    return "none";
  }

  if (!input.hasTicket && ARMABLE_PHASES.has(input.phase)) {
    return "arm";
  }

  return "none";
}
