import {
  STAGE_LABEL,
  artworkPath,
  faceFromStage,
  resolvePositionStage,
  stockSymbol,
  type PositionRiskInput,
} from "@/lib/positions/artwork";

/**
 * Origin for every metadata image URL.
 *
 * Must stay identical to `MarginCall.METADATA_BASE_URI`'s origin: marketplaces
 * fetch `tokenURI` from that host, and a mismatch here would hand them image
 * URLs on a host the contract never pointed at.
 */
export const METADATA_ORIGIN = "https://margincall.fun";

/** Shown when the owner opened without a thesis. Describes the collection, not the position. */
export const FALLBACK_DESCRIPTION =
  "A Margin Call Position NFT: a transferable financed stock position on Base.";

export type NftAttribute = { trait_type: string; value: string };

export type NftMetadata = {
  name: string;
  description: string;
  image: string;
  attributes: NftAttribute[];
};

export type NftMetadataInput = PositionRiskInput & {
  tokenId: bigint;
  assetId: number;
  thesis: string;
};

/**
 * Standard ERC-721 metadata for a live Position NFT.
 *
 * Attributes stay deliberately coarse. Debt and NAV move every block, and
 * marketplaces cache aggressively, so putting them here would publish numbers
 * that are stale the moment they are read.
 *
 * Throws for an asset outside the curated launch set: a live token always has
 * one, so serving partial metadata would hide a broken deployment manifest.
 */
export function buildNftMetadata(input: NftMetadataInput): NftMetadata {
  const { tokenId, assetId, thesis } = input;

  const stage = resolvePositionStage(input);
  const imagePath = artworkPath(assetId, faceFromStage(stage));
  const symbol = stockSymbol(assetId);
  if (imagePath === null || symbol === null) {
    throw new Error(`No curated launch asset for assetId ${assetId}`);
  }

  return {
    name: `Margin Call Position #${tokenId.toString()}`,
    description: thesis.trim().length > 0 ? thesis : FALLBACK_DESCRIPTION,
    image: `${METADATA_ORIGIN}${imagePath}`,
    attributes: [
      { trait_type: "Stock", value: symbol },
      { trait_type: "Stage", value: STAGE_LABEL[stage] },
      // The route serves live tokens only; `tokenURI` reverts once burned.
      { trait_type: "Status", value: "Active" },
    ],
  };
}
