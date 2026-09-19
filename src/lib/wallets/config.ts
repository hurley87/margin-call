import { getBaseRpcUrl } from "@/lib/protocol/public-client";

export const DEFAULT_WALLET_STORE_PATH = ".dynamic-agent-wallet.json";

export type DynamicServerWalletEnv = {
  environmentId: string;
  apiToken: string;
  walletPassword: string;
  storePath: string;
  rpcUrl: string;
};

function required(env: NodeJS.Dict<string>, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(
      `${key} is required for the Dynamic server-wallet demo. It is not a private key.`
    );
  }
  return value;
}

/**
 * Credentials for Dynamic's server-wallet flow. No raw private key is used.
 */
export function readDynamicServerWalletEnv(
  env: NodeJS.Dict<string>
): DynamicServerWalletEnv {
  const environmentId =
    env.DYNAMIC_ENVIRONMENT_ID?.trim() ||
    env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID?.trim() ||
    "";
  if (!environmentId) {
    throw new Error(
      "DYNAMIC_ENVIRONMENT_ID or NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is required for the Dynamic server-wallet demo."
    );
  }

  const storePath =
    env.DYNAMIC_AGENT_WALLET_STORE?.trim() || DEFAULT_WALLET_STORE_PATH;
  const rpcUrl = env.BASE_RPC_URL?.trim() || getBaseRpcUrl();

  return {
    environmentId,
    apiToken: required(env, "DYNAMIC_API_TOKEN"),
    walletPassword: required(env, "DYNAMIC_WALLET_PASSWORD"),
    storePath,
    rpcUrl,
  };
}
