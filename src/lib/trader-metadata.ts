import { type PublicPortraitTraits } from "./portrait-traits";
import { SURFACED_SLOTS, TRAIT_META } from "../../convex/lib/portraitSeed";

export type { PublicPortraitTraits };

export const TRADER_METADATA_ROUTE_PREFIX = "/api/trader";
export const TRADER_PUBLIC_ROUTE_PREFIX = "/traders";
export const TRADER_PLACEHOLDER_IMAGE_PATH = "/trader-placeholder.png";

export type PublicTraderMetadataModel = {
  traderId: string;
  name: string;
  status: string;
  portraitStatus: string;
  rarity: string;
  riskProfile: string;
  tokenId: number | null;
  profileImageUrl: string | null;
  traits: PublicPortraitTraits | null;
};

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function buildTraderMetadataUrl(
  baseUrl: string,
  traderId: string
): string {
  return `${normalizeBaseUrl(baseUrl)}${TRADER_METADATA_ROUTE_PREFIX}/${encodeURIComponent(traderId)}/metadata`;
}

export function buildTraderExternalUrl(
  baseUrl: string,
  traderId: string
): string {
  return `${normalizeBaseUrl(baseUrl)}${TRADER_PUBLIC_ROUTE_PREFIX}/${encodeURIComponent(traderId)}`;
}

export function buildTraderPlaceholderImageUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}${TRADER_PLACEHOLDER_IMAGE_PATH}`;
}

export function buildTraderNftMetadata(
  trader: PublicTraderMetadataModel,
  baseUrl: string
) {
  let image: string;
  if (trader.portraitStatus === "ready" && trader.profileImageUrl) {
    image = trader.profileImageUrl;
  } else {
    image = buildTraderPlaceholderImageUrl(baseUrl);
  }

  // OpenSea-standard attributes: the 5 surfaced trait slots only (each carrying
  // its designed odds + rarity tier), plus overall Rarity and Token ID. No
  // demographics (skin/gender/age are seed-only and never surfaced), no gameplay
  // state. These values + odds are PERMANENT once minted — see
  // docs/portrait-rarity-v4.md.
  type TraitAttribute = {
    trait_type: string;
    value: string | number;
    tier?: string;
    designed_odds?: string;
  };

  const attributes: TraitAttribute[] = [];

  if (trader.traits) {
    for (const slot of SURFACED_SLOTS) {
      const id = trader.traits[slot.key];
      const meta = TRAIT_META[slot.key][id];
      attributes.push({
        trait_type: slot.label,
        value: meta?.label ?? id,
        tier: meta?.tier ?? "Common",
        designed_odds: `${meta?.weight ?? 0}%`,
      });
    }
  }

  attributes.push({ trait_type: "Rarity", value: trader.rarity });

  if (trader.tokenId !== null) {
    attributes.push({ trait_type: "Token ID", value: trader.tokenId });
  }

  return {
    name: trader.name,
    description:
      "AI trader identity for Margin Call, a PvP trading game set on 1980s Wall Street.",
    image,
    external_url: buildTraderExternalUrl(baseUrl, trader.traderId),
    attributes,
  };
}
