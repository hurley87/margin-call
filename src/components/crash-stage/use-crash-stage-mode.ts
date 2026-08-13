/**
 * Derives CrashStage presentation mode from theater live phase and whether
 * the player may climb (settle receipt or no unsettled ticket). Pure — no hooks.
 */

import type { TheaterLive } from "@/hooks/use-round-theater";

export type CrashStageMode =
  | "loading"
  | "error"
  | "countdown"
  | "awaiting-settle"
  | "replay"
  | "outcome"
  | "expired";

export type CrashStageModeInput = {
  live: TheaterLive;
  /** Player has a ticket for the displayed round that is not yet settled. */
  hasUnsettledTicket: boolean;
  /**
   * True when the player may see the Replay climb: no unsettled ticket
   * (spectator / already settled onchain), or settlement receipt confirmed.
   */
  mayClimb: boolean;
  /** Spectator or post-settle: finalized replay hero is available. */
  hasReplayHero: boolean;
  /** Climb finished (progress >= 1). */
  isReplayComplete: boolean;
};

/**
 * Presentation mode for the immersive floor.
 *
 * - countdown: open entry window (or delayed without a personal settle gate)
 * - awaiting-settle: locked/reveal with unsettled ticket — huge Verify CTA, no climb
 * - replay: 3D climb — after settle receipt, or for spectators after finalize
 * - outcome: win/loss burst after climb completes
 */
export function deriveCrashStageMode(
  input: CrashStageModeInput
): CrashStageMode {
  const { live } = input;

  switch (live.kind) {
    case "loading":
      return "loading";
    case "error":
    case "unavailable":
      return "error";
    case "expired":
      return "expired";
    case "open":
      // Held previous-round replay for spectators, or after personal settle.
      if (input.hasReplayHero && input.mayClimb) {
        if (input.isReplayComplete) return "outcome";
        return "replay";
      }
      return "countdown";
    case "delayed":
      if (input.hasUnsettledTicket && !input.mayClimb) {
        return "awaiting-settle";
      }
      return "countdown";
    case "finalized":
      if (input.hasUnsettledTicket && !input.mayClimb) {
        return "awaiting-settle";
      }
      if (input.hasReplayHero && input.mayClimb) {
        if (input.isReplayComplete) return "outcome";
        return "replay";
      }
      return "countdown";
    default: {
      const _exhaustive: never = live;
      return _exhaustive;
    }
  }
}

/** Hero CTA kind for the DOM overlay. */
export type StageCtaKind =
  | "none"
  | "enter"
  | "verify"
  | "claim"
  | "settle-loss"
  | "refund"
  | "expire"
  | "retry";

export type StageCtaInput = {
  mode: CrashStageMode;
  /** Entry is offered (open + cutoff + no ticket). */
  offerEntry: boolean;
  hasTicket: boolean;
  canEnter: boolean;
  canVerify: boolean;
  canClaim: boolean;
  canSettle: boolean;
  canRefund: boolean;
  canExpire: boolean;
  canRetry: boolean;
};

export function deriveStageCtaKind(input: StageCtaInput): StageCtaKind {
  if (input.mode === "awaiting-settle") {
    if (input.canVerify) return "verify";
    if (input.canClaim) return "claim";
    if (input.canSettle) return "settle-loss";
    if (input.canExpire) return "expire";
    if (input.canRefund) return "refund";
    if (input.canRetry) return "retry";
    return "none";
  }

  if (input.mode === "expired") {
    if (input.canExpire) return "expire";
    if (input.canRefund) return "refund";
    if (input.canRetry) return "retry";
    return "none";
  }

  if (input.mode === "countdown" && input.offerEntry && !input.hasTicket) {
    return "enter";
  }

  if (input.mode === "error" && input.canRetry) return "retry";

  // After finalize, claim/settle may still be available if flow split.
  if (input.canClaim) return "claim";
  if (input.canSettle) return "settle-loss";
  if (input.canRefund) return "refund";
  if (input.canExpire) return "expire";
  if (input.canRetry) return "retry";

  return "none";
}
