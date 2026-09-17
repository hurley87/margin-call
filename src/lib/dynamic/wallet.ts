import {
  addNetwork,
  NetworkNotAddedError,
  switchActiveNetwork,
  type WalletAccount,
} from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import { createWalletClientForWalletAccount } from "@dynamic-labs-sdk/evm/viem";

/** Base mainnet chain id used for user-approved transactions. */
export const BASE_NETWORK_ID = "8453";

export type WalletAccountLike = {
  address?: string | null;
  chain?: string | null;
};

/**
 * Returns the first EVM wallet address from Dynamic wallet accounts.
 * External injected wallets are the auth boundary for this foundation.
 */
export function getEvmWalletAddress(
  accounts: readonly WalletAccountLike[] | null | undefined
): `0x${string}` | null {
  if (!accounts) return null;

  const account = accounts.find(
    (candidate) =>
      candidate.chain === "EVM" &&
      typeof candidate.address === "string" &&
      candidate.address.startsWith("0x") &&
      candidate.address.length > 2
  );

  return (account?.address as `0x${string}` | undefined) ?? null;
}

/** Short display form for an EVM address. */
export function truncateAddress(address: `0x${string}`): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Switches the wallet to Base (8453) and returns a viem WalletClient for
 * user-approved transactions. Does not send a transaction.
 */
export async function createBaseWalletClient(walletAccount: WalletAccount) {
  if (!isEvmWalletAccount(walletAccount)) {
    throw new Error("Expected an EVM wallet account");
  }

  try {
    await switchActiveNetwork({
      walletAccount,
      networkId: BASE_NETWORK_ID,
    });
  } catch (error) {
    if (error instanceof NetworkNotAddedError) {
      await addNetwork({
        walletAccount,
        networkData: error.networkData,
      });
      await switchActiveNetwork({
        walletAccount,
        networkId: BASE_NETWORK_ID,
      });
    } else {
      throw error;
    }
  }

  return createWalletClientForWalletAccount({ walletAccount });
}
