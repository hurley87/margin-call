import { assertWalletOnBase } from "@/lib/dynamic/resolve-wallet-client";
import type { BaseWalletClient } from "@/lib/dynamic/wallet-client";
import {
  isPositionManager,
  isPositionOwner,
} from "@/lib/protocol/authorization";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import { closeReadiness, repayReadiness } from "@/lib/protocol/readiness";
import { loadPosition, type OpenPosition } from "@/lib/protocol/reads";
import {
  closePosition,
  repayAll,
  type ProtocolWalletClient,
} from "@/lib/protocol/writes";

type ManageFlowArgs = {
  walletClient: ProtocolWalletClient & BaseWalletClient;
  publicClient: BasePublicClient;
  wallet: `0x${string}`;
  tokenId: bigint;
  chainId: number | null | undefined;
  onSubmitted?: (hash: `0x${string}`, label: string) => void;
};

/** Manage writes need a live token — a burned one has no debt to repay and nothing to close. */
async function loadOpenPosition(
  publicClient: BasePublicClient,
  tokenId: bigint
): Promise<OpenPosition> {
  const view = await loadPosition(publicClient, tokenId);
  if (view.status !== "open") {
    throw new Error("No open position.");
  }
  return view;
}

export type RepayAllFlowResult = {
  position: OpenPosition;
  /** Absent when there was nothing left to repay. */
  hash?: `0x${string}`;
};

/**
 * Repay remaining debt from the connected wallet.
 * Fresh Base load gates owner/executor + outstanding debt, then repayAll
 * re-reads currentDebt and applies the bounded ceiling. Re-reads after confirm.
 * Does not talk to Convex — repayment does not change indexed lifecycle.
 */
export async function runRepayAllFlow(
  args: ManageFlowArgs
): Promise<RepayAllFlowResult> {
  const { walletClient, publicClient, wallet, tokenId, chainId, onSubmitted } =
    args;

  await assertWalletOnBase(walletClient);
  const live = await loadOpenPosition(publicClient, tokenId);
  const gate = repayReadiness({
    chainId,
    currentDebt: live.currentDebt,
    isManager: isPositionManager(wallet, live.owner, live.executor),
  });
  if (!gate.ok) {
    throw new Error(gate.reason);
  }

  const { receipt } = await repayAll({
    walletClient,
    publicClient,
    owner: wallet,
    tokenId,
    onSubmitted,
  });

  const position = await loadOpenPosition(publicClient, tokenId);
  return receipt ? { position, hash: receipt.transactionHash } : { position };
}

export type ClosePositionFlowResult = {
  tokenId: bigint;
  hash: `0x${string}`;
};

/**
 * Close a debt-free Position NFT.
 * Fresh Base load must report zero debt and current ownership before writing.
 * Caller confirms PositionClosed via closePosition and may sync Convex after.
 */
export async function runClosePositionFlow(
  args: ManageFlowArgs
): Promise<ClosePositionFlowResult> {
  const { walletClient, publicClient, wallet, tokenId, chainId, onSubmitted } =
    args;

  await assertWalletOnBase(walletClient);
  const live = await loadOpenPosition(publicClient, tokenId);
  const gate = closeReadiness({
    chainId,
    currentDebt: live.currentDebt,
    isOwner: isPositionOwner(wallet, live.owner),
  });
  if (!gate.ok) {
    throw new Error(gate.reason);
  }

  const closed = await closePosition({
    walletClient,
    publicClient,
    tokenId,
    onSubmitted: (hash) => onSubmitted?.(hash, "Close position"),
  });

  return {
    tokenId: closed.tokenId,
    hash: closed.receipt.transactionHash,
  };
}
