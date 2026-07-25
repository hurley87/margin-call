/**
 * Explorer URL builders per network (#249).
 */
import { getNetwork } from "./registry";
import type { NetworkSlug } from "./types";

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Transaction explorer URL for a network. */
export function txUrl(slug: NetworkSlug | string, txHash: string): string {
  const network = getNetwork(slug);
  return `${stripTrailingSlash(network.explorer.browserUrl)}/tx/${txHash}`;
}

/** Address explorer URL for a network. */
export function addressUrl(
  slug: NetworkSlug | string,
  address: string
): string {
  const network = getNetwork(slug);
  return `${stripTrailingSlash(network.explorer.browserUrl)}/address/${address}`;
}

/** Block explorer URL for a network. */
export function blockUrl(
  slug: NetworkSlug | string,
  blockNumber: number | bigint | string
): string {
  const network = getNetwork(slug);
  return `${stripTrailingSlash(network.explorer.browserUrl)}/block/${blockNumber}`;
}
