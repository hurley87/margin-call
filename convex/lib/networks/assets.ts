/**
 * Asset labelling helpers (#249).
 * Test Asset fallbacks must be visibly labelled; canonical assets must not.
 */
import { getNetwork } from "./registry";
import type { NetworkAsset, NetworkSlug } from "./types";

/** Look up an asset by id on a network. Throws if missing. */
export function getAsset(
  slug: NetworkSlug | string,
  assetId: string
): NetworkAsset {
  const network = getNetwork(slug);
  const asset = network.assets.find((entry) => entry.id === assetId);
  if (!asset) {
    throw new Error(`Unknown asset "${assetId}" on network "${network.slug}".`);
  }
  return asset;
}

/** User-visible label for an asset. */
export function assetLabel(
  slug: NetworkSlug | string,
  assetId: string
): string {
  return getAsset(slug, assetId).label;
}

/** True when the asset is a Margin Call Test Asset fallback. */
export function isTestAsset(
  slug: NetworkSlug | string,
  assetId: string
): boolean {
  return getAsset(slug, assetId).status === "test-asset-fallback";
}

/** All Test Asset fallbacks on a network. */
export function listTestAssets(
  slug: NetworkSlug | string
): readonly NetworkAsset[] {
  return getNetwork(slug).assets.filter(
    (entry) => entry.status === "test-asset-fallback"
  );
}
