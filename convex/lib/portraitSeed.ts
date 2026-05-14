export const PORTRAIT_METADATA_VERSION = 3;

type GenderPresentation = "feminine" | "masculine";
type GenderPresentationSource =
  | "inferred-feminine"
  | "inferred-masculine"
  | "hashed";

export type PublicPortraitTraits = {
  archetype: string;
  scene: string;
  prop: string;
  marketMoment: string;
  expression: string;
  lighting: string;
  cameraAngle: string;
  genderPresentation: string;
  apparentAge: string;
  appearanceVariant: string;
  hairstyle: string;
  clothingStyle: string;
  accessory: string;
};

const PUBLIC_TRAIT_KEYS = [
  "archetype",
  "scene",
  "prop",
  "marketMoment",
  "expression",
  "lighting",
  "cameraAngle",
  "genderPresentation",
  "apparentAge",
  "appearanceVariant",
  "hairstyle",
  "clothingStyle",
  "accessory",
] as const satisfies readonly (keyof PublicPortraitTraits)[];

export const APPARENT_AGES = [
  { id: "late_20s", prompt: "late 20s" },
  { id: "mid_30s", prompt: "mid 30s" },
  { id: "mid_40s", prompt: "mid 40s" },
  { id: "late_50s", prompt: "late 50s" },
] as const;

type ApparentAgeId = (typeof APPARENT_AGES)[number]["id"];

export const ARCHETYPES = [
  {
    id: "mna_rainmaker",
    description:
      "late-night hostile takeover war room, binders, fax paper, brass desk lamp, calm calculating presence",
    scene: "private deal-room office at midnight, walnut paneling",
    prop: "open binder of deal docs, brass desk lamp",
    marketMoment: "mid-deal closing crunch",
    preferredAgeBuckets: ["mid_30s", "mid_40s"],
  },
  {
    id: "junk_bond_operator",
    description:
      "high-yield bond desk strewn with prospectuses, ash in the air, leaning forward over the desk",
    scene: "high-yield bond desk, paper-stacked horizon",
    prop: "thick stapled prospectus, half-empty coffee mug",
    marketMoment: "leveraged-buyout euphoria",
    preferredAgeBuckets: ["mid_30s", "mid_40s"],
  },
  {
    id: "risk_floor_captain",
    description:
      "risk supervision pod overlooking a floor of traders, posture upright and watchful",
    scene: "risk pod overlooking a busy trading floor",
    prop: "clipboard with printed risk sheet",
    marketMoment: "mid-session volatility spike",
    preferredAgeBuckets: ["mid_40s", "late_50s"],
  },
  {
    id: "crash_day_survivor",
    description:
      "chaotic trading floor during a crash, papers in motion, red and green terminal glow, intense expression",
    scene: "chaotic trading floor mid-crash, papers tumbling",
    prop: "crumpled order tickets in fist",
    marketMoment: "black-monday-style crash session",
    preferredAgeBuckets: ["mid_30s", "mid_40s", "late_50s"],
  },
  {
    id: "commodities_pit_veteran",
    description:
      "noisy commodities pit, light trading jacket, paper order slips, crowded floor of arms and hand signals",
    scene: "open-outcry commodities pit, jackets and hand signals",
    prop: "bundle of paper order slips",
    marketMoment: "heating crude / grains squeeze",
    preferredAgeBuckets: ["mid_40s", "late_50s"],
  },
  {
    id: "execution_desk_closer",
    description:
      "execution desk, order tickets, multiple corded phones in the background, aggressive focused posture",
    scene: "execution desk, banks of corded phones along the wall behind",
    prop: "order ticket pad mid-write",
    marketMoment: "block-trade execution rush",
    preferredAgeBuckets: ["late_20s", "mid_30s", "mid_40s"],
  },
  {
    id: "macro_crisis_analyst",
    description:
      "macro research nook with global newspapers, charts, and a small globe, contemplative",
    scene: "macro research nook, oak desk, world newspapers",
    prop: "folded Financial Times across the desk",
    marketMoment: "sovereign-debt crisis briefing",
    preferredAgeBuckets: ["mid_30s", "mid_40s", "late_50s"],
  },
  {
    id: "boiler_room_salesman",
    description:
      "cramped boiler-room sales floor, pitching into a corded phone resting on shoulder, bullpen of identical desks behind",
    scene: "cramped boiler-room bullpen of desks",
    prop: "corded phone resting on shoulder",
    marketMoment: "retail penny-stock pump",
    preferredAgeBuckets: ["late_20s", "mid_30s"],
  },
  {
    id: "arbitrage_specialist",
    description:
      "quiet arbitrage cubicle with two CRTs running abstract glowing market shapes, ruler and pencil notes (text unreadable), focused stare",
    scene: "quiet arb cubicle, two CRTs side by side",
    prop: "mechanical pencil and ruler",
    marketMoment: "merger-spread compression",
    preferredAgeBuckets: ["late_20s", "mid_30s", "mid_40s"],
  },
  {
    id: "rookie_quant",
    description:
      "cramped back-office analytics room, oversized 1980s suit, thick glasses, stacked CRT monitors, abstract unreadable notes",
    scene: "back-office analytics room, stacked CRTs",
    prop: "basic four-function calculator",
    marketMoment: "first big intraday rally",
    preferredAgeBuckets: ["late_20s"],
  },
  {
    id: "old_school_partner",
    description:
      "corner partner office, walnut paneling, antique globe, leather chair, posture relaxed and powerful",
    scene: "corner partner office, brass-and-walnut detail",
    prop: "unlit cigar held casually",
    marketMoment: "quiet partner-track afternoon",
    preferredAgeBuckets: ["mid_40s", "late_50s"],
  },
  {
    id: "margin_call_escapee",
    description:
      "dark office after a catastrophic trade, loosened tie, red warning glow, scattered papers, exhausted expression",
    scene: "dark office post-blowup, single overhead lamp, red glow",
    prop: "scattered crumpled paper, tie pulled loose",
    marketMoment: "post-margin-call wreckage",
    preferredAgeBuckets: ["mid_30s", "mid_40s", "late_50s"],
  },
] as const;

