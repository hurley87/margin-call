import type { BaseWalletClient } from "@/lib/dynamic/wallet-client";
import { assertWalletOnBase } from "@/lib/dynamic/resolve-wallet-client";
import type { LaunchAsset } from "@/lib/protocol/deployment";
import { baseDeployment } from "@/lib/protocol/deployment";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import { openReadiness } from "@/lib/protocol/readiness";
import { loadOpenSnapshot, type OpenSnapshot } from "@/lib/protocol/reads";
import {
  approveUnlimited,
  openPosition,
  type ProtocolWalletClient,
} from "@/lib/protocol/writes";

export type OpenPositionFlowArgs = {
  walletClient: ProtocolWalletClient & BaseWalletClient;
  publicClient: BasePublicClient;
  address: `0x${string}`;
  asset: LaunchAsset;
  stockAmount: bigint;
  targetLeverage: number;
  /** Immutable NFT description; empty means none. Rejected onchain past `MAX_THESIS_BYTES`. */
  thesis: string;
  /** UI-reported chain id for readiness (EIP-1193 still re-checked). */
  chainId: number | null | undefined;
  onSubmitted?: (hash: `0x${string}`, label: string) => void;
};

export type OpenPositionFlowResult = {
  tokenId: bigint;
  hash: `0x${string}`;
};

async function loadAndGate(args: {
  publicClient: BasePublicClient;
  address: `0x${string}`;
  asset: LaunchAsset;
  stockAmount: bigint;
  targetLeverage: number;
  chainId: number | null | undefined;
}): Promise<OpenSnapshot> {
  const snapshot = await loadOpenSnapshot(args.publicClient, {
    address: args.address,
    asset: args.asset,
    leverage: args.targetLeverage,
    stockAmount: args.stockAmount,
  });

  const gate = openReadiness({
    chainId: args.chainId,
    stockAmount: args.stockAmount,
    stockBalance: snapshot.stockBalance,
    targetLeverage: args.targetLeverage,
    oracleState: snapshot.oracleState,
    availableCredit: snapshot.availableCredit,
    estimatedPrincipal: snapshot.estimatedPrincipal,
  });
  if (!gate.ok) {
    throw new Error(gate.reason);
  }

  return snapshot;
}

/**
 * Canonical create-position write sequence.
 * Fresh Base preflight → approve when needed → openPosition → receipt tokenId.
 * Does not talk to Convex and does not gate on other owned positions.
 */
export async function runOpenPositionFlow(
  args: OpenPositionFlowArgs
): Promise<OpenPositionFlowResult> {
  const {
    walletClient,
    publicClient,
    address,
    asset,
    stockAmount,
    targetLeverage,
    thesis,
    chainId,
    onSubmitted,
  } = args;

  await assertWalletOnBase(walletClient);

  let snapshot = await loadAndGate({
    publicClient,
    address,
    asset,
    stockAmount,
    targetLeverage,
    chainId,
  });

  if (snapshot.stockAllowance < stockAmount) {
    await approveUnlimited({
      walletClient,
      publicClient,
      token: asset.stock,
      spender: baseDeployment.marginCall,
      onSubmitted: (hash) => onSubmitted?.(hash, "Approve stock"),
    });

    snapshot = await loadAndGate({
      publicClient,
      address,
      asset,
      stockAmount,
      targetLeverage,
      chainId,
    });

    if (snapshot.stockAllowance < stockAmount) {
      throw new Error("Stock approval required before open.");
    }
  }

  const { receipt, tokenId } = await openPosition({
    walletClient,
    publicClient,
    assetId: BigInt(asset.assetId),
    stockAmount,
    targetLeverage: BigInt(targetLeverage),
    thesis,
    onSubmitted: (hash) => onSubmitted?.(hash, "Open position"),
  });

  return {
    tokenId,
    hash: receipt.transactionHash,
  };
}
