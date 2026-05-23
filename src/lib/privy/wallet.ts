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

function isEmbeddedEvmWallet(account: PrivyWalletAccount | null | undefined) {
  return (
    typeof account?.address === "string" &&
    account.address.length > 0 &&
    account.chainType === "ethereum" &&
    (account.walletClientType === "privy" ||
      account.walletClientType === "privy-v2")
  );
}

/**
 * Returns the desk manager's canonical Privy embedded EVM wallet address.
 * External wallets are intentionally ignored for fresh-start email onboarding.
 */
export function getEmbeddedEvmWalletAddress(
  user: PrivyWalletUser | null | undefined
): `0x${string}` | null {
  if (!user) return null;
  const primaryWallet = user.wallet;
  if (isEmbeddedEvmWallet(primaryWallet)) {
    return (primaryWallet?.address as `0x${string}`) ?? null;
  }

  const linkedWallet = user.linkedAccounts?.find(isEmbeddedEvmWallet);
  return (linkedWallet?.address as `0x${string}` | undefined) ?? null;
}
