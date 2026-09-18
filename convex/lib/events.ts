import { type Hex, decodeEventLog, encodeEventTopics, getAddress } from "viem";
import {
  positionClosedEvent,
  positionLiquidatedEvent,
  positionOpenedEvent,
  transferEvent,
} from "@margin-call/shared/margin-call-events";
import { MARGIN_CALL_ADDRESS } from "./deployment";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export {
  positionClosedEvent,
  positionLiquidatedEvent,
  positionOpenedEvent,
  transferEvent,
};

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

/** Wire log shape accepted by ingest (Convex validators use string, not Hex). */
export type WireLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
};

export type PositionOpenedEffect = {
  kind: "opened";
  tokenId: string;
  owner: string;
  assetId: number;
  blockNumber: number;
  txHash: string;
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
export function decodePositionEffect(log: WireLog): PositionEffect | null {
  if (!isCanonicalMarginCall(log.address)) {
    return null;
  }
  if (log.topics.length === 0) {
    return null;
  }

  const topic0 = log.topics[0];
  const topics = log.topics as [Hex, ...Hex[]];
  const data = log.data as Hex;

  try {
    if (topic0 === POSITION_OPENED_TOPIC) {
      const decoded = decodeEventLog({
        abi: [positionOpenedEvent],
        data,
        topics,
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
      };
    }

    if (topic0 === POSITION_CLOSED_TOPIC) {
      const decoded = decodeEventLog({
        abi: [positionClosedEvent],
        data,
        topics,
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
        data,
        topics,
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
        data,
        topics,
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
export function sortLogs(logs: readonly WireLog[]): WireLog[] {
  return [...logs].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber - b.blockNumber;
    }
    return a.logIndex - b.logIndex;
  });
}

export function decodeEffectsFromLogs(
  logs: readonly WireLog[]
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
