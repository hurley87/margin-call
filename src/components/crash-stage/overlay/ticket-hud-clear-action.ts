import {
  primaryTicketResolveAction,
  type TicketResolveAction,
} from "./primary-ticket-resolve-action";

export type TicketHudClearAction = TicketResolveAction;

/**
 * Primary HUD clear action for an unsettled leftover ticket. Null when the
 * chip is the current Open entry (cannot cancel) or no can* resolve path is ready.
 */
export function ticketHudClearAction(input: {
  isLiveOpenEntry: boolean;
  settlement: Parameters<typeof primaryTicketResolveAction>[0]["settlement"];
  refund: Parameters<typeof primaryTicketResolveAction>[0]["refund"];
}): TicketHudClearAction | null {
  if (input.isLiveOpenEntry) return null;
  return primaryTicketResolveAction({
    settlement: input.settlement,
    refund: input.refund,
  });
}
