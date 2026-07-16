"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import {
  formatMoodLabel,
  heatBandFromTension,
  heatLabel,
  heatTone,
  moodTone,
  type HeatBand,
} from "@/lib/market-pulse";

export type MarketPulse = {
  mood: string;
  moodLabel: string;
  moodTone: ReturnType<typeof moodTone>;
  heatBand: HeatBand;
  heatLabel: string;
  heatTone: ReturnType<typeof heatTone>;
  tension: number | null;
  isFlash: boolean;
  headline: string | null;
  isLoading: boolean;
};

/** Latest wire drop mood + tension for status chrome (public-safe). */
export function useMarketPulse(): MarketPulse {
  const drops = useQuery(api.marketNarratives.feedDrops, { limit: 1 });

  return useMemo(() => {
    const latest = drops?.[0];
    const mood = latest?.mood ?? "unknown";
    const tension =
      typeof latest?.topArcTension === "number" ? latest.topArcTension : null;
    const band = heatBandFromTension(tension);
    const headline =
      latest?.dispatches?.[0]?.headline ?? latest?.dropTitle ?? null;

    return {
      mood,
      moodLabel: formatMoodLabel(mood),
      moodTone: moodTone(mood),
      heatBand: band,
      heatLabel: heatLabel(band),
      heatTone: heatTone(band),
      tension,
      isFlash: Boolean(latest?.isFlash),
      headline,
      isLoading: drops === undefined,
    };
  }, [drops]);
}
