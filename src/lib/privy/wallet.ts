type PrivyWalletAccount = {
  type?: string | null;
  address?: string | null;
  chainType?: string | null;
  walletClientType?: string | null;
};

export type PrivyWalletUser = {
  wallet?: PrivyWalletAccount | null;
  linkedAccounts?: PrivyWalletAccount[] | null;
};

function isEvmWallet(account: PrivyWalletAccount | null | undefined) {
  return (
    typeof account?.address === "string" &&
    account.address.length > 0 &&
    account.chainType === "ethereum"
  );
}

function isEmbeddedEvmWallet(account: PrivyWalletAccount | null | undefined) {
  return (
    isEvmWallet(account) &&
    (account?.walletClientType === "privy" ||
      account?.walletClientType === "privy-v2")
  );
}

/**
 * Returns the user's Privy embedded EVM wallet address.
 *
 * Margin Call accepts only the embedded wallet created by its SMS-only Privy
 * login flow. Linked external wallets never make the auth boundary ready.
 */
export function getEvmWalletAddress(
  user: PrivyWalletUser | null | undefined
): `0x${string}` | null {
  if (!user) return null;

  const accounts: (PrivyWalletAccount | null | undefined)[] = [
    user.wallet,
    ...(user.linkedAccounts ?? []),
  ];

  const embedded = accounts.find(isEmbeddedEvmWallet);
  return (embedded?.address as `0x${string}` | undefined) ?? null;
}
