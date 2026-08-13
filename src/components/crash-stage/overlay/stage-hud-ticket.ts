import type { CrashTicket } from "@/lib/margin-call-crash";
import { ticketForRound } from "@/components/round-theater/landing-frame";

/**
 * Floor HUD chip ticket: unsettled only. Never surfaces a settled historical
 * ticket recovered by readPlayerRecentTicket's settled fallback during Open.
 */
export function stageHudTicket(
  unsettledTicket: CrashTicket | null
): CrashTicket | null {
  return unsettledTicket;
}

/**
 * Ticket used for personal replay landing / tier audio. Prefers an unsettled
 * ticket, then a settled ticket that belongs to the replay hero round only.
 */
export function stageHeroTicket(input: {
  unsettledTicket: CrashTicket | null;
  playerTicket: CrashTicket | null;
  settlementTicket: CrashTicket | null;
  replayRoundId: bigint | null;
}): CrashTicket | null {
  if (input.unsettledTicket) return input.unsettledTicket;
  if (input.replayRoundId === null) return null;
  return (
    ticketForRound(input.playerTicket, input.replayRoundId) ??
    ticketForRound(input.settlementTicket, input.replayRoundId)
  );
}
