const PORTRAIT_METADATA_VERSION = 1;
const BASE_PORTRAIT_PROMPT =
  "Create a square profile picture of a fictional 1987 Wall Street trader for a retro trading game. High-end retro game character portrait, pixel-art inspired, detailed face, head-and-shoulders portrait, serious expression, period-accurate suit and tie, dramatic trading floor or finance office background, green CRT terminal glow, warm amber lighting, dark moody palette, clean silhouette, no border, no text, no logos, no cryptocurrency, no modern devices.";
const IMAGE_VARIANTS = [
  "phone_trader",
  "risk_manager",
  "macro_analyst",
  "junk_bond_operator",
  "execution_desk",
  "mna_dealmaker",
  "commodities_broker",
  "equity_salesman",
] as const;

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildPortraitSeed(args: {
  ownerSubject: string;
  name: string;
  mandate: unknown;
  personality?: string;
}) {
  const hash = stableHash(
    JSON.stringify({
      ownerSubject: args.ownerSubject,
      name: args.name,
      mandate: args.mandate ?? {},
      personality: args.personality ?? "",
      version: PORTRAIT_METADATA_VERSION,
    })
  );
  const imageVariant = IMAGE_VARIANTS[hash % IMAGE_VARIANTS.length];
  const imageStyleSeed = `portrait-v${PORTRAIT_METADATA_VERSION}-${hash.toString(36)}`;

  return {
    imageStatus: "pending" as const,
    imagePrompt: `${BASE_PORTRAIT_PROMPT} Trader name: ${args.name}. Variant: ${imageVariant}. Style seed: ${imageStyleSeed}.`,
    imagePromptSource: {
      version: PORTRAIT_METADATA_VERSION,
      traderName: args.name,
      mandateSnapshot: args.mandate ?? {},
      personalitySnapshot: args.personality ?? null,
    },
    imageStyleSeed,
    imageVariant,
    imageRetryCount: 0,
    metadataVersion: PORTRAIT_METADATA_VERSION,
  };
}
