import {
  ThresholdSignatureScheme,
  type WalletMetadata,
} from "@dynamic-labs-wallet/node";
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import type { TransactionSerializable } from "viem";
import type { DynamicServerWalletEnv } from "@/lib/wallets/config";
import type { DynamicServerWalletApi } from "@/lib/wallets/dynamic-server";
import type { DynamicWalletMetadata } from "@/lib/wallets/metadata-store";
import { redactSecrets } from "@/lib/wallets/redact";

function failClosed(
  message: string,
  error: unknown,
  secrets: readonly (string | undefined)[]
): never {
  const detail = redactSecrets(
    error instanceof Error ? error.message : String(error),
    secrets
  );
  throw new Error(detail ? `${message} ${detail}` : message);
}

/**
 * Authenticate Dynamic's Node server-wallet SDK.
 *
 * Isolated here so the public agent surface never imports Dynamic, and so the
 * native MPC addon is loaded only by this CLI — not by Next.js.
 */
export async function connectDynamicServerWallet(
  env: DynamicServerWalletEnv
): Promise<DynamicServerWalletApi> {
  const secrets = [env.apiToken, env.walletPassword];
  const sdk = new DynamicEvmWalletClient({
    environmentId: env.environmentId,
    // Local/reference demo: do not depend on Nitro-compatible MPC infrastructure.
    enableMPCAccelerator: false,
  });
  try {
    await sdk.authenticateApiToken(env.apiToken);
  } catch (error) {
    failClosed(
      "Dynamic authentication failed. Confirm DYNAMIC_API_TOKEN and DYNAMIC_ENVIRONMENT_ID.",
      error,
      secrets
    );
  }

  return {
    async createWalletAccount({ password, backUpToDynamic }) {
      try {
        const { walletMetadata } = await sdk.createWalletAccount({
          thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
          password,
          backUpToDynamic,
        });
        return {
          walletMetadata: walletMetadata as DynamicWalletMetadata,
        };
      } catch (error) {
        failClosed(
          "Dynamic could not create a server wallet. Confirm DYNAMIC_API_TOKEN and DYNAMIC_WALLET_PASSWORD.",
          error,
          secrets
        );
      }
    },
    async signTransaction({ walletMetadata, password, transaction }) {
      try {
        return await sdk.signTransaction({
          walletMetadata: walletMetadata as WalletMetadata,
          password,
          transaction: transaction as TransactionSerializable,
        });
      } catch (error) {
        failClosed(
          "Dynamic could not recover signing capability from persisted metadata and the backup password. Confirm DYNAMIC_API_TOKEN, DYNAMIC_WALLET_PASSWORD, and .dynamic-agent-wallet.json.",
          error,
          secrets
        );
      }
    },
  };
}
