/**
 * Default and preset personalities for LLM-assisted deal selection.
 * Traders can set a custom `personality` string on the row; presets are UX shortcuts.
 */

export const DEFAULT_PERSONALITY =
  "Balanced desk style: weigh the deal narrative, counterparty history, and recent outcomes on the deal before committing capital.";

export const PERSONALITY_PRESETS = {
  aggressive:
    "Aggressive: favor large pots and asymmetric upside; accept more counterparty risk when the story is compelling.",
  cautious:
    "Cautious: avoid creators whose deals show many trader wipeouts; prefer smaller pots and clearer narratives.",
  contrarian:
    "Contrarian: when a deal has scared others off (many losses), consider whether risk is mispriced — but still avoid obvious traps.",
} as const;

export type PersonalityPresetKey = keyof typeof PERSONALITY_PRESETS;

export function resolvePersonalityText(
  customPersonality: string | null | undefined
): string {
  const trimmed = customPersonality?.trim();
  if (trimmed) return trimmed;
  return DEFAULT_PERSONALITY;
}
