/**
 * Display helpers for live market mood / SEC-heat atmosphere.
 * Odds use mood + heat mechanically; the UI only narrates that state.
 */

export type MarketMood =
  | "electric"
  | "greedy"
  | "bored"
  | "hungover"
  | "nervous"
  | "grim"
  | "tense"
  | "unknown"
  | string;

export type HeatBand = "cool" | "warm" | "hot" | "critical";

/** Map narrative mood → UI tone for chips and status bars. */
export function moodTone(
  mood: MarketMood
): "live" | "accent" | "warn" | "danger" | "neutral" {
  switch (mood) {
    case "electric":
    case "greedy":
      return "live";
    case "bored":
    case "hungover":
      return "neutral";
    case "nervous":
    case "tense":
      return "warn";
    case "grim":
      return "danger";
    default:
      return "accent";
  }
}

/** Arc tension (0–10) → SEC heat band for display. */
export function heatBandFromTension(
  tension: number | null | undefined
): HeatBand {
  const t = tension ?? 5;
  if (t >= 8) return "critical";
  if (t >= 6) return "hot";
  if (t >= 3.5) return "warm";
  return "cool";
}

export function heatLabel(band: HeatBand): string {
  switch (band) {
    case "cool":
      return "Cool";
    case "warm":
      return "Moderate";
    case "hot":
      return "Elevated";
    case "critical":
      return "Critical";
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

export function heatTone(
  band: HeatBand
): "live" | "accent" | "warn" | "danger" | "neutral" {
  switch (band) {
    case "cool":
      return "live";
    case "warm":
      return "accent";
    case "hot":
      return "warn";
    case "critical":
      return "danger";
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

export function formatMoodLabel(mood: MarketMood): string {
  if (!mood || mood === "unknown") return "Quiet tape";
  return mood.replace(/_/g, " ");
}
