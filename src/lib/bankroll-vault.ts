import { erc4626Abi, isAddress, type Address } from "viem";
import { baseSepoliaPublicClient } from "./base-sepolia";
import { deskDollarsAbi, getDeskDollarsTokenAddress } from "./desk-dollars";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  formatLeverageBps,
  getMarginCallCrashConfig,
  marginCallCrashAbi,
  ROUND_STATUS,
  type CrashRound,
} from "./margin-call-crash";

// Standard ERC-20/4626 entries come from viem; only the vault-specific
// accounting views need hand-written fragments.
export const bankrollVaultAbi = [
  ...erc4626Abi,
  {
    type: "function",
    name: "grossAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "assetsPerShare",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingObligations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "unrecognizedMargin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "reservedLiabilities",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "safetyBuffer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "freeLiquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "realizedGamePnl",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "int256" }],
  },
  {
    type: "function",
    name: "frozenRoundCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "oldestBlockingRound",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "shareOperationsFrozen",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "NO_BLOCKING_ROUND",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "roundExposure",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getBlockingRound",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      { name: "present", type: "bool" },
      { name: "expiresAt", type: "uint64" },
      { name: "revealFrozen", type: "bool" },
      { name: "nextRoundId", type: "uint256" },
    ],
  },
] as const;

/** Sentinel matching BankrollVault.NO_BLOCKING_ROUND. */
export const NO_BLOCKING_ROUND =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

const ONE_TUSD = 1_000_000n;
const MAX_TICKET_RESERVATION = 100n * ONE_TUSD;
const LEVERAGE_SCALE = 10_000n;

export type BankrollVaultConfig = {
  tokenAddress: Address;
  vaultAddress: Address;
};

export type BlockingRoundDetail = {
  roundId: bigint;
  expiresAt: bigint;
  revealFrozen: boolean;
  /** True when this round alone is past expiresAt and still unresolved. */
  expiryEligible: boolean;
};

export type TierCapacity = {
  leverageBps: bigint;
  label: string;
  /** Advisory maximum margin still admissible for one new ticket at this tier. */
  maxMargin: bigint;
};

/** Public addresses only. Static access lets Next.js inline these in client builds. */
export function getBankrollVaultConfig(): BankrollVaultConfig | null {
  const tokenAddress = getDeskDollarsTokenAddress();
  const vaultAddress = process.env.NEXT_PUBLIC_BANKROLL_VAULT_ADDRESS;
  if (!tokenAddress || !vaultAddress || !isAddress(vaultAddress)) {
    return null;
  }
  return { tokenAddress, vaultAddress };
}

type VaultViewName =
  | "grossAssets"
  | "totalAssets"
  | "totalSupply"
  | "assetsPerShare"
  | "pendingObligations"
  | "unrecognizedMargin"
  | "reservedLiabilities"
  | "safetyBuffer"
  | "freeLiquidity"
  | "realizedGamePnl"
  | "frozenRoundCount"
  | "oldestBlockingRound"
  | "NO_BLOCKING_ROUND";

/**
 * Utilization of vault capacity by reserved liabilities, in basis points of
 * gross assets. Advisory display only.
 */
export function computeUtilizationBps(
  reservedLiabilities: bigint | undefined,
  grossAssets: bigint | undefined
): bigint | undefined {
  if (reservedLiabilities === undefined || grossAssets === undefined) {
    return undefined;
  }
  if (grossAssets === 0n) return 0n;
  return (reservedLiabilities * LEVERAGE_SCALE) / grossAssets;
}

/**
 * Remaining payout headroom a new ticket may still reserve, capped by the
 * per-ticket, per-round, and free-liquidity constraints. Advisory only.
 */
