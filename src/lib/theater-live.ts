/**
 * Narrowing helpers for TheaterLive. Ready kinds carry roundId / timeline / tape;
 * loading/error/unavailable do not. Prefer these over repeating kind switches.
 */

import type {
  TheaterHero,
  TheaterLive,
  TheaterView,
} from "@/hooks/use-round-theater";
import type { TicketTapeEntry } from "@/lib/margin-call-crash";
import type { RoundTimeline } from "@/lib/round-timeline";

export type TheaterLiveReady = Extract<
  TheaterLive,
  { kind: "open" | "delayed" | "finalized" | "expired" }
>;

export function isTheaterLiveReady(
  live: TheaterLive
): live is TheaterLiveReady {
  switch (live.kind) {
    case "open":
    case "delayed":
    case "finalized":
    case "expired":
      return true;
    case "loading":
    case "error":
    case "unavailable":
      return false;
    default: {
      const _exhaustive: never = live;
      return _exhaustive;
    }
  }
}

export function theaterLiveRoundId(live: TheaterLive): bigint | null {
  return isTheaterLiveReady(live) ? live.roundId : null;
}

export function theaterLiveTimeline(live: TheaterLive): RoundTimeline | null {
  return isTheaterLiveReady(live) ? live.timeline : null;
}

export function theaterCountdownSeconds(live: TheaterLive): number | null {
  return isTheaterLiveReady(live) ? live.timeline.countdown.seconds : null;
}

/** Display-round id: held replay hero wins, else the live ready round. */
export function theaterDisplayRoundId(
  live: TheaterLive,
  hero: TheaterHero
): bigint | null {
  if (hero.type === "replay") return hero.roundId;
  return theaterLiveRoundId(live);
}

export function theaterTapeEntries(
  theater: TheaterView
): readonly TicketTapeEntry[] {
  if (isTheaterLiveReady(theater.live)) {
    return theater.live.tape?.entries ?? [];
  }
  if (theater.hero.type === "replay") {
    return theater.hero.tape?.entries ?? [];
  }
  return [];
}

export type TapePotSummary = {
  totalMargin: bigint;
  reservedPayout: bigint;
  ticketCount: number;
};

/**
 * Decorative pot totals from public TicketEntered rows. Settlement never
 * reads this — it is Floor HUD chrome only.
 */
export function summarizeTapePot(
  entries: ReadonlyArray<Pick<TicketTapeEntry, "margin" | "reservedPayout">>
): TapePotSummary {
  let totalMargin = 0n;
  let reservedPayout = 0n;
  for (const entry of entries) {
    totalMargin += entry.margin;
    reservedPayout += entry.reservedPayout;
  }
  return {
    totalMargin,
    reservedPayout,
    ticketCount: entries.length,
  };
}

/**
 * Active timeline segment progress (0..1) for the countdown dial ring.
 * Uses the segment that matches the countdown kind; null when indeterminate.
 */
export function theaterCountdownProgress(
  timeline: RoundTimeline | null
): number | null {
  if (!timeline) return null;
  const segmentId =
    timeline.countdown.kind === "entry-closes" ? "entry" : "next";
  const segment = timeline.segments.find((s) => s.id === segmentId);
  return segment?.progress ?? null;
}
