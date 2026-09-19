import {
  ORACLE_STATE,
  isFinancedLeverage,
  parseOracleState,
  type OracleState,
} from "@/lib/protocol/constants";
import { BaseError, ContractFunctionRevertedError } from "viem";
import {
  ERC721_NONEXISTENT_TOKEN,
  creditPoolAbi,
  erc20Abi,
  marginCallAbi,
  oracleAdapterAbi,
} from "@/lib/protocol/abi";
import type { LaunchAsset } from "@/lib/protocol/deployment";
import { baseDeployment } from "@/lib/protocol/deployment";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import { sizePrincipal } from "@/lib/protocol/repay";

export type OpenSnapshot = {
  stockBalance: bigint;
  stockAllowance: bigint;
  availableCredit: bigint;
  oracleState: OracleState | null;
  estimatedPrincipal: bigint | null;
  /** LIVE oracle value of the deposited stock, in USDC base units. */
  contributionValue: bigint | null;
};

/** One asset's latest oracle reading, with the raw state byte already narrowed. */
export type MarketObservation = {
  state: OracleState;
  price: bigint;
  updatedAt: bigint;
};

/**
 * Latest oracle reading for one launch rail.
 *
 * Wallet-free on purpose: pricing availability is public protocol state, and
 * the agent surface must answer it without an address to read balances for.
 */
export async function loadMarketObservation(
  client: BasePublicClient,
  asset: LaunchAsset
): Promise<MarketObservation> {
  const observation = await client.readContract({
    address: asset.oracleAdapter,
    abi: oracleAdapterAbi,
    functionName: "latestObservation",
  });

  const state = parseOracleState(Number(observation.state));
  if (state == null) {
    throw new Error(`Unexpected oracle state: ${String(observation.state)}`);
  }

  return { state, price: observation.price, updatedAt: observation.updatedAt };
}

/** USDC the CreditPool can still lend. Public state, no wallet required. */
export function loadAvailableCredit(client: BasePublicClient): Promise<bigint> {
  return client.readContract({
    address: baseDeployment.creditPool,
    abi: creditPoolAbi,
    functionName: "availableCredit",
  });
}

/**
 * Whether `openPosition` will accept a new mint for this asset right now.
 *
 * Distinct from launch-manifest support: a curated rail can still have
 * `openingEnabled == false`, and the coordinator reverts with
 * `AssetOpeningDisabled` rather than `UnknownAsset`.
 */
export async function loadAssetOpeningEnabled(
  client: BasePublicClient,
  assetId: number
): Promise<boolean> {
  const config = await client.readContract({
    address: baseDeployment.marginCall,
    abi: marginCallAbi,
    functionName: "assetConfig",
    args: [BigInt(assetId)],
  });
  return config.openingEnabled;
}

/** Oracle value of a stock amount in USDC base units, at an observed price. */
export function loadStockValueUsdc(
  client: BasePublicClient,
  args: { asset: LaunchAsset; stockAmount: bigint; price: bigint }
): Promise<bigint> {
  return client.readContract({
    address: args.asset.oracleAdapter,
    abi: oracleAdapterAbi,
    functionName: "valueUsdc",
    args: [args.stockAmount, args.price],
  });
}

export type OpenPosition = {
  status: "open";
  tokenId: bigint;
  assetId: number;
  stockAmount: bigint;
  principal: bigint;
  currentDebt: bigint;
  owner: `0x${string}`;
  executor: `0x${string}`;
  /** Immutable opening note, empty when none was supplied. */
  thesis: string;
  nav: bigint | null;
  liquidatable: boolean | null;
};

/**
 * Terminal on Base: the token no longer exists. `closePosition` and `liquidate`
 * both burn the NFT, so this says nothing about *why* it ended — the terminal
 * reason comes from indexed lifecycle events, never from an `ownerOf` failure.
 */
export type BurnedPosition = {
  status: "burned";
  tokenId: bigint;
};

export type PositionView = OpenPosition | BurnedPosition;

/**
 * Atomic open-form snapshot. Replaces piecemeal balance/allowance/oracle setters.
 */
