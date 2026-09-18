import { type Log, parseEventLogs } from "viem";
import { marginCallAbi } from "@/lib/protocol/abi";

/**
 * Decode `PositionOpened` from a confirmed receipt.
 * Never guess the token ID from counters or UI state.
 */
export function decodePositionOpenedTokenId(
  logs: readonly Log[] | Log[]
): bigint {
  const events = parseEventLogs({
    abi: marginCallAbi,
    logs: [...logs],
    eventName: "PositionOpened",
  });

  const event = events[0];
  if (!event) {
    throw new Error("PositionOpened event not found in receipt");
  }

  return event.args.tokenId;
}
