/**
 * Arc template pool — pure, no Convex imports.
 *
 * When a live arc retires the engine spawns a fresh one from this pool. Each
 * template knows how to generate a fictional firm + a central character, and
 * carries the per-stage running-loss schedule the world-state engine steps the
 * firm through. Selection and name generation are deterministic (seeded by the
 * epoch slot) so runs are reproducible.
 */

import { hashString } from "./stages";

export interface FirmEntitySpec {
  slug: string;
  displayName: string;
  aliases: string[];
  bio: string;
  traits: string[];
}

export interface CharacterEntitySpec {
  slug: string;
  displayName: string;
  aliases: string[];
  bio: string;
  traits: string[];
  kind: "trader" | "regulator" | "politician";
}

export interface SpawnedArcSpec {
  templateKey: string;
  slug: string;
  title: string;
  summary: string;
  firm: FirmEntitySpec;
  character: CharacterEntitySpec;
  /** Peak running-loss (USDC) the firm reaches at climax. */
  peakLossUsdc: number;
}

interface ArcTemplate {
  key: string;
  weight: number;
  /** Loss schedule scale; multiplied by the per-stage band fractions. */
  peakLossUsdc: number;
  title: (firm: string, character: string) => string;
  summary: (firm: string, character: string) => string;
  /** Character role flavor. */
  characterKind: "trader" | "regulator" | "politician";
  characterTraits: string[];
  firmTraits: string[];
  characterBio: (firm: string) => string;
  firmBio: (character: string) => string;
}

/** Peak-loss figure for a spawn template, or null if the key is unknown. */
export function templatePeakLossUsdc(
  key: string | null | undefined
): number | null {
  if (!key) return null;
  return ARC_TEMPLATES.find((t) => t.key === key)?.peakLossUsdc ?? null;
}

// ── name fragment pools ────────────────────────────────────────────────────

const FIRM_PREFIXES = [
  "Halloran",
  "Castle",
  "Meridian",
  "Brandt",
  "Continental",
  "Sterling",
  "Vanguard",
  "Ironside",
  "Pemberton",
  "Whitlock",
];
const FIRM_SUFFIXES = [
  "Partners",
  "Securities",
  "Holdings",
  "Capital",
  "& Sons",
  "Group",
  "Brothers",
  "Trust",
];
const FIRST_NAMES = [
  "Chip",
  "Sandy",
  "Reggie",
  "Lou",
  "Vic",
  "Hal",
  "Donna",
  "Frank",
  "Sal",
  "Bunny",
];
const LAST_NAMES = [
  "Kessler",
  "DeLuca",
  "Brandt",
  "Holloway",
  "Pike",
  "Ferris",
  "Calabrese",
  "Stone",
  "Ovitz",
  "Drummond",
];

