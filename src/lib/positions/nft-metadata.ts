import {
  STAGE_LABEL,
  artworkPath,
  faceFromStage,
  resolvePositionStage,
  stockSymbol,
  type ArtworkFace,
  type PositionRiskInput,
  type PositionStage,
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
 * Artwork a marketplace should cache for a stage.
 *
 * Only place that departs from `faceFromStage`: an unpriced position would
 * otherwise publish the ticker logo, and marketplaces cache that image for far
 * longer than the weekend or halt that produced it. The Stage trait still
 * reports `Pricing unavailable`, so the metadata stays honest either way.
 */
function marketplaceFace(stage: PositionStage): ArtworkFace {
  return stage === "pricing_unavailable" ? "healthy" : faceFromStage(stage);
}

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
  const imagePath = artworkPath(assetId, marketplaceFace(stage));
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

function isAttribute(value: unknown): value is NftAttribute {
  return (
    typeof value === "object" &&
    value !== null &&
    "trait_type" in value &&
    "value" in value &&
    typeof value.trait_type === "string" &&
    typeof value.value === "string"
  );
}

/**
 * Accepts the JSON `GET /api/nft/[tokenId]` actually serves.
 *
 * Image URLs must stay on the contract origin so Explore can unwrap them
 * to the same committed files marketplaces cache.
 */
export function parseNftMetadata(value: unknown): NftMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  if (
    !("name" in value) ||
    !("description" in value) ||
    !("image" in value) ||
    !("attributes" in value)
  ) {
    return null;
  }
  const { name, description, image, attributes } = value;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof description !== "string") return null;
  if (typeof image !== "string" || !image.startsWith(METADATA_ORIGIN)) {
    return null;
  }
  if (!Array.isArray(attributes) || !attributes.every(isAttribute)) {
    return null;
  }
  return { name, description, image, attributes };
}

/** Live health from the Stage trait, or null when the payload cannot name one. */
export function stageFromMetadata(metadata: NftMetadata): PositionStage | null {
  const label = metadata.attributes.find(
    (attribute) => attribute.trait_type === "Stage"
  )?.value;
  switch (label) {
    case STAGE_LABEL.healthy:
      return "healthy";
    case STAGE_LABEL.warning:
      return "warning";
    case STAGE_LABEL.danger:
      return "danger";
    case STAGE_LABEL.pricing_unavailable:
      return "pricing_unavailable";
    default:
      return null;
  }
}
