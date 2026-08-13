/**
 * True while a sponsored ticket/history action is mid-flight.
 * Matches the status vocabulary used by settlement, refund, and history hooks.
 */
export function isSponsoredActionBusy(status: string): boolean {
  return (
    status.endsWith("-submitting") ||
    status.endsWith("-pending") ||
    status === "attesting"
  );
}
