import type { AbiEvent } from "viem";

/** MarginCall lifecycle events — shared by frontend ABI and Convex indexer. */
export const positionOpenedEvent = {
  type: "event",
  name: "PositionOpened",
  inputs: [
    { name: "tokenId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "assetId", type: "uint256", indexed: true },
    { name: "stockAmount", type: "uint256", indexed: false },
  ],
} as const satisfies AbiEvent;

export const positionClosedEvent = {
  type: "event",
  name: "PositionClosed",
  inputs: [
    { name: "tokenId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "stockAmount", type: "uint256", indexed: false },
  ],
} as const satisfies AbiEvent;

export const positionLiquidatedEvent = {
  type: "event",
  name: "PositionLiquidated",
  inputs: [
    { name: "tokenId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "stockAmount", type: "uint256", indexed: false },
    { name: "usdcOut", type: "uint256", indexed: false },
  ],
} as const satisfies AbiEvent;

export const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "tokenId", type: "uint256", indexed: true },
  ],
} as const satisfies AbiEvent;

export const MARGIN_CALL_EVENT_ABI = [
  positionOpenedEvent,
  positionClosedEvent,
  positionLiquidatedEvent,
  transferEvent,
] as const;
