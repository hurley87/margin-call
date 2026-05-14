import {
  humanizePortraitTraitValue,
  type PublicPortraitTraits,
} from "./portrait-traits";

export type { PublicPortraitTraits };

export const TRADER_METADATA_ROUTE_PREFIX = "/api/trader";
export const TRADER_PUBLIC_ROUTE_PREFIX = "/traders";
export const TRADER_PLACEHOLDER_IMAGE_PATH = "/trader-placeholder.png";

export type PublicTraderMetadataModel = {
  traderId: string;
  name: string;
  status: string;
  portraitStatus: string;
  archetype: string;
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

  const baseAttributes: Array<{ trait_type: string; value: string | number }> =
    [
      { trait_type: "Status", value: trader.status },
      { trait_type: "Portrait Status", value: trader.portraitStatus },
      { trait_type: "Archetype", value: trader.archetype },
      { trait_type: "Risk Profile", value: trader.riskProfile },
    ];

  if (trader.tokenId !== null) {
    baseAttributes.push({ trait_type: "Token ID", value: trader.tokenId });
  }

  const traitAttributes: Array<{ trait_type: string; value: string | number }> =
    trader.traits
      ? [
          {
            trait_type: "Gender Presentation",
            value: humanizePortraitTraitValue(trader.traits.genderPresentation),
          },
          {
            trait_type: "Apparent Age",
            value: humanizePortraitTraitValue(trader.traits.apparentAge),
          },
          {
            trait_type: "Appearance",
            value: humanizePortraitTraitValue(trader.traits.appearanceVariant),
          },
          {
            trait_type: "Hairstyle",
            value: humanizePortraitTraitValue(trader.traits.hairstyle),
          },
          {
            trait_type: "Clothing",
            value: humanizePortraitTraitValue(trader.traits.clothingStyle),
          },
          {
            trait_type: "Accessory",
            value: humanizePortraitTraitValue(trader.traits.accessory),
          },
          {
            trait_type: "Expression",
            value: humanizePortraitTraitValue(trader.traits.expression),
          },
          {
            trait_type: "Lighting",
            value: humanizePortraitTraitValue(trader.traits.lighting),
          },
          {
            trait_type: "Camera",
            value: humanizePortraitTraitValue(trader.traits.cameraAngle),
          },
          {
            trait_type: "Market Moment",
            value: humanizePortraitTraitValue(trader.traits.marketMoment),
          },
        ]
      : [];

  return {
    name: trader.name,
    description:
      "AI trader identity for Margin Call, a PvP trading game set on 1980s Wall Street.",
    image,
    external_url: buildTraderExternalUrl(baseUrl, trader.traderId),
    attributes: [...baseAttributes, ...traitAttributes],
  };
}
