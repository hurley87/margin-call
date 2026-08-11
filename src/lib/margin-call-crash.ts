import {
  getAbiItem,
  isAddress,
  parseAbi,
  zeroHash,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { baseSepoliaPublicClient } from "./base-sepolia";
import {
  getBaseSepoliaContractCodeUrl,
  getBaseSepoliaTransactionUrl,
} from "./base-sepolia-explorer";

export const marginCallCrashAbi = parseAbi([
  "function epochOrigin() view returns (uint64)",
  "function currentRoundId() view returns (uint256)",
  "function roundTimes(uint256 roundId) view returns (uint64 openAt, uint64 lockAt, uint64 expiresAt)",
  "function getRound(uint256 roundId) view returns ((uint256 id, uint64 openAt, uint64 lockAt, uint64 expiresAt, bytes32 crashRandom, uint256 crashPointBps, uint256 totalMargin, uint256 reservedPayout, uint8 status))",
  "event RoundOpened(uint256 indexed roundId, address indexed opener, bytes32 crashRandom, uint64 openAt, uint64 lockAt, uint64 expiresAt)",
  "event RevealRequested(uint256 indexed roundId, bytes32 crashRandom)",
  "event RoundFinalized(uint256 indexed roundId, bytes32 crashRandom, uint256 crashPointBps)",
  "event RoundExpired(uint256 indexed roundId)",
]);

const roundOpenedEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "RoundOpened",
});
const revealRequestedEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "RevealRequested",
});
const roundFinalizedEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "RoundFinalized",
});
const roundExpiredEvent = getAbiItem({
  abi: marginCallCrashAbi,
  name: "RoundExpired",
});

// A round can be initialized at most one 60-second epoch early. A 512-block
// window provides ample Base Sepolia reorg/block-time margin without an
// ever-growing deployment-to-latest scan on every client poll.
const ROUND_EVENT_LOOKBACK_BLOCKS = 512n;
const ONE_X_BPS = 10_000n;
const MAX_CRASH_POINT_BPS = 100_000n;

/** Base Sepolia Inco Lightning singleton from @inco/lightning@1.0.2. */
export const BASE_SEPOLIA_INCO_LIGHTNING_ADDRESS =
  "0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624" as const satisfies Address;

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

export type CrashRoundLifecycleUrls = {
  openingTransactionUrl: string | null;
  revealTransactionUrl: string | null;
  finalizeTransactionUrl: string | null;
  expireTransactionUrl: string | null;
  gameContractUrl: string;
  incoContractUrl: string;
};

const ROUND_STATUS = {
  uninitialized: 0,
  open: 1,
  revealRequested: 2,
  finalized: 3,
  expired: 4,
} as const satisfies Record<string, CrashRoundStatus>;

// epochOrigin is immutable on-chain and lifecycle transactions of a round can
// never change once observed, so neither needs to be re-fetched on every poll.
const epochOriginCache = new Map<Address, bigint>();
let lifecycleTransactionCache: {
  address: Address;
  roundId: bigint;
  opening: Hash | null;
  reveal: Hash | null;
  finalize: Hash | null;
  expire: Hash | null;
} | null = null;

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

export function isRoundInitialized(round: CrashRound) {
  return round.status !== ROUND_STATUS.uninitialized;
}

/** True only after onchain finalization stores a verified Crash Point. */
export function isCrashPointPublished(round: CrashRound) {
  return round.status === ROUND_STATUS.finalized;
}

/**
 * Formats stored Crash Point basis points for display.
 * Values below 1.00x render as 1.00x without changing settlement math.
 */
