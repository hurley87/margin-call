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

export const PUBLIC_PORTRAIT_TRAIT_ROWS = [
  ["archetype", "Archetype"],
  ["scene", "Scene"],
  ["prop", "Prop"],
  ["marketMoment", "Market Moment"],
  ["expression", "Expression"],
  ["lighting", "Lighting"],
  ["cameraAngle", "Camera Angle"],
  ["genderPresentation", "Gender Presentation"],
  ["apparentAge", "Apparent Age"],
  ["appearanceVariant", "Appearance"],
  ["hairstyle", "Hairstyle"],
  ["clothingStyle", "Clothing"],
  ["accessory", "Accessory"],
] as const satisfies readonly [keyof PublicPortraitTraits, string][];

export function humanizePortraitTraitValue(value: string): string {
  const overrides: Record<string, string> = {
    mna_rainmaker: "M&A Rainmaker",
  };
  if (overrides[value]) return overrides[value];
  return value.replaceAll("_", " ").replace(/\S+/g, (word) =>
    word
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-")
  );
}

export function leaderboardFlavorTrait(
  traits: PublicPortraitTraits | null | undefined
): string | null {
  if (!traits) return null;
  const value =
    traits.accessory && traits.accessory !== "no_accessory"
      ? traits.accessory
      : traits.marketMoment;
  return humanizePortraitTraitValue(value);
}
