import type { BaseWalletClient } from "@/lib/dynamic/wallet-client";
import { assertWalletOnBase } from "@/lib/dynamic/resolve-wallet-client";
import type { LaunchAsset } from "@/lib/protocol/deployment";
import { baseDeployment } from "@/lib/protocol/deployment";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import { openReadiness } from "@/lib/protocol/readiness";
import { loadOpenSnapshot } from "@/lib/protocol/reads";
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
  /** UI-reported chain id for readiness (EIP-1193 still re-checked). */
  chainId: number | null | undefined;
  onSubmitted?: (hash: `0x${string}`, label: string) => void;
};

export type OpenPositionFlowResult = {
  tokenId: bigint;
  hash: `0x${string}`;
};

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
    chainId,
    onSubmitted,
  } = args;

  await assertWalletOnBase(walletClient);

  let snapshot = await loadOpenSnapshot(publicClient, {
    address,
    asset,
    leverage: targetLeverage,
    stockAmount,
  });

  let gate = openReadiness({
    chainId,
    stockAmount,
    stockBalance: snapshot.stockBalance,
    targetLeverage,
    oracleState: snapshot.oracleState,
    availableCredit: snapshot.availableCredit,
    estimatedPrincipal: snapshot.estimatedPrincipal,
  });
  if (!gate.ok) {
    throw new Error(gate.reason);
  }

  if (snapshot.stockAllowance < stockAmount) {
    await approveUnlimited({
      walletClient,
      publicClient,
      token: asset.stock,
      spender: baseDeployment.marginCall,
      onSubmitted: (hash) => onSubmitted?.(hash, "Approve stock"),
    });

    snapshot = await loadOpenSnapshot(publicClient, {
      address,
      asset,
      leverage: targetLeverage,
      stockAmount,
    });

    gate = openReadiness({
      chainId,
      stockAmount,
      stockBalance: snapshot.stockBalance,
      targetLeverage,
      oracleState: snapshot.oracleState,
      availableCredit: snapshot.availableCredit,
      estimatedPrincipal: snapshot.estimatedPrincipal,
    });
    if (!gate.ok) {
      throw new Error(gate.reason);
    }
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
    onSubmitted: (hash) => onSubmitted?.(hash, "Open position"),
  });

  return {
    tokenId,
    hash: receipt.transactionHash,
  };
}
