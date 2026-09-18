import {
  ORACLE_STATE,
  isFinancedLeverage,
  parseOracleState,
  type OracleState,
} from "@/lib/protocol/constants";
import {
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
};

export type OpenPosition = {
  status: "open";
  tokenId: bigint;
  assetId: number;
  stockAmount: bigint;
  principal: bigint;
  currentDebt: bigint;
  owner: `0x${string}`;
  executor: `0x${string}`;
  nav: bigint | null;
  liquidatable: boolean | null;
};

export type ClosedPosition = {
  status: "closed";
  tokenId: bigint;
};

export type PositionView = OpenPosition | ClosedPosition;

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
      client.readContract({
        address: baseDeployment.creditPool,
        abi: creditPoolAbi,
        functionName: "availableCredit",
      }),
      financed
        ? client.readContract({
            address: args.asset.oracleAdapter,
            abi: oracleAdapterAbi,
            functionName: "latestObservation",
          })
        : Promise.resolve(null),
    ]);

  if (!financed || observation == null) {
    return {
      stockBalance,
      stockAllowance,
      availableCredit,
      oracleState: null,
      estimatedPrincipal: 0n,
    };
  }

  const oracleState = parseOracleState(Number(observation.state));
  if (oracleState == null) {
    throw new Error(`Unexpected oracle state: ${String(observation.state)}`);
  }

  if (oracleState !== ORACLE_STATE.LIVE || args.stockAmount == null) {
    return {
      stockBalance,
      stockAllowance,
      availableCredit,
      oracleState,
      estimatedPrincipal: null,
    };
  }

  const contributionValue = await client.readContract({
    address: args.asset.oracleAdapter,
    abi: oracleAdapterAbi,
    functionName: "valueUsdc",
    args: [args.stockAmount, observation.price],
  });

  return {
    stockBalance,
    stockAllowance,
    availableCredit,
    oracleState,
    estimatedPrincipal: sizePrincipal(contributionValue, args.leverage),
  };
}

/**
 * Load an open Position NFT from Base.
 * `ownerOf` is required so a burned token is not treated as a zero-debt live position.
 * NAV/liquidatable stay optional (LIVE-only riskSnapshot).
 */
export async function loadPosition(
  client: BasePublicClient,
  tokenId: bigint
): Promise<OpenPosition> {
  const [pos, debt, owner] = await Promise.all([
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
  ]);

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
    nav,
    liquidatable,
  };
}
