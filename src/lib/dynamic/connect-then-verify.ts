import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { WalletAccountAlreadyVerifiedError } from "@dynamic-labs-sdk/client";

/**
 * Deep-link wallets cannot chain a second request off the same tap.
 * Dynamic throws DeeplinkConnectAndVerifyUnsupportedError for connect-and-verify
 * on those providers — connect first, then verify from a later gesture.
 *
 * @see https://www.dynamic.xyz/docs/javascript/reference/wallets/connect-and-verify-wallet
 */
export function shouldAutoVerifyAfterConnect(args: {
  isDeeplinkProvider: boolean;
}): boolean {
  return !args.isDeeplinkProvider;
}

/** Let the connect prompt close before sending the SIWE request. */
export function yieldForWalletPrompt(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

/**
 * Connect, then prove ownership once the wallet is done with pairing.
 * `connectAndVerifyWithWalletProvider` fires both prompts at once, so the
 * wallet often swallows SIWE until a later reconnect.
 */
export async function connectThenVerifyWallet(args: {
  walletProviderKey: string;
  isDeeplinkProvider: boolean;
  connect: (input: { walletProviderKey: string }) => Promise<WalletAccount>;
  verify: (input: { walletAccount: WalletAccount }) => Promise<WalletAccount>;
  isVerified: (walletAccount: WalletAccount) => boolean;
  waitForPrompt?: () => Promise<void>;
}): Promise<WalletAccount> {
  const walletAccount = await args.connect({
    walletProviderKey: args.walletProviderKey,
  });

  if (args.isVerified(walletAccount)) {
    return walletAccount;
  }

  if (
    !shouldAutoVerifyAfterConnect({
      isDeeplinkProvider: args.isDeeplinkProvider,
    })
  ) {
    return walletAccount;
  }

  await (args.waitForPrompt ?? yieldForWalletPrompt)();

  try {
    return await args.verify({ walletAccount });
  } catch (error) {
    if (error instanceof WalletAccountAlreadyVerifiedError) {
      return walletAccount;
    }
    throw error;
  }
}