export const EXPRESSIONS = [
  { id: "calm_calculating", prompt: "calm calculating expression" },
  { id: "sharp_focused", prompt: "sharp focused gaze" },
  { id: "tense_alert", prompt: "tense alert posture" },
  { id: "worn_exhausted", prompt: "worn exhausted look" },
  { id: "confident_smirk", prompt: "confident smirk" },
  { id: "predatory_grin", prompt: "predatory grin" },
  { id: "bewildered_overwhelmed", prompt: "bewildered overwhelmed look" },
  { id: "cold_detached", prompt: "cold detached stare" },
] as const;

export const LIGHTING = [
  { id: "amber_desk_lamp", prompt: "warm amber desk-lamp pool" },
  {
    id: "green_crt_glow",
    prompt: "green CRT terminal glow on one side of face",
  },
  {
    id: "overhead_fluorescent",
    prompt: "flat overhead fluorescent office light",
  },
  { id: "red_warning_glow", prompt: "low red warning-light glow" },
  { id: "window_dawn", prompt: "cool blue pre-dawn window light" },
  {
    id: "high_contrast_noir",
    prompt: "hard cinematic noir key light, deep shadows",
  },
] as const;

export const CAMERA_ANGLES = [
  {
    id: "head_and_shoulders_centered",
    prompt: "head-and-shoulders, centered, eyes to camera",
  },
  { id: "three_quarter_left", prompt: "three-quarter angle from camera left" },
  {
    id: "three_quarter_right",
    prompt: "three-quarter angle from camera right",
  },
  { id: "slight_low_angle", prompt: "slight low angle, heroic framing" },
  { id: "slight_high_angle", prompt: "slight high angle, watchful framing" },
] as const;

export const GENDER_PRESENTATIONS = [
  { id: "feminine", prompt: "woman, feminine presentation" },
  { id: "masculine", prompt: "man, masculine presentation" },
] as const;

const GENDER_PRESENTATION_BY_ID: Record<
  GenderPresentation,
  (typeof GENDER_PRESENTATIONS)[number]
> = {
  feminine: GENDER_PRESENTATIONS[0],
  masculine: GENDER_PRESENTATIONS[1],
};