function pick<T>(pool: T[], seed: string): T {
  return pool[hashString(seed) % pool.length];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ── templates ──────────────────────────────────────────────────────────────

export const ARC_TEMPLATES: ArcTemplate[] = [
  {
    key: "hostile-takeover",
    weight: 1,
    peakLossUsdc: 420_000_000,
    characterKind: "trader",
    characterTraits: ["ruthless", "leveraged", "impatient"],
    firmTraits: ["undervalued", "cornered", "proud"],
    title: (firm, char) => `${char} circles ${firm}`,
    summary: (firm, char) =>
      `${char} is amassing a hostile stake in ${firm}, financed with debt nobody has seen the terms of. The board is pretending not to notice.`,
    characterBio: (firm) =>
      `A corporate raider who buys companies for their furniture. Currently fixated on ${firm}.`,
    firmBio: (char) =>
      `A sleepy mid-cap with a fat cash pile and a board that just realized ${char} owns more of it than they do.`,
  },
  {
    key: "rogue-trader",
    weight: 1,
    peakLossUsdc: 600_000_000,
    characterKind: "trader",
    characterTraits: ["secretive", "brilliant", "doomed"],
    firmTraits: ["complacent", "exposed", "blind"],
    title: (firm, char) => `${char}'s hidden book at ${firm}`,
    summary: (firm, char) =>
      `${char} has been hiding losses in a desk drawer at ${firm} for months. Risk control thinks he is their best trader.`,
    characterBio: (firm) =>
      `A star trader at ${firm} whose P&L is a work of fiction nobody has audited.`,
    firmBio: (char) =>
      `A house that handed ${char} a checkbook and stopped asking questions.`,
  },
  {
    key: "insider-leak",
    weight: 1,
    peakLossUsdc: 280_000_000,
    characterKind: "regulator",
    characterTraits: ["patient", "methodical", "humorless"],
    firmTraits: ["chatty", "careless", "connected"],
    title: (firm, char) => `${char} opens a file on ${firm}`,
    summary: (firm, char) =>
      `Someone at ${firm} traded ahead of an announcement. ${char} has the phone records and is in no hurry.`,
    characterBio: (firm) =>
      `An investigator who announces indictments, not investigations. Now reading ${firm}'s call logs.`,
    firmBio: (char) =>
      `A firm whose junior staff cannot stop talking, now of great interest to ${char}.`,
  },
  {
    key: "junk-bond-mania",
    weight: 1,
    peakLossUsdc: 500_000_000,
    characterKind: "trader",
    characterTraits: ["charismatic", "overextended", "tan"],
    firmTraits: ["levered", "hyped", "fragile"],
    title: (firm, char) => `${char} keeps issuing ${firm} paper`,
    summary: (firm, char) =>
      `${char} is underwriting another tranche of ${firm} junk at yields that only make sense if nothing ever goes wrong. Something is going wrong.`,
    characterBio: (firm) =>
      `A bond salesman who could sell sand in a desert, currently selling ${firm}.`,
    firmBio: (char) =>
      `An issuer addicted to cheap debt, kept alive entirely by ${char}'s phone book.`,
  },
  {
    key: "rival-wire-feud",
    weight: 1,
    peakLossUsdc: 120_000_000,
    characterKind: "politician",
    characterTraits: ["loud", "vain", "litigious"],
    firmTraits: ["upstart", "aggressive", "sloppy"],
    title: (firm, char) => `${firm} and ${char} go to war`,
    summary: (firm, char) =>
      `Rival wire ${firm} is poaching sources and printing scoops half a step ahead. ${char} is threatening lawyers. The floor is enjoying it.`,
    characterBio: (firm) =>
      `A wire-service grandee who takes ${firm}'s every scoop as a personal insult.`,
    firmBio: (char) =>
      `A hungry upstart wire that would rather be sued than be boring, much to ${char}'s fury.`,
  },
  {
    key: "boy-genius-fraud",
    weight: 1,
    peakLossUsdc: 700_000_000,
    characterKind: "trader",
    characterTraits: ["young", "smug", "evasive"],
    firmTraits: ["opaque", "hyped", "hollow"],
    title: (firm, char) => `${char}'s ${firm} returns look too good`,
    summary: (firm, char) =>
      `${char}, 29, runs ${firm} and posts returns that do not move with the market. Allocators are euphoric. The arithmetic is not.`,
    characterBio: (firm) =>
      `A wunderkind whose fund ${firm} never has a down month, which is the problem.`,
    firmBio: (char) =>
      `A fund whose strategy ${char} declines to explain because there isn't one.`,
  },
];

/** Sum of template weights, for deterministic weighted selection. */
function totalWeight(): number {
  return ARC_TEMPLATES.reduce((s, t) => s + t.weight, 0);
}

/**
 * Deterministically choose a template and generate a fully-specified arc +
 * firm + character, avoiding slugs already taken. `seed` is typically the
 * epoch slot so back-to-back spawns differ.
 */
export function spawnArc(
  seed: string,
  takenSlugs: Set<string>
): SpawnedArcSpec {
  const roll = hashString(`tmpl:${seed}`) % totalWeight();
  let acc = 0;
  let template = ARC_TEMPLATES[0];
  for (const t of ARC_TEMPLATES) {
    acc += t.weight;
    if (roll < acc) {
      template = t;
      break;
    }
  }

  // Generate distinct names, nudging the seed until slugs are free.
  let attempt = 0;
  let firmName = "";
  let charName = "";
  let firmSlug = "";
  let charSlug = "";
  do {
    const s = `${template.key}:${seed}:${attempt}`;
    firmName = `${pick(FIRM_PREFIXES, `fp:${s}`)} ${pick(FIRM_SUFFIXES, `fs:${s}`)}`;
    charName = `${pick(FIRST_NAMES, `cf:${s}`)} ${pick(LAST_NAMES, `cl:${s}`)}`;
    firmSlug = slugify(firmName);
    charSlug = slugify(charName);
    attempt++;
  } while (
    (takenSlugs.has(firmSlug) || takenSlugs.has(charSlug)) &&
    attempt < 50
  );

  const arcSlug = `${template.key}-${firmSlug}`;

  return {
    templateKey: template.key,
    slug: arcSlug,
    title: template.title(firmName, charName),
    summary: template.summary(firmName, charName),
    firm: {
      slug: firmSlug,
      displayName: firmName,
      aliases: [firmName.split(" ")[0]],
      bio: template.firmBio(charName),
      traits: template.firmTraits,
    },
    character: {
      slug: charSlug,
      displayName: charName,
      aliases: [charName.split(" ")[1] ?? charName],
      bio: template.characterBio(firmName),
      traits: template.characterTraits,
      kind: template.characterKind,
    },
    peakLossUsdc: template.peakLossUsdc,
  };
}
