const PORTRAIT_METADATA_VERSION = 2;
const BASE_PORTRAIT_PROMPT =
  "Create a square profile picture of one fictional 1987 Wall Street trader for a retro trading game. High-end retro game character portrait, pixel-art inspired, detailed face, head-and-shoulders composition, serious expression, period-accurate suit and tie, dramatic trading floor or finance office background, green CRT terminal glow, warm amber lighting, dark moody palette, clean silhouette, no border. The image must be a portrait only: no words, no captions, no nameplates, no labels, no job titles, no ticker symbols, no numbers, no letters, no logos, no watermarks, no UI text, and no typography anywhere in the image.";
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

const IMAGE_VARIANT_DESCRIPTIONS: Record<
  (typeof IMAGE_VARIANTS)[number],
  string
> = {
  phone_trader:
    "holding a corded trading desk phone near a wall of market screens",
  risk_manager: "studying a risk ledger beside a glowing CRT terminal",
  macro_analyst: "reviewing market charts and newspapers in a finance office",
  junk_bond_operator: "leaning over a bond desk with folders and a desk lamp",
  execution_desk:
    "standing at an execution desk with blurred traders in the background",
  mna_dealmaker: "posed in a deal room with paper files and brass desk details",
  commodities_broker:
    "near a commodities quote board rendered as abstract glowing blocks",
  equity_salesman:
    "beside a green CRT terminal with abstract market graphics only",
};

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
  const imagePrompt = `${BASE_PORTRAIT_PROMPT} Visual variation: ${IMAGE_VARIANT_DESCRIPTIONS[imageVariant]}. Internal style seed ${imageStyleSeed}; do not render the seed, trader name, role, or variation as text.`;

  return {
    imageStatus: "pending" as const,
    imagePrompt,
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
