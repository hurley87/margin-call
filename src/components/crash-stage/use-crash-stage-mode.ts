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
 * - awaiting-settle: locked/reveal with unsettled ticket — Verify CTA, no climb
 * - replay: attested climb graph after settle receipt, or for spectators after finalize
 * - outcome: win/loss freeze after the climb completes
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
