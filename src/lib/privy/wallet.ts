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
 * Returns the user's active EVM wallet address.
 *
 * Prefers a Privy embedded wallet (the email-onboarding path) and falls back
 * to any linked external EVM wallet (MetaMask, Coinbase Wallet, WalletConnect,
 * …) so `wallet` login users are provisioned too.
 */
export function getEvmWalletAddress(
  user: PrivyWalletUser | null | undefined
): `0x${string}` | null {
  if (!user) return null;

  const accounts: (PrivyWalletAccount | null | undefined)[] = [
    user.wallet,
    ...(user.linkedAccounts ?? []),
  ];

  // Prefer an embedded Privy wallet, then any other connected EVM wallet.
  const embedded = accounts.find(isEmbeddedEvmWallet);
  if (embedded) return embedded.address as `0x${string}`;

  const external = accounts.find(isEvmWallet);
  return (external?.address as `0x${string}` | undefined) ?? null;
}