export const APPEARANCE_VARIANTS = [
  {
    id: "pale_fair_freckled_light_blond",
    prompt: "pale fair skin, freckled, light-blond hair",
  },
  {
    id: "fair_auburn_subtle_waves",
    prompt: "fair skin, auburn hair with subtle waves",
  },
  {
    id: "fair_dark_brown_sharp_brows",
    prompt: "fair skin, dark-brown hair, sharp brows",
  },
  {
    id: "olive_dark_wavy",
    prompt: "olive-toned skin, dark wavy hair",
  },
  {
    id: "warm_tan_jet_black_straight",
    prompt: "warm-tan skin, jet-black straight hair",
  },
  {
    id: "medium_brown_dark_coiled",
    prompt: "medium-brown skin, dark coiled hair",
  },
  {
    id: "deep_brown_short_tightly_coiled",
    prompt: "deep-brown skin, short tightly-coiled hair",
  },
  {
    id: "deep_brown_longer_twisted_coiled",
    prompt: "deep-brown skin, longer twisted-coiled hair",
  },
  {
    id: "light_tan_almond_sleek_black",
    prompt: "light-tan skin, almond eyes, sleek black hair",
  },
  {
    id: "medium_tan_almond_pulled_back",
    prompt: "medium-tan skin, almond eyes, dark hair pulled back",
  },
  {
    id: "ruddy_fair_salt_and_pepper",
    prompt: "ruddy fair skin, salt-and-pepper hair",
  },
  {
    id: "deep_tan_dark_silver_streaks",
    prompt: "deep-tan skin, dark hair with a few silver streaks",
  },
] as const;

export const HAIRSTYLES = [
  { id: "short_business_cut", prompt: "short business cut" },
  { id: "slicked_back", prompt: "slicked-back hair" },
  { id: "feathered_layered", prompt: "feathered layered 80s hair" },
  { id: "power_perm", prompt: "power perm" },
  { id: "tight_chignon", prompt: "tight low chignon" },
  { id: "voluminous_blowout", prompt: "voluminous 80s blowout" },
  {
    id: "pulled_back_low_pony",
    prompt: "hair pulled back in a low ponytail",
  },
  { id: "side_part_classic", prompt: "classic side part" },
  { id: "cropped_natural_coil", prompt: "cropped natural coils" },
  { id: "buzz_cut", prompt: "buzz cut" },
] as const;

export const CLOTHING_STYLES = [
  {
    id: "pinstripe_double_breasted",
    prompt: "pinstripe double-breasted suit, broad shoulders",
  },
  {
    id: "charcoal_three_piece",
    prompt: "charcoal three-piece suit, vest visible",
  },
  { id: "navy_power_suit", prompt: "navy power suit, structured shoulders" },
  {
    id: "tan_summer_suit",
    prompt: "tan summer-weight suit, sleeves slightly pushed",
  },
  {
    id: "shirt_sleeves_braces",
    prompt: "white dress shirt, leather braces, tie loosened",
  },
  { id: "burgundy_blazer_silk", prompt: "burgundy blazer over a silk shell" },
  {
    id: "grey_skirt_suit",
    prompt: "grey 80s skirt suit with sharp lapels",
  },
  {
    id: "black_dress_blazer",
    prompt: "black sheath dress under a long-line blazer",
  },
  {
    id: "commodities_trading_jacket",
    prompt: "brightly colored open-outcry trading jacket",
  },
  {
    id: "rumpled_oxford_no_tie",
    prompt: "rumpled oxford shirt, no tie, top button open",
  },
] as const;

export const ACCESSORIES = [
  { id: "tortoiseshell_glasses", prompt: "tortoiseshell glasses" },
  { id: "aviator_glasses", prompt: "aviator-frame glasses" },
  { id: "gold_signet_ring", prompt: "gold signet ring on pinky" },
  { id: "chunky_gold_watch", prompt: "chunky gold wristwatch" },
  { id: "pearl_studs", prompt: "small pearl stud earrings" },
  { id: "silk_pocket_square", prompt: "paisley silk pocket square" },
  { id: "bold_red_lip", prompt: "bold red lipstick" },
  { id: "gold_chain_thin", prompt: "thin gold chain visible at collar" },
  { id: "silk_scarf_neck", prompt: "silk scarf knotted at the neck" },
  { id: "no_accessory", prompt: "no notable accessory" },
] as const;

const FEMININE_NAMES = new Set([
  "hayley",
  "hailey",
  "haylee",
  "sarah",
  "sara",
  "emily",
  "emma",
  "jessica",
  "amanda",
  "olivia",
  "michelle",
  "rachel",
  "laura",
  "jennifer",
  "amy",
  "stephanie",
  "nicole",
  "elizabeth",
  "megan",
  "ashley",
  "brittany",
  "heather",
  "christina",
  "kimberly",
  "rebecca",
  "kelly",
  "tiffany",
  "danielle",
  "melissa",
  "lauren",
  "katherine",
  "kate",
  "katie",
  "catherine",
  "caroline",
  "claire",
  "sophie",
  "sophia",
  "ava",
  "isabella",
  "mia",
  "abigail",
  "grace",
  "ella",
  "chloe",
  "lily",
  "zoe",
  "hannah",
  "natalie",
  "victoria",
  "julia",
  "anna",
  "maria",
  "diane",
  "linda",
  "barbara",
  "susan",
  "karen",
  "nancy",
  "betty",
]);

