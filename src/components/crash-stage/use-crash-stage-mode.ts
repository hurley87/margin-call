/**
 * Derives CrashStage presentation mode from theater live phase, player ticket,
 * and whether the player settled this session. Pure — no hooks, no WebGL.
 */

import type { TicketOutcome } from "@/lib/margin-call-crash";
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
  /** Player confirmed settle/claim/refund this session (gates personal replay). */
  settledThisSession: boolean;
  /** Spectator or post-settle: finalized replay hero is available. */
  hasReplayHero: boolean;
  /** Climb finished (progress >= 1). */
  isReplayComplete: boolean;
  /** Player ticket outcome after settle, for outcome burst. */
  outcome: TicketOutcome | null;
};

/**
 * Presentation mode for the immersive floor.
 *
 * - countdown: open entry window (or delayed without a personal settle gate)
 * - awaiting-settle: locked/reveal with unsettled ticket — huge Verify CTA, no climb
 * - replay: 3D climb — after player settle receipt, or for spectators after finalize
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
      if (input.hasReplayHero && shouldShowReplay(input)) {
        if (input.isReplayComplete) return "outcome";
        return "replay";
      }
      return "countdown";
    case "delayed":
      if (input.hasUnsettledTicket && !input.settledThisSession) {
        return "awaiting-settle";
      }
      return "countdown";
    case "finalized":
      if (input.hasUnsettledTicket && !input.settledThisSession) {
        return "awaiting-settle";
      }
      if (input.hasReplayHero && shouldShowReplay(input)) {
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

/**
 * Player: climb only after settlement receipt this session.
 * Spectator (no unsettled ticket): climb as soon as a finalized replay hero exists.
 */
function shouldShowReplay(input: CrashStageModeInput): boolean {
  if (input.hasUnsettledTicket) {
    return input.settledThisSession;
  }
  // Already settled this session (personal) or never had a ticket (spectator).
  return true;
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
  isOpen: boolean;
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
  if (input.canRetry && input.mode === "error") return "retry";

  if (input.mode === "awaiting-settle") {
    if (input.canVerify) return "verify";
    if (input.canClaim) return "claim";
    if (input.canSettle) return "settle-loss";
    if (input.canExpire) return "expire";
    if (input.canRefund) return "refund";
    return "none";
  }

  if (input.mode === "expired") {
    if (input.canExpire) return "expire";
    if (input.canRefund) return "refund";
    return "none";
  }

  if (input.mode === "countdown" && input.isOpen && !input.hasTicket) {
    return "enter";
  }

  // After finalize, claim/settle may still be available if flow split.
  if (input.canClaim) return "claim";
  if (input.canSettle) return "settle-loss";
  if (input.canRefund) return "refund";
  if (input.canExpire) return "expire";

  return "none";
}
