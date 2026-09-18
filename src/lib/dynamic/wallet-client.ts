import type { WalletAccount } from "@dynamic-labs-sdk/client";
import {
  type Account,
  type Transport,
  type WalletClient,
  createWalletClient,
  custom,
} from "viem";
import { base } from "viem/chains";
import { getEvmWalletAddress } from "@/lib/dynamic/wallet";

type Eip1193Provider = {
  request: (args: {
    method: string;
    params?: readonly unknown[];
  }) => Promise<unknown>;
};

function isEip1193Provider(provider: unknown): provider is Eip1193Provider {
  return (
    provider !== null &&
    typeof provider === "object" &&
    "request" in provider &&
    typeof (provider as Eip1193Provider).request === "function"
  );
}

export type BaseWalletClient = WalletClient<Transport, typeof base, Account>;

/**
 * Builds a Base (8453) viem `WalletClient` from a connected Dynamic EVM wallet
 * and its EIP-1193 provider. Returns null when there is no valid EVM account or
 * provider. Intended for browser/client callers; does not persist session or JWT
 * material. Callers resolve the live provider via Dynamic
 * (`getWalletProviderFromWalletAccount` + `getDefaultClient`).
 */
export function getBaseWalletClient(args: {
  accounts: readonly WalletAccount[];
  provider: unknown;
}): BaseWalletClient | null {
  const address = getEvmWalletAddress(args.accounts);
  if (!address || !isEip1193Provider(args.provider)) return null;

  return createWalletClient({
    account: address,
    chain: base,
    transport: custom(args.provider),
  });
}