export async function loadOpenSnapshot(
  client: BasePublicClient,
  args: {
    address: `0x${string}`;
    asset: LaunchAsset;
    leverage: number;
    stockAmount: bigint | null;
  }
): Promise<OpenSnapshot> {
  const financed =
    isFinancedLeverage(args.leverage) &&
    args.stockAmount != null &&
    args.stockAmount > 0n;

  const [stockBalance, stockAllowance, availableCredit, observation] =
    await Promise.all([
      client.readContract({
        address: args.asset.stock,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [args.address],
      }),
      client.readContract({
        address: args.asset.stock,
        abi: erc20Abi,
        functionName: "allowance",
        args: [args.address, baseDeployment.marginCall],
      }),
      loadAvailableCredit(client),
      financed
        ? loadMarketObservation(client, args.asset)
        : Promise.resolve(null),
    ]);

  if (!financed || observation == null) {
    return {
      stockBalance,
      stockAllowance,
      availableCredit,
      oracleState: null,
      contributionValue: null,
      estimatedPrincipal: 0n,
    };
  }

  const oracleState = observation.state;

  if (oracleState !== ORACLE_STATE.LIVE || args.stockAmount == null) {
    return {
      stockBalance,
      stockAllowance,
      availableCredit,
      oracleState,
      contributionValue: null,
      estimatedPrincipal: null,
    };
  }

  const contributionValue = await loadStockValueUsdc(client, {
    asset: args.asset,
    stockAmount: args.stockAmount,
    price: observation.price,
  });

  return {
    stockBalance,
    stockAllowance,
    availableCredit,
    oracleState,
    contributionValue,
    estimatedPrincipal: sizePrincipal(contributionValue, args.leverage),
  };
}

/** A nonexistent token is burned. Any other revert is a read failure, not a lifecycle fact. */
function isNonexistentTokenError(error: unknown): boolean {
  if (error instanceof BaseError) {
    const reverted = error.walk(
      (cause) => cause instanceof ContractFunctionRevertedError
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.data?.errorName === ERC721_NONEXISTENT_TOKEN;
    }
  }
  return (
    error instanceof Error && error.message.includes(ERC721_NONEXISTENT_TOKEN)
  );
}

/**
 * Load a Position NFT from Base.
 * `ownerOf` is required so a burned token reads as burned rather than a zero-debt
 * live position. Burned is terminal but reasonless — do not infer close vs
 * liquidation here. NAV/liquidatable stay optional (LIVE-only riskSnapshot).
 */
export async function loadPosition(
  client: BasePublicClient,
  tokenId: bigint
): Promise<PositionView> {
  const core = await Promise.all([
    client.readContract({
      address: baseDeployment.marginCall,
      abi: marginCallAbi,
      functionName: "positions",
      args: [tokenId],
    }),
    client.readContract({
      address: baseDeployment.marginCall,
      abi: marginCallAbi,
      functionName: "currentDebt",
      args: [tokenId],
    }),
    client.readContract({
      address: baseDeployment.marginCall,
      abi: marginCallAbi,
      functionName: "ownerOf",
      args: [tokenId],
    }),
    client.readContract({
      address: baseDeployment.marginCall,
      abi: marginCallAbi,
      functionName: "thesisOf",
      args: [tokenId],
    }),
  ]).catch((error: unknown) => {
    if (isNonexistentTokenError(error)) return null;
    throw error;
  });

  if (core == null) {
    return { status: "burned", tokenId };
  }

  const [pos, debt, owner, thesis] = core;

  let nav: bigint | null = null;
  let liquidatable: boolean | null = null;
  try {
    const snap = await client.readContract({
      address: baseDeployment.marginCall,
      abi: marginCallAbi,
      functionName: "riskSnapshot",
      args: [tokenId],
    });
    nav = snap.nav;
    liquidatable = snap.liquidatable;
  } catch {
    // LIVE-only — omit health when HELD/INVALID rather than showing stale NAV.
  }

  return {
    status: "open",
    tokenId,
    assetId: Number(pos.assetId),
    stockAmount: pos.stockAmount,
    principal: pos.principal,
    currentDebt: debt,
    owner,
    executor: pos.executor,
    thesis,
    nav,
    liquidatable,
  };
}
