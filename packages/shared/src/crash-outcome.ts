/**
 * Shared Crash ticket outcome policy.
 * Equality wins: leverage at or below the Crash Point pays.
 */

/** True when the ticket's Arcade Leverage closed at or before the Crash Point. */
export function isWinningTicket(leverageBps: bigint, crashPointBps: bigint) {
  return leverageBps <= crashPointBps;
}
