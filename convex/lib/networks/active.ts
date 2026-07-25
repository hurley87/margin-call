/**
 * Active network resolution (#249).
 *
 * Floor is Robinhood-only: every slug except robinhood-testnet fails closed
 * (including base-sepolia).
 */
import {
  assertNotForbiddenMainnet,
  getNetwork,
  getViemChain,
} from "./registry";
import { ROBINHOOD_TESTNET_SLUG } from "./robinhoodTestnet";
import type { NetworkConfig, NetworkSlug } from "./types";
import type { Chain } from "viem";

/** Env key for the active network slug. */
export const ACTIVE_NETWORK_ENV_KEY = "MARGIN_CALL_NETWORK" as const;
export const ACTIVE_NETWORK_PUBLIC_ENV_KEY =
  "NEXT_PUBLIC_MARGIN_CALL_NETWORK" as const;

/** Default (and only) active Floor network. */
export const DEFAULT_ACTIVE_NETWORK_SLUG: NetworkSlug = ROBINHOOD_TESTNET_SLUG;

/**
 * Resolve the active Floor network slug from env (or default).
 * Rejects every value except robinhood-testnet.
 */
export function resolveActiveNetworkSlug(
  env: NodeJS.ProcessEnv = process.env
): NetworkSlug {
  const raw =
    env[ACTIVE_NETWORK_ENV_KEY]?.trim() ||
    env[ACTIVE_NETWORK_PUBLIC_ENV_KEY]?.trim() ||
    DEFAULT_ACTIVE_NETWORK_SLUG;

  if (raw !== ROBINHOOD_TESTNET_SLUG) {
    throw new Error(
      `Unsupported ${ACTIVE_NETWORK_ENV_KEY}="${raw}". Floor supports only ${ROBINHOOD_TESTNET_SLUG} (Base Sepolia is not an active network).`
    );
  }
  return ROBINHOOD_TESTNET_SLUG;
}

/** Active Floor NetworkConfig. */
export function getActiveNetwork(
  env: NodeJS.ProcessEnv = process.env
): NetworkConfig {
  const slug = resolveActiveNetworkSlug(env);
  const network = getNetwork(slug);
  assertNotForbiddenMainnet(network.chainId);
  return network;
}

/** Viem Chain for the active Floor network. */
export function getActiveViemChain(
  env: NodeJS.ProcessEnv = process.env
): Chain {
  return getViemChain(resolveActiveNetworkSlug(env));
}

/**
 * True when `chainId` matches the active Floor payment network
 * (numeric id, numeric string, or CAIP-2).
 */
export function isActiveChainId(
  chainId: string | number,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const network = getActiveNetwork(env);
  if (typeof chainId === "number") return chainId === network.chainId;
  return chainId === network.caip2 || chainId === String(network.chainId);
}
