import { erc4626Abi, isAddress, type Address } from "viem";
import { baseSepoliaPublicClient } from "./base-sepolia";
import { deskDollarsAbi, getDeskDollarsTokenAddress } from "./desk-dollars";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  formatLeverageBps,
  getMarginCallCrashConfig,
  LEVERAGE_SCALE,
  marginCallCrashAbi,
  ONE_TUSD,
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
    name: "reservedPayoutByRound",
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

/** Mirrors BankrollVault.MAX_TICKET_RESERVATION. */
const MAX_TICKET_RESERVATION = 100n * ONE_TUSD;

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
  | "oldestBlockingRound";

/**
 * Utilization of vault capacity by reserved liabilities, in basis points of
 * gross assets. Advisory display only.
 */
export function computeUtilizationBps(
  reservedLiabilities: bigint,
  grossAssets: bigint
): bigint {
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
  oldestBlockingRound: bigint
): Promise<BlockingRoundDetail[]> {
  const rounds: BlockingRoundDetail[] = [];
  let cursor = oldestBlockingRound;
  // Bound the walk so a corrupted list cannot hang the LP Desk.
  for (let i = 0; i < 256 && cursor !== NO_BLOCKING_ROUND; i++) {
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

  // One batched round trip: the block plus every independent token/vault view.
  const [
    block,
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
    oldestBlockingRound,
    shareOperationsFrozen,
    maxWithdraw,
  ] = await Promise.all([
    baseSepoliaPublicClient.getBlock({ blockTag: "latest" }),
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
    readVaultIfDeployed("oldestBlockingRound"),
    baseSepoliaPublicClient
      .readContract({
        address: config.vaultAddress,
        abi: bankrollVaultAbi,
        functionName: "shareOperationsFrozen",
      })
      .catch(() => undefined),
    baseSepoliaPublicClient.readContract({
      address: config.vaultAddress,
      abi: bankrollVaultAbi,
      functionName: "maxWithdraw",
      args: [walletAddress],
    }),
  ]);

  // Dependent reads run concurrently: the current round's exposure and the
  // blocking-round walk only need results from the batch above.
  const readCurrentRoundExposure = async () => {
    if (!gameConfig)
      return { currentRoundId: undefined, roundExposure: undefined };
    const currentRoundId = await baseSepoliaPublicClient
      .readContract({
        address: gameConfig.address,
        abi: marginCallCrashAbi,
        functionName: "currentRoundId",
        blockNumber: block.number,
      })
      .catch(() => undefined);
    if (currentRoundId === undefined) {
      return { currentRoundId, roundExposure: undefined };
    }
    const roundExposure = await baseSepoliaPublicClient
      .readContract({
        address: config.vaultAddress,
        abi: bankrollVaultAbi,
        functionName: "reservedPayoutByRound",
        args: [currentRoundId],
      })
      .catch(() => undefined);
    return { currentRoundId, roundExposure };
  };
  const [{ currentRoundId, roundExposure }, blockingRounds] = await Promise.all(
    [
      readCurrentRoundExposure(),
      oldestBlockingRound !== undefined &&
      oldestBlockingRound !== NO_BLOCKING_ROUND
        ? readBlockingRounds(
            config,
            block.timestamp,
            oldestBlockingRound
          ).catch(() => [])
        : Promise.resolve<BlockingRoundDetail[]>([]),
    ]
  );

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
    shareOperationsFrozen: shareOperationsFrozen ?? false,
    maxWithdraw,
    currentRoundId,
    roundExposure,
    blockingRounds,
    utilizationBps,
    remainingPayoutCapacity,
    tierCapacity,
    chainTimestamp: block.timestamp,
  };
}

function minBigint(a: bigint, b: bigint, c: bigint): bigint {
  return a < b ? (a < c ? a : c) : b < c ? b : c;
}
