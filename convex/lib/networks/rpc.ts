/**
 * Fail-closed RPC URL resolution per network slug (#249).
 * No silent public-RPC fallback.
 */
import { getNetwork } from "./registry";
import type { NetworkSlug } from "./types";

/**
 * Require an explicit RPC URL for the given network.
 * Prefers the primary (server) env key, then the public Next.js key.
 */
export function requireRpcUrl(
  slug: NetworkSlug | string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const network = getNetwork(slug);
  const { primaryEnvKey, publicEnvKey } = network.rpc;

  const url =
    env[primaryEnvKey]?.trim() ||
    (publicEnvKey ? env[publicEnvKey]?.trim() : undefined);

  if (!url) {
    const keys = publicEnvKey
      ? `${primaryEnvKey} or ${publicEnvKey}`
      : primaryEnvKey;
    throw new Error(
      `${network.name} RPC URL is required. Set ${keys} to a ${network.name} JSON-RPC endpoint.`
    );
  }

  try {
    new URL(url);
  } catch {
    throw new Error(`Malformed ${network.name} RPC URL: ${url}`);
  }

  return url;
}
