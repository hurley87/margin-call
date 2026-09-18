import {
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiParameters,
} from "viem";
import {
  positionClosedEvent,
  positionLiquidatedEvent,
  positionOpenedEvent,
  transferEvent,
} from "@margin-call/shared/margin-call-events";
import { MARGIN_CALL_ADDRESS } from "../../convex/lib/deployment";
import type { WireLog } from "../../convex/lib/events";

type TestEvent =
  | typeof positionOpenedEvent
  | typeof positionClosedEvent
  | typeof positionLiquidatedEvent
  | typeof transferEvent;

/** Build a synthetic wire log for tests (topic encoding via viem). */
export function encodeTestLog(args: {
  event: TestEvent;
  args: Record<string, unknown>;
  blockNumber: number;
  transactionHash: Hex;
  logIndex: number;
  address?: string;
}): WireLog {
  const topics = encodeEventTopics({
    abi: [args.event],
    eventName: args.event.name,
    args: args.args as never,
  }) as Hex[];

  let data: Hex = "0x";
  if (args.event.name === "PositionOpened") {
    data = encodeAbiParameters(parseAbiParameters("uint256"), [
      args.args.stockAmount as bigint,
    ]);
  } else if (args.event.name === "PositionClosed") {
    data = encodeAbiParameters(parseAbiParameters("uint256"), [
      args.args.stockAmount as bigint,
    ]);
  } else if (args.event.name === "PositionLiquidated") {
    data = encodeAbiParameters(parseAbiParameters("uint256, uint256"), [
      args.args.stockAmount as bigint,
      args.args.usdcOut as bigint,
    ]);
  }

  return {
    address: (args.address ?? MARGIN_CALL_ADDRESS).toLowerCase(),
    topics: [...topics],
    data,
    blockNumber: args.blockNumber,
    transactionHash: args.transactionHash,
    logIndex: args.logIndex,
  };
}
