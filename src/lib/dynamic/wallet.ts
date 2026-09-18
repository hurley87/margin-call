import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import { ADDRESS_RE } from "@margin-call/shared/address";

/**
 * Returns the first EVM wallet address from Dynamic wallet accounts.
 * External injected wallets are the auth boundary for this foundation.
 */
export function getEvmWalletAddress(
  accounts: readonly WalletAccount[]
): `0x${string}` | null {
  const account = accounts.find(isEvmWalletAccount);
  if (!account || !ADDRESS_RE.test(account.address)) return null;
  return account.address as `0x${string}`;
}