export function formatCrashPointBps(crashPointBps: bigint): string {
  const bounded =
    crashPointBps < ONE_X_BPS
      ? ONE_X_BPS
      : crashPointBps > MAX_CRASH_POINT_BPS
        ? MAX_CRASH_POINT_BPS
        : crashPointBps;
  const hundredths = bounded / 100n;
  const whole = hundredths / 100n;
  const fraction = hundredths % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(2, "0")}x`;
}

export async function readCurrentCrashRound(config: MarginCallCrashConfig) {
  const block = await baseSepoliaPublicClient.getBlock({ blockTag: "latest" });
  const epochOrigin = await readEpochOrigin(config.address, block.number);
  if (block.timestamp < epochOrigin) {
    const [openAt, lockAt, expiresAt] =
      await baseSepoliaPublicClient.readContract({
        address: config.address,
        abi: marginCallCrashAbi,
        functionName: "roundTimes",
        args: [0n],
        blockNumber: block.number,
      });
    const pendingRound: CrashRound = {
      id: 0n,
      openAt,
      lockAt,
      expiresAt,
      crashRandom: zeroHash,
      crashPointBps: 0n,
      totalMargin: 0n,
      reservedPayout: 0n,
      status: ROUND_STATUS.uninitialized,
    };

    return {
      blockNumber: block.number,
      chainTimestamp: block.timestamp,
      currentRoundId: 0n,
      round: pendingRound,
      ...emptyLifecycleUrls(config.address),
    };
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
  const lifecycleUrls = await readLifecycleUrls(
    config,
    currentRoundId,
    normalizedRound,
    block.number
  );

  return {
    blockNumber: block.number,
    chainTimestamp: block.timestamp,
    currentRoundId,
    round: normalizedRound,
    ...lifecycleUrls,
  };
}

async function readEpochOrigin(
  address: Address,
  blockNumber: bigint
): Promise<bigint> {
  const cached = epochOriginCache.get(address);
  if (cached !== undefined) return cached;

  const epochOrigin = await baseSepoliaPublicClient.readContract({
    address,
    abi: marginCallCrashAbi,
    functionName: "epochOrigin",
    blockNumber,
  });
  epochOriginCache.set(address, epochOrigin);
  return epochOrigin;
}

async function readLifecycleUrls(
  config: MarginCallCrashConfig,
  roundId: bigint,
  round: CrashRound,
  toBlock: bigint
): Promise<CrashRoundLifecycleUrls> {
  const verificationUrls = {
    gameContractUrl: getBaseSepoliaContractCodeUrl(config.address),
    incoContractUrl: getBaseSepoliaContractCodeUrl(
      BASE_SEPOLIA_INCO_LIGHTNING_ADDRESS
    ),
  };

  if (!isRoundInitialized(round)) {
    return {
      openingTransactionUrl: null,
      revealTransactionUrl: null,
      finalizeTransactionUrl: null,
      expireTransactionUrl: null,
      ...verificationUrls,
    };
  }

  const cached = getCachedLifecycle(config.address, roundId);
  const fromBlock = getEventFromBlock(config.deploymentBlock, toBlock);

  const openingHash =
    cached?.opening ??
    (await readExactRoundEventHash({
      config,
      roundId,
      event: roundOpenedEvent,
      eventName: "RoundOpened",
      fromBlock,
      toBlock,
      required: true,
    }));

  const shouldLookupReveal =
    round.status === ROUND_STATUS.revealRequested ||
    round.status === ROUND_STATUS.finalized ||
    round.status === ROUND_STATUS.expired;
  const revealRequired =
    round.status === ROUND_STATUS.revealRequested ||
    round.status === ROUND_STATUS.finalized;
  const revealHash = !shouldLookupReveal
    ? null
    : (cached?.reveal ??
      (await readExactRoundEventHash({
        config,
        roundId,
        event: revealRequestedEvent,
        eventName: "RevealRequested",
        fromBlock,
        toBlock,
        required: revealRequired,
      })));

  const finalizeHash =
    cached?.finalize ??
    (round.status === ROUND_STATUS.finalized
      ? await readExactRoundEventHash({
          config,
          roundId,
          event: roundFinalizedEvent,
          eventName: "RoundFinalized",
          fromBlock,
          toBlock,
          required: true,
        })
      : null);

  const expireHash =
    cached?.expire ??
    (round.status === ROUND_STATUS.expired
      ? await readExactRoundEventHash({
          config,
          roundId,
          event: roundExpiredEvent,
          eventName: "RoundExpired",
          fromBlock,
          toBlock,
          required: true,
        })
      : null);

  lifecycleTransactionCache = {
    address: config.address,
    roundId,
    opening: openingHash,
    reveal: revealHash,
    finalize: finalizeHash,
    expire: expireHash,
  };

  return {
    openingTransactionUrl: openingHash
      ? getBaseSepoliaTransactionUrl(openingHash)
      : null,
    revealTransactionUrl: revealHash
      ? getBaseSepoliaTransactionUrl(revealHash)
      : null,
    finalizeTransactionUrl: finalizeHash
      ? getBaseSepoliaTransactionUrl(finalizeHash)
      : null,
    expireTransactionUrl: expireHash
      ? getBaseSepoliaTransactionUrl(expireHash)
      : null,
    ...verificationUrls,
  };
}

async function readExactRoundEventHash({
  config,
  roundId,
  event,
  eventName,
  fromBlock,
  toBlock,
  required,
}: {
  config: MarginCallCrashConfig;
  roundId: bigint;
  event:
    | typeof roundOpenedEvent
    | typeof revealRequestedEvent
    | typeof roundFinalizedEvent
    | typeof roundExpiredEvent;
  eventName: string;
  fromBlock: bigint;
  toBlock: bigint;
  required: boolean;
}): Promise<Hash | null> {
  const logs = await baseSepoliaPublicClient.getLogs({
    address: config.address,
    event,
    args: { roundId },
    fromBlock,
    toBlock,
    strict: true,
  });

  if (logs.length === 0) {
    if (required) {
      throw new Error(`Expected one ${eventName} event for round ${roundId}`);
    }
    return null;
  }
  if (logs.length !== 1 || !logs[0].transactionHash) {
    throw new Error(
      `Expected one ${eventName} event for round ${roundId}, found ${logs.length}`
    );
  }
  return logs[0].transactionHash;
}

function getCachedLifecycle(address: Address, roundId: bigint) {
  if (
    lifecycleTransactionCache?.address === address &&
    lifecycleTransactionCache.roundId === roundId
  ) {
    return lifecycleTransactionCache;
  }
  return null;
}

function getEventFromBlock(deploymentBlock: bigint, toBlock: bigint): bigint {
  const recentFromBlock =
    toBlock > ROUND_EVENT_LOOKBACK_BLOCKS
      ? toBlock - ROUND_EVENT_LOOKBACK_BLOCKS
      : 0n;
  return deploymentBlock > recentFromBlock ? deploymentBlock : recentFromBlock;
}

function emptyLifecycleUrls(address: Address): CrashRoundLifecycleUrls {
  return {
    openingTransactionUrl: null,
    revealTransactionUrl: null,
    finalizeTransactionUrl: null,
    expireTransactionUrl: null,
    gameContractUrl: getBaseSepoliaContractCodeUrl(address),
    incoContractUrl: getBaseSepoliaContractCodeUrl(
      BASE_SEPOLIA_INCO_LIGHTNING_ADDRESS
    ),
  };
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
