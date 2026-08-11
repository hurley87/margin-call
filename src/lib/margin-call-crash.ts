import {
  getAbiItem,
  isAddress,
  parseAbi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { baseSepoliaPublicClient } from "./base-sepolia";
import { getBaseSepoliaTransactionUrl } from "./base-sepolia-explorer";

export const marginCallCrashAbi = parseAbi([
  "function epochOrigin() view returns (uint64)",
  "function roundDuration() view returns (uint64)",
  "function entryWindow() view returns (uint64)",
  "function expiryDelay() view returns (uint64)",
  "function currentRoundId() view returns (uint256)",
  "function roundTimes(uint256 roundId) view returns (uint64 openAt, uint64 lockAt, uint64 expiresAt)",
  "function getRound(uint256 roundId) view returns ((uint256 id, uint64 openAt, uint64 lockAt, uint64 expiresAt, bytes32 crashRandom, uint256 crashPointBps, uint256 totalMargin, uint256 reservedPayout, uint8 status))",
  "event RoundOpened(uint256 indexed roundId, address indexed opener, bytes32 crashRandom, uint64 openAt, uint64 lockAt, uint64 expiresAt)",
]);

const roundOpenedEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "RoundOpened",
});
// A round can be initialized at most one 60-second epoch early. A 512-block
// window provides ample Base Sepolia reorg/block-time margin without an
// ever-growing deployment-to-latest scan on every client poll.
const ROUND_OPENED_LOOKBACK_BLOCKS = 512n;

export type MarginCallCrashConfig = {
  address: Address;
  deploymentBlock: bigint;
};

export type CrashRoundStatus = 0 | 1 | 2 | 3 | 4;

export type CrashRound = {
  id: bigint;
  openAt: bigint;
  lockAt: bigint;
  expiresAt: bigint;
  crashRandom: Hex;
  crashPointBps: bigint;
  totalMargin: bigint;
  reservedPayout: bigint;
  status: CrashRoundStatus;
};

export type CrashRoundPhase =
  | "prelaunch"
  | "uninitialized"
  | "open"
  | "locked"
  | "reveal-requested"
  | "expired-eligible"
  | "finalized"
  | "expired";

const ROUND_STATUS = {
  uninitialized: 0,
  open: 1,
  revealRequested: 2,
  finalized: 3,
  expired: 4,
} as const satisfies Record<string, CrashRoundStatus>;

/** Public configuration only. Static env references allow Next.js client inlining. */
export function getMarginCallCrashConfig(): MarginCallCrashConfig | null {
  const address = process.env.NEXT_PUBLIC_MARGIN_CALL_CRASH_ADDRESS;
  const deploymentBlock = parseDeploymentBlock(
    process.env.NEXT_PUBLIC_MARGIN_CALL_CRASH_DEPLOYMENT_BLOCK
  );

  if (!address || !isAddress(address) || deploymentBlock === null) return null;
  return { address, deploymentBlock };
}

export function deriveRoundPhase(
  round: CrashRound,
  chainTimestamp: bigint
): CrashRoundPhase {
  if (round.status === ROUND_STATUS.uninitialized) {
    return chainTimestamp < round.openAt ? "prelaunch" : "uninitialized";
  }
  if (round.status === ROUND_STATUS.finalized) return "finalized";
  if (round.status === ROUND_STATUS.expired) return "expired";
  if (chainTimestamp >= round.expiresAt) return "expired-eligible";
  if (round.status === ROUND_STATUS.revealRequested) return "reveal-requested";
  return chainTimestamp < round.lockAt ? "open" : "locked";
}

export function getRoundCountdownSeconds(
  round: CrashRound,
  chainTimestamp: bigint
) {
  if (deriveRoundPhase(round, chainTimestamp) !== "open") return 0;
  return Number(round.lockAt - chainTimestamp);
}

