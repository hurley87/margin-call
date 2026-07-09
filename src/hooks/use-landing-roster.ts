"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { PublicPortraitTraits } from "@/lib/portrait-traits";

export type LandingRosterTrader = {
  id: string;
  name: string;
  profileImageUrl: string;
  traits: PublicPortraitTraits | null;
};

/** Lightweight public roster used only by the unauthenticated landing page. */
export function useLandingRoster() {
  const traders = useQuery(api.leaderboard.listLandingRoster, { limit: 4 });

  return {
    data: traders as LandingRosterTrader[] | undefined,
    isLoading: traders === undefined,
    isError: false as const,
  };
}