export function computeRemainingPayoutCapacity(args: {
  grossAssets: bigint;
  freeLiquidity: bigint;
  roundExposure: bigint;
}): bigint {
  const { grossAssets, freeLiquidity, roundExposure } = args;
  const ticketCap =
    grossAssets / 100n < MAX_TICKET_RESERVATION
      ? grossAssets / 100n
      : MAX_TICKET_RESERVATION;
  const roundCap = (() => {
    const limit = (grossAssets * 25n) / 100n;
    return limit > roundExposure ? limit - roundExposure : 0n;
  })();
  // Net new exposure is payout − margin; the smallest margin (1 tUSD) is the
  // most payout-hungry case for a given free-liquidity budget.
  const freeCap = freeLiquidity + ONE_TUSD;
  return minBigint(ticketCap, roundCap, freeCap);
}

/** Advisory max margin at each Arcade Leverage tier from remaining payout capacity. */
export function computeTierPlayerCapacity(
  remainingPayoutCapacity: bigint
): TierCapacity[] {
  return ENTRY_LEVERAGE_TIERS_BPS.map((leverageBps) => ({
    leverageBps,
    label: formatLeverageBps(leverageBps),
    maxMargin: (remainingPayoutCapacity * LEVERAGE_SCALE) / leverageBps,
  }));
}

export async function readBlockingRounds(
  config: BankrollVaultConfig,
  chainTimestamp: bigint,
  noBlockingRound: bigint = NO_BLOCKING_ROUND
): Promise<BlockingRoundDetail[]> {
  const oldest = await baseSepoliaPublicClient.readContract({
    address: config.vaultAddress,
    abi: bankrollVaultAbi,
    functionName: "oldestBlockingRound",
  });
  if (oldest === noBlockingRound) return [];

  const rounds: BlockingRoundDetail[] = [];
  let cursor = oldest;
  // Bound the walk so a corrupted list cannot hang the LP Desk.
  for (let i = 0; i < 256 && cursor !== noBlockingRound; i++) {
    const [present, expiresAt, revealFrozen, nextRoundId] =
      await baseSepoliaPublicClient.readContract({
        address: config.vaultAddress,
        abi: bankrollVaultAbi,
        functionName: "getBlockingRound",
        args: [cursor],
      });
    if (!present) break;
    rounds.push({
      roundId: cursor,
      expiresAt: BigInt(expiresAt),
      revealFrozen,
      expiryEligible: chainTimestamp >= BigInt(expiresAt),
    });
    cursor = nextRoundId;
  }
  return rounds;
}