export async function readCurrentCrashRound(config: MarginCallCrashConfig) {
  const block = await baseSepoliaPublicClient.getBlock({ blockTag: "latest" });
  const epochOrigin = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "epochOrigin",
    blockNumber: block.number,
  });
  if (block.timestamp < epochOrigin) {
    const [entryWindow, expiryDelay] = await Promise.all([
      readTimingValue(config.address, "entryWindow", block.number),
      readTimingValue(config.address, "expiryDelay", block.number),
    ]);
    const pendingRound: CrashRound = {
      id: 0n,
      openAt: epochOrigin,
      lockAt: epochOrigin + entryWindow,
      expiresAt: epochOrigin + entryWindow + expiryDelay,
      crashRandom:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      crashPointBps: 0n,
      totalMargin: 0n,
      reservedPayout: 0n,
      status: ROUND_STATUS.uninitialized,
    };

    return buildCurrentRoundState({
      block,
      currentRoundId: 0n,
      round: pendingRound,
      openingTransactionHash: null,
    });
  }

  const currentRoundId = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "currentRoundId",
    blockNumber: block.number,
  });
  const round = await baseSepoliaPublicClient.readContract({
    address: config.address,
    abi: marginCallCrashAbi,
    functionName: "getRound",
    args: [currentRoundId],
    blockNumber: block.number,
  });
  const normalizedRound: CrashRound = {
    ...round,
    status: normalizeRoundStatus(round.status),
  };
  const openingTransactionHash = await readOpeningTransactionHash(
    config,
    currentRoundId,
    normalizedRound.status,
    block.number
  );

  return buildCurrentRoundState({
    block,
    currentRoundId,
    round: normalizedRound,
    openingTransactionHash,
  });
}

function buildCurrentRoundState({
  block,
  currentRoundId,
  round,
  openingTransactionHash,
}: {
  block: { number: bigint; timestamp: bigint };
  currentRoundId: bigint;
  round: CrashRound;
  openingTransactionHash: Hash | null;
}) {
  return {
    blockNumber: block.number,
    chainTimestamp: block.timestamp,
    currentRoundId,
    round,
    phase: deriveRoundPhase(round, block.timestamp),
    countdownSeconds: getRoundCountdownSeconds(round, block.timestamp),
    openingTransactionHash,
    openingTransactionUrl: openingTransactionHash
      ? getBaseSepoliaTransactionUrl(openingTransactionHash)
      : null,
  };
}

function readTimingValue(
  address: Address,
  functionName: "entryWindow" | "expiryDelay",
  blockNumber: bigint
) {
  return baseSepoliaPublicClient.readContract({
    address,
    abi: marginCallCrashAbi,
    functionName,
    blockNumber,
  });
}

async function readOpeningTransactionHash(
  config: MarginCallCrashConfig,
  roundId: bigint,
  status: number,
  toBlock: bigint
): Promise<Hash | null> {
  if (status === ROUND_STATUS.uninitialized) return null;

  const logs = await baseSepoliaPublicClient.getLogs({
    address: config.address,
    event: roundOpenedEvent,
    args: { roundId },
    fromBlock: getOpeningEventFromBlock(config.deploymentBlock, toBlock),
    toBlock,
    strict: true,
  });
  if (logs.length !== 1 || !logs[0].transactionHash) {
    throw new Error(`Expected one RoundOpened event for round ${roundId}`);
  }
  return logs[0].transactionHash;
}

function getOpeningEventFromBlock(
  deploymentBlock: bigint,
  toBlock: bigint
): bigint {
  const recentFromBlock =
    toBlock > ROUND_OPENED_LOOKBACK_BLOCKS
      ? toBlock - ROUND_OPENED_LOOKBACK_BLOCKS
      : 0n;
  return deploymentBlock > recentFromBlock ? deploymentBlock : recentFromBlock;
}

function normalizeRoundStatus(status: number): CrashRoundStatus {
  if (
    status === ROUND_STATUS.uninitialized ||
    status === ROUND_STATUS.open ||
    status === ROUND_STATUS.revealRequested ||
    status === ROUND_STATUS.finalized ||
    status === ROUND_STATUS.expired
  ) {
    return status;
  }
  throw new Error(`Unsupported round status: ${status}`);
}

function parseDeploymentBlock(value: string | undefined): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}
