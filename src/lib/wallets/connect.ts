import {
  ThresholdSignatureScheme,
  type WalletMetadata,
} from "@dynamic-labs-wallet/node";
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import type { TransactionSerializable } from "viem";
import type { DynamicServerWalletEnv } from "@/lib/wallets/config";
import type { DynamicServerWalletApi } from "@/lib/wallets/dynamic-server";
import type { DynamicWalletMetadata } from "@/lib/wallets/metadata-store";

/**
 * Authenticate Dynamic's Node server-wallet SDK.
 *
 * Isolated here so the public agent surface never imports Dynamic, and so the
 * native MPC addon is loaded only by this CLI — not by Next.js.
 */
export async function connectDynamicServerWallet(
  env: DynamicServerWalletEnv
): Promise<DynamicServerWalletApi> {
  const sdk = new DynamicEvmWalletClient({
    environmentId: env.environmentId,
  });
  await sdk.authenticateApiToken(env.apiToken);

  return {
    async createWalletAccount({ password, backUpToDynamic }) {
      const { walletMetadata } = await sdk.createWalletAccount({
        thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
        password,
        backUpToDynamic,
      });
      return {
        walletMetadata: walletMetadata as DynamicWalletMetadata,
      };
    },
    async signTransaction({ walletMetadata, password, transaction }) {
      return sdk.signTransaction({
        walletMetadata: walletMetadata as WalletMetadata,
        password,
        transaction: transaction as TransactionSerializable,
      });
    },
  };
}
