/**
 * Active network resolution (#249).
 *
 * Reads MARGIN_CALL_NETWORK (or NEXT_PUBLIC_MARGIN_CALL_NETWORK) and defaults
 * to robinhood-testnet. Unknown slug and forbidden mainnet IDs throw.
 */
import {
  assertNotForbiddenMainnet,
  getNetwork,
  getViemChain,
  isNetworkSlug,
} from "./registry";
import { ROBINHOOD_TESTNET_SLUG } from "./robinhood-testnet";
import type { NetworkConfig, NetworkSlug } from "./types";
import type { Chain } from "viem";

/** Env key for the active network slug. */
export const ACTIVE_NETWORK_ENV_KEY = "MARGIN_CALL_NETWORK" as const;
export const ACTIVE_NETWORK_PUBLIC_ENV_KEY =
  "NEXT_PUBLIC_MARGIN_CALL_NETWORK" as const;

/** Default active network when env is unset. */
export const DEFAULT_ACTIVE_NETWORK_SLUG: NetworkSlug = ROBINHOOD_TESTNET_SLUG;

/**
 * Resolve the active network slug from env (or default).
 * Does not construct clients — environment-light, but reads process.env.
 */
export function resolveActiveNetworkSlug(
  env: NodeJS.ProcessEnv = process.env
): NetworkSlug {
  const raw =
    env[ACTIVE_NETWORK_ENV_KEY]?.trim() ||
    env[ACTIVE_NETWORK_PUBLIC_ENV_KEY]?.trim() ||
    DEFAULT_ACTIVE_NETWORK_SLUG;

  if (!isNetworkSlug(raw)) {
    throw new Error(
      `Unsupported ${ACTIVE_NETWORK_ENV_KEY}="${raw}". Supported: robinhood-testnet, base-sepolia.`
    );
  }
  return raw;
}

/** Active NetworkConfig. */
export function getActiveNetwork(
  env: NodeJS.ProcessEnv = process.env
): NetworkConfig {
  const slug = resolveActiveNetworkSlug(env);
  const network = getNetwork(slug);
  assertNotForbiddenMainnet(network.chainId);
  return network;
}

/** Viem Chain for the active network. */
export function getActiveViemChain(
  env: NodeJS.ProcessEnv = process.env
): Chain {
  return getViemChain(resolveActiveNetworkSlug(env));
}