export async function readBankrollVaultState(
  config: BankrollVaultConfig,
  walletAddress: Address
) {
  const readVault = (functionName: VaultViewName) =>
    baseSepoliaPublicClient.readContract({
      address: config.vaultAddress,
      abi: bankrollVaultAbi,
      functionName,
    });
  // Newer freeze / risk views degrade when an older vault is still configured.
  const readVaultIfDeployed = (functionName: VaultViewName) =>
    readVault(functionName).catch(() => undefined);

  const gameConfig = getMarginCallCrashConfig();
  const block = await baseSepoliaPublicClient.getBlock({ blockTag: "latest" });

  const [
    tUsdBalance,
    shareBalance,
    allowance,
    grossAssets,
    totalAssets,
    totalSupply,
    assetsPerShare,
    pendingObligations,
    unrecognizedMargin,
    reservedLiabilities,
    safetyBuffer,
    freeLiquidity,
    realizedGamePnl,
    frozenRoundCount,
    oldestBlockingRound,
    noBlockingRound,
    maxWithdraw,
    currentRoundId,
  ] = await Promise.all([
    baseSepoliaPublicClient.readContract({
      address: config.tokenAddress,
      abi: deskDollarsAbi,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    baseSepoliaPublicClient.readContract({
      address: config.vaultAddress,
      abi: bankrollVaultAbi,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    baseSepoliaPublicClient.readContract({
      address: config.tokenAddress,
      abi: deskDollarsAbi,
      functionName: "allowance",
      args: [walletAddress, config.vaultAddress],
    }),
    readVault("grossAssets"),
    readVault("totalAssets"),
    readVault("totalSupply"),
    readVault("assetsPerShare"),
    readVault("pendingObligations"),
    readVault("unrecognizedMargin"),
    readVaultIfDeployed("reservedLiabilities"),
    readVaultIfDeployed("safetyBuffer"),
    readVaultIfDeployed("freeLiquidity"),
    readVaultIfDeployed("realizedGamePnl"),
    readVaultIfDeployed("frozenRoundCount"),
    readVaultIfDeployed("oldestBlockingRound"),
    readVaultIfDeployed("NO_BLOCKING_ROUND"),
    baseSepoliaPublicClient.readContract({
      address: config.vaultAddress,
      abi: bankrollVaultAbi,
      functionName: "maxWithdraw",
      args: [walletAddress],
    }),
    gameConfig
      ? baseSepoliaPublicClient
          .readContract({
            address: gameConfig.address,
            abi: marginCallCrashAbi,
            functionName: "currentRoundId",
            blockNumber: block.number,
          })
          .catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const shareOperationsFrozen = await baseSepoliaPublicClient
    .readContract({
      address: config.vaultAddress,
      abi: bankrollVaultAbi,
      functionName: "shareOperationsFrozen",
    })
    .catch(() => undefined);

  const sentinel = noBlockingRound ?? NO_BLOCKING_ROUND;
  const roundExposure =
    currentRoundId === undefined
      ? undefined
      : await baseSepoliaPublicClient
          .readContract({
            address: config.vaultAddress,
            abi: bankrollVaultAbi,
            functionName: "roundExposure",
            args: [currentRoundId],
          })
          .catch(() => undefined);

  const shouldLoadBlockers =
    shareOperationsFrozen === true ||
    (oldestBlockingRound !== undefined && oldestBlockingRound !== sentinel);
  const blockingRounds = shouldLoadBlockers
    ? await readBlockingRounds(config, block.timestamp, sentinel).catch(
        () => []
      )
    : [];

  const utilizationBps =
    reservedLiabilities !== undefined
      ? computeUtilizationBps(reservedLiabilities, grossAssets)
      : undefined;

  const remainingPayoutCapacity =
    freeLiquidity !== undefined && roundExposure !== undefined
      ? computeRemainingPayoutCapacity({
          grossAssets,
          freeLiquidity,
          roundExposure,
        })
      : undefined;

  const tierCapacity =
    remainingPayoutCapacity !== undefined
      ? computeTierPlayerCapacity(remainingPayoutCapacity)
      : undefined;

  const earliestExpiry =
    blockingRounds.length > 0
      ? blockingRounds.reduce(
          (min, round) => (round.expiresAt < min ? round.expiresAt : min),
          blockingRounds[0]!.expiresAt
        )
      : undefined;

  return {
    tUsdBalance,
    shareBalance,
    allowance,
    grossAssets,
    totalAssets,
    totalSupply,
    assetsPerShare,
    pendingObligations,
    unrecognizedMargin,
    reservedLiabilities,
    safetyBuffer,
    freeLiquidity,
    realizedGamePnl,
    frozenRoundCount,
    oldestBlockingRound,
    shareOperationsFrozen: shareOperationsFrozen ?? false,
    noBlockingRound: sentinel,
    maxWithdraw,
    currentRoundId,
    roundExposure,
    blockingRounds,
    earliestExpiry,
    utilizationBps,
    remainingPayoutCapacity,
    tierCapacity,
    chainTimestamp: block.timestamp,
  };
}

/** Loads a game round for LP finalize/expire actions. */
export async function readCrashRoundForLp(
  roundId: bigint
): Promise<CrashRound | null> {
  const gameConfig = getMarginCallCrashConfig();
  if (!gameConfig) return null;
  const round = await baseSepoliaPublicClient.readContract({
    address: gameConfig.address,
    abi: marginCallCrashAbi,
    functionName: "getRound",
    args: [roundId],
  });
  if (round.status === ROUND_STATUS.uninitialized) return null;
  return {
    ...round,
    status: round.status as CrashRound["status"],
  };
}

function minBigint(a: bigint, b: bigint, c: bigint): bigint {
  return a < b ? (a < c ? a : c) : b < c ? b : c;
}
