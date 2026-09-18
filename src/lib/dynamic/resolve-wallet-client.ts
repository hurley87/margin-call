import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { getDefaultClient } from "@dynamic-labs-sdk/client";
import { getWalletProviderFromWalletAccount } from "@dynamic-labs-sdk/client/core";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import {
  type BaseWalletClient,
  getBaseWalletClient,
} from "@/lib/dynamic/wallet-client";
import { BASE_CHAIN_ID } from "@/lib/protocol/constants";

const BASE_CHAIN_HEX = "0x2105";

/**
 * Resolve a Base-pinned viem WalletClient from the connected Dynamic EVM account.
 * Returns null when there is no EVM account or EIP-1193 provider.
 */
export function resolveBaseWalletClient(
  accounts: readonly WalletAccount[]
): BaseWalletClient | null {
  const account = accounts.find(isEvmWalletAccount);
  if (!account) return null;

  try {
    const client = getDefaultClient();
    const provider = getWalletProviderFromWalletAccount(
      { walletAccount: account },
      client
    );
    return getBaseWalletClient({ accounts, provider });
  } catch {
    return null;
  }
}

/**
 * Live EIP-1193 chain check. Rejects writes when the wallet is not on Base.
 */
export async function assertWalletOnBase(
  walletClient: BaseWalletClient
): Promise<void> {
  const chainId = await walletClient.request({ method: "eth_chainId" });
  if (
    chainId !== BASE_CHAIN_HEX &&
    Number.parseInt(String(chainId), 16) !== BASE_CHAIN_ID
  ) {
    throw new Error(
      `Wrong network. Expected Base (${BASE_CHAIN_ID}), got ${String(chainId)}.`
    );
  }
}

/** Dynamic networkId for Base mainnet (matches switchActiveNetwork examples). */
export const BASE_NETWORK_ID = String(BASE_CHAIN_ID);

export function parseNetworkIdToChainId(
  networkId: string | null | undefined
): number | null {
  if (networkId == null || networkId === "") return null;
  const trimmed = networkId.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const eip155 = /^eip155:(\d+)$/i.exec(trimmed);
  if (eip155?.[1]) return Number(eip155[1]);
  const hex = /^0x[0-9a-f]+$/i.test(trimmed)
    ? Number.parseInt(trimmed, 16)
    : Number.NaN;
  return Number.isFinite(hex) ? hex : null;
}