const MASCULINE_NAMES = new Set([
  "david",
  "michael",
  "mike",
  "marcus",
  "james",
  "jim",
  "robert",
  "rob",
  "anthony",
  "tony",
  "thomas",
  "tom",
  "john",
  "daniel",
  "dan",
  "matthew",
  "matt",
  "christopher",
  "chris",
  "andrew",
  "andy",
  "joshua",
  "josh",
  "ryan",
  "brandon",
  "jason",
  "justin",
  "william",
  "will",
  "liam",
  "noah",
  "ethan",
  "mason",
  "logan",
  "lucas",
  "jackson",
  "henry",
  "sebastian",
  "jacob",
  "jack",
  "aiden",
  "owen",
  "benjamin",
  "ben",
  "samuel",
  "joseph",
  "joe",
  "kevin",
  "brian",
  "steven",
  "steve",
  "timothy",
  "tim",
  "richard",
  "rick",
  "george",
  "frank",
  "peter",
  "paul",
  "mark",
  "scott",
  "gary",
  "gregory",
  "edward",
  "ed",
  "charles",
  "charlie",
  "donald",
  "ronald",
  "kenneth",
  "ken",
]);

const EXPLICIT_AMBIGUOUS = new Set([
  "jordan",
  "taylor",
  "morgan",
  "casey",
  "alex",
  "sam",
  "pat",
  "jamie",
  "riley",
  "avery",
  "cameron",
  "skyler",
  "quinn",
  "dakota",
  "reese",
  "rowan",
  "blake",
  "drew",
  "kai",
  "sage",
]);

export function getPortraitPromptVersion(source: unknown): number {
  if (
    typeof source === "object" &&
    source !== null &&
    "version" in source &&
    typeof (source as { version: unknown }).version === "number"
  ) {
    return (source as { version: number }).version;
  }
  return 0;
}

export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function subHash(baseHash: number, category: string): number {
  return stableHash(`${baseHash.toString(36)}:${category}`);
}

export function pickFrom<T>(pool: readonly T[], hash: number): T {
  return pool[hash % pool.length];
}

export function inferGenderPresentationFromName(
  name: string
): GenderPresentation | "unknown" {
  if (!name) return "unknown";
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!first) return "unknown";
  if (EXPLICIT_AMBIGUOUS.has(first)) return "unknown";
  if (FEMININE_NAMES.has(first)) return "feminine";
  if (MASCULINE_NAMES.has(first)) return "masculine";
  return "unknown";
}

export function readPublicTraits(source: unknown): PublicPortraitTraits | null {
  if (
    typeof source !== "object" ||
    source === null ||
    !("traits" in source) ||
    typeof (source as { traits: unknown }).traits !== "object" ||
    (source as { traits: unknown }).traits === null
  ) {
    return null;
  }

  const traits = (source as { traits: Record<string, unknown> }).traits;
  const publicTraits = {} as Record<keyof PublicPortraitTraits, string>;
  for (const key of PUBLIC_TRAIT_KEYS) {
    const value = traits[key];
    if (typeof value !== "string") return null;
    publicTraits[key] = value;
  }
  return publicTraits;
}

export function composePrompt(traits: {
  archetype: (typeof ARCHETYPES)[number];
  expression: (typeof EXPRESSIONS)[number];
  lighting: (typeof LIGHTING)[number];
  marketMoment: string;
  cameraAngle: (typeof CAMERA_ANGLES)[number];
  genderPresentation: (typeof GENDER_PRESENTATIONS)[number];
  apparentAge: (typeof APPARENT_AGES)[number];
  appearanceVariant: (typeof APPEARANCE_VARIANTS)[number];
  hairstyle: (typeof HAIRSTYLES)[number];
  clothingStyle: (typeof CLOTHING_STYLES)[number];
  accessory: (typeof ACCESSORIES)[number];
}): string {
  return [
    "Create a square profile-picture portrait of one fictional 1987 Wall Street trader for the competitive AI trading game Margin Call. The portrait should feel like a collectible rogue-trader character NFT, not a corporate headshot.",
    [
      "Character traits:",
      `- Gender presentation: ${traits.genderPresentation.prompt}`,
      `- Apparent age: ${traits.apparentAge.prompt}`,
      `- Visual appearance: ${traits.appearanceVariant.prompt}`,
      `- Hairstyle: ${traits.hairstyle.prompt}`,
      `- Clothing: ${traits.clothingStyle.prompt}`,
      `- Accessory: ${traits.accessory.prompt}`,
    ].join("\n"),
    [
      "Scene:",
      `- Archetype: ${traits.archetype.description}`,
      `- Setting: ${traits.archetype.scene}`,
      `- Main prop: ${traits.archetype.prop}`,
      `- Expression: ${traits.expression.prompt}`,
      `- Lighting: ${traits.lighting.prompt}`,
      `- Market moment: ${traits.marketMoment}`,
      `- Camera angle: ${traits.cameraAngle.prompt}`,
    ].join("\n"),
    "Style:\nHigh-end retro game character art, painterly pixel-art inspired, cinematic 1980s financial thriller, dramatic amber and green CRT lighting, gritty scanline texture, detailed face, distinct silhouette, square crop, upper-body or head-and-shoulders composition.",
    "Strict exclusions:\nNo readable text anywhere. No captions. No name. No nameplate. No labels. No job titles. No ticker symbols. No numbers. No letters. No logos. No watermarks. No UI text. No readable documents. No readable terminal text. No readable screen text. No modern devices. No cryptocurrency imagery. No border.",
    "The trader's name and internal seed must not appear visually in the image.",
  ].join("\n\n");
}

