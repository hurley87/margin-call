import type { WalletAccount } from "@dynamic-labs-sdk/client";
import {
  isWalletAccountVerified,
  WalletAccountAlreadyVerifiedError,
} from "@dynamic-labs-sdk/client";

/** Let the connect prompt close before sending the SIWE request. */
export function yieldForWalletPrompt(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Connect, then prove ownership once the wallet is done with pairing.
 * `connectAndVerifyWithWalletProvider` fires both prompts at once, so the
 * wallet often swallows SIWE until a later reconnect.
 *
 * Deep-link wallets cannot chain a second request off the same tap — Dynamic
 * throws DeeplinkConnectAndVerifyUnsupportedError — so they stay unverified
 * until a later gesture.
 *
 * @see https://www.dynamic.xyz/docs/javascript/reference/wallets/connect-and-verify-wallet
 */
export async function connectThenVerifyWallet(args: {
  walletProviderKey: string;
  isDeeplinkProvider: boolean;
  connect: (input: { walletProviderKey: string }) => Promise<WalletAccount>;
  verify: (input: { walletAccount: WalletAccount }) => Promise<WalletAccount>;
}): Promise<WalletAccount> {
  const walletAccount = await args.connect({
    walletProviderKey: args.walletProviderKey,
  });

  if (isWalletAccountVerified({ walletAccount }) || args.isDeeplinkProvider) {
    return walletAccount;
  }

  await yieldForWalletPrompt();

  try {
    return await args.verify({ walletAccount });
  } catch (error) {
    if (error instanceof WalletAccountAlreadyVerifiedError) {
      return walletAccount;
    }
    throw error;
  }
}
