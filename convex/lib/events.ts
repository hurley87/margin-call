import {
  type AbiEvent,
  type Hex,
  decodeEventLog,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  parseAbiParameters,
} from "viem";
import { MARGIN_CALL_ADDRESS } from "./deployment";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

export const POSITION_OPENED_TOPIC = encodeEventTopics({
  abi: [positionOpenedEvent],
  eventName: "PositionOpened",
})[0]!;

export const POSITION_CLOSED_TOPIC = encodeEventTopics({
  abi: [positionClosedEvent],
  eventName: "PositionClosed",
})[0]!;

export const POSITION_LIQUIDATED_TOPIC = encodeEventTopics({
  abi: [positionLiquidatedEvent],
  eventName: "PositionLiquidated",
})[0]!;

export const TRANSFER_TOPIC = encodeEventTopics({
  abi: [transferEvent],
  eventName: "Transfer",
})[0]!;

export const RELEVANT_EVENT_TOPICS = [
  POSITION_OPENED_TOPIC,
  POSITION_CLOSED_TOPIC,
  POSITION_LIQUIDATED_TOPIC,
  TRANSFER_TOPIC,
] as const;

export type PositionStatus = "active" | "closed" | "liquidated";

export type VerifiedLog = {
  address: string;
  topics: readonly Hex[];
  data: Hex;
  blockNumber: number;
  transactionHash: Hex;
  logIndex: number;
  /** Unix seconds when available (from block header). */
  blockTimestamp?: number;
};

export type PositionOpenedEffect = {
  kind: "opened";
  tokenId: string;
  owner: string;
  assetId: number;
  blockNumber: number;
  txHash: string;
  openedAt?: number;
};

export type PositionTransferEffect = {
  kind: "transfer";
  tokenId: string;
  owner: string;
  blockNumber: number;
  txHash: string;
};

export type PositionTerminalEffect = {
  kind: "closed" | "liquidated";
  tokenId: string;
  owner: string;
  blockNumber: number;
  txHash: string;
};

export type PositionEffect =
  PositionOpenedEffect | PositionTransferEffect | PositionTerminalEffect;

function isZeroAddress(address: string): boolean {
  return address.toLowerCase() === ZERO_ADDRESS;
}

function normalizeAddress(address: string): string {
  return getAddress(address).toLowerCase();
}

function isCanonicalMarginCall(address: string): boolean {
  return address.toLowerCase() === MARGIN_CALL_ADDRESS;
}

/** Decode a single MarginCall log into a lifecycle effect, or null if irrelevant. */
export function decodePositionEffect(log: VerifiedLog): PositionEffect | null {
  if (!isCanonicalMarginCall(log.address)) {
    return null;
  }
  if (log.topics.length === 0) {
    return null;
  }

  const topic0 = log.topics[0];
  try {
    if (topic0 === POSITION_OPENED_TOPIC) {
      const decoded = decodeEventLog({
        abi: [positionOpenedEvent],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "PositionOpened") return null;
      const { tokenId, owner, assetId } = decoded.args;
      return {
        kind: "opened",
        tokenId: tokenId.toString(),
        owner: normalizeAddress(owner),
        assetId: Number(assetId),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash.toLowerCase(),
        openedAt: log.blockTimestamp,
      };
    }

    if (topic0 === POSITION_CLOSED_TOPIC) {
      const decoded = decodeEventLog({
        abi: [positionClosedEvent],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "PositionClosed") return null;
      return {
        kind: "closed",
        tokenId: decoded.args.tokenId.toString(),
        owner: normalizeAddress(decoded.args.owner),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash.toLowerCase(),
      };
    }

    if (topic0 === POSITION_LIQUIDATED_TOPIC) {
      const decoded = decodeEventLog({
        abi: [positionLiquidatedEvent],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "PositionLiquidated") return null;
      return {
        kind: "liquidated",
        tokenId: decoded.args.tokenId.toString(),
        owner: normalizeAddress(decoded.args.owner),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash.toLowerCase(),
      };
    }

    if (topic0 === TRANSFER_TOPIC) {
      const decoded = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "Transfer") return null;
      const { from, to, tokenId } = decoded.args;
      // Mint/burn: do not change status or set owner to zero.
      if (isZeroAddress(from) || isZeroAddress(to)) {
        return null;
      }
      return {
        kind: "transfer",
        tokenId: tokenId.toString(),
        owner: normalizeAddress(to),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash.toLowerCase(),
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** Sort logs by block then logIndex for deterministic apply order. */
export function sortLogs(logs: readonly VerifiedLog[]): VerifiedLog[] {
  return [...logs].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber - b.blockNumber;
    }
    return a.logIndex - b.logIndex;
  });
}

export function decodeEffectsFromLogs(
  logs: readonly VerifiedLog[]
): PositionEffect[] {
  const effects: PositionEffect[] = [];
  for (const log of sortLogs(logs)) {
    const effect = decodePositionEffect(log);
    if (effect) {
      effects.push(effect);
    }
  }
  return effects;
}

/** Build a synthetic log for tests (topic encoding via viem). */
export function encodeTestLog(args: {
  event:
    | typeof positionOpenedEvent
    | typeof positionClosedEvent
    | typeof positionLiquidatedEvent
    | typeof transferEvent;
  args: Record<string, unknown>;
  blockNumber: number;
  transactionHash: Hex;
  logIndex: number;
  address?: string;
  blockTimestamp?: number;
}): VerifiedLog {
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
    topics,
    data,
    blockNumber: args.blockNumber,
    transactionHash: args.transactionHash,
    logIndex: args.logIndex,
    blockTimestamp: args.blockTimestamp,
  };
}
