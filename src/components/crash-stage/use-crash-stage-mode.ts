/**
 * Derives CrashStage presentation mode from theater live phase, the player's
 * settle ceremony, and whether the player may climb (settle receipt or no
 * unsettled ticket). Pure — no hooks.
 */

import type { TheaterLive } from "@/hooks/use-round-theater";
import type { SettleCeremonyPhase } from "@/lib/settle-ceremony";

export type CrashStageMode =
  | "loading"
  | "error"
  | "countdown"
  | "awaiting-settle"
  | "settling"
  | "replay"
  | "outcome"
  | "expired";

export type CrashStageModeInput = {
  live: TheaterLive;
  /** Player-local settle ceremony phase; non-idle takes over the stage. */
  ceremonyPhase: SettleCeremonyPhase;
  /** Player has a ticket for the displayed round that is not yet settled. */
  hasUnsettledTicket: boolean;
  /** Unsettled ticket left over from a round before the live one. */
  hasStaleUnsettledTicket: boolean;
  /**
   * True when the player may see the attested climb: no unsettled ticket
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
 * - awaiting-settle: unsettled ticket without a running ceremony — Verify CTA
 * - settling: ceremony verifying (reveal → attest → finalize stepper)
 * - replay: the climb — ceremony-owned for the settling player, chain-seeded
 *   for spectators after finalize
 * - outcome: win/loss freeze; a ceremony holds it until acknowledged
 *
 * Ceremony precedence beats every ready live kind, including a flip to the
 * next open round: the player's own reveal is never interrupted by a poll.
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
    default:
      break;
  }

  switch (input.ceremonyPhase) {
    case "verifying":
      return "settling";
    case "climbing":
      return "replay";
    case "landed":
      return "outcome";
    case "idle":
      break;
    default: {
      const _exhaustive: never = input.ceremonyPhase;
      return _exhaustive;
    }
  }

  switch (live.kind) {
    case "expired":
      return "expired";
    case "open":
      // A leftover unsettled ticket blocks the next round's countdown; the
      // player finishes (or refunds) the old round before seeing a new one.
      if (input.hasStaleUnsettledTicket) return "awaiting-settle";
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