export function buildPortraitSeed(args: {
  ownerSubject: string;
  name: string;
  mandate: unknown;
  personality?: string;
}) {
  const baseHash = stableHash(
    JSON.stringify({
      ownerSubject: args.ownerSubject,
      name: args.name,
      mandate: args.mandate ?? {},
      personality: args.personality ?? "",
      version: PORTRAIT_METADATA_VERSION,
    })
  );

  const archetype = pickFrom(ARCHETYPES, subHash(baseHash, "archetype"));
  const ageOptions = APPARENT_AGES.filter((age) =>
    (archetype.preferredAgeBuckets as readonly ApparentAgeId[]).includes(age.id)
  );
  const apparentAge = pickFrom(ageOptions, subHash(baseHash, "apparentAge"));
  const inferred = inferGenderPresentationFromName(args.name);
  const genderPresentation =
    inferred === "unknown"
      ? pickFrom(GENDER_PRESENTATIONS, subHash(baseHash, "genderPresentation"))
      : GENDER_PRESENTATION_BY_ID[inferred];
  const genderPresentationSource: GenderPresentationSource =
    inferred === "unknown" ? "hashed" : `inferred-${inferred}`;
  const expression = pickFrom(EXPRESSIONS, subHash(baseHash, "expression"));
  const lighting = pickFrom(LIGHTING, subHash(baseHash, "lighting"));
  const cameraAngle = pickFrom(CAMERA_ANGLES, subHash(baseHash, "cameraAngle"));
  const appearanceVariant = pickFrom(
    APPEARANCE_VARIANTS,
    subHash(baseHash, "appearanceVariant")
  );
  const hairstyle = pickFrom(HAIRSTYLES, subHash(baseHash, "hairstyle"));
  const clothingStyle = pickFrom(
    CLOTHING_STYLES,
    subHash(baseHash, "clothingStyle")
  );
  const accessory = pickFrom(ACCESSORIES, subHash(baseHash, "accessory"));
  const imageStyleSeed = `portrait-v${PORTRAIT_METADATA_VERSION}-${baseHash.toString(36)}`;
  const imagePrompt = composePrompt({
    archetype,
    expression,
    lighting,
    marketMoment: archetype.marketMoment,
    cameraAngle,
    genderPresentation,
    apparentAge,
    appearanceVariant,
    hairstyle,
    clothingStyle,
    accessory,
  });

  return {
    imageStatus: "pending" as const,
    imagePrompt,
    imagePromptSource: {
      version: PORTRAIT_METADATA_VERSION,
      traderName: args.name,
      mandateSnapshot: args.mandate ?? {},
      personalitySnapshot: args.personality ?? null,
      genderPresentationSource,
      traits: {
        archetype: archetype.id,
        scene: archetype.scene,
        prop: archetype.prop,
        marketMoment: archetype.marketMoment,
        expression: expression.id,
        lighting: lighting.id,
        cameraAngle: cameraAngle.id,
        genderPresentation: genderPresentation.id,
        apparentAge: apparentAge.id,
        appearanceVariant: appearanceVariant.id,
        hairstyle: hairstyle.id,
        clothingStyle: clothingStyle.id,
        accessory: accessory.id,
      },
    },
    imageStyleSeed,
    imageVariant: archetype.id,
    imageRetryCount: 0,
    metadataVersion: PORTRAIT_METADATA_VERSION,
  };
}
