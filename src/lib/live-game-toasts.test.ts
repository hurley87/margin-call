import { describe, expect, it } from "vitest";

import {
  seedLiveToastSeenIds,
  selectNewLiveGameToasts,
  type LiveActivityToastSource,
  type LiveDealToastSource,
} from "./live-game-toasts";

const deal = (overrides: Partial<LiveDealToastSource> = {}) => ({
  id: "deal-1",
  prompt: "Hostile takeover rumor circles a battered industrial desk",
  potUsdc: 500,
  entryCostUsdc: 50,
  creatorAddress: "0x1234567890abcdef",
  createdAt: 1000,
  ...overrides,
});

const activity = (
  overrides: Partial<LiveActivityToastSource> = {}
): LiveActivityToastSource => ({
  id: "activity-1",
  traderId: "trader-1",
  activityType: "wipeout",
  message: "Deal outcome: PnL $-100.00 -- WIPED OUT",
  metadata: { pnl: -100 },
  createdAt: 2000,
  ...overrides,
});

describe("live game toast event selection", () => {
  it("seeds initial subscription ids without creating toast candidates", () => {
    const initialDeals = [deal()];
    const initialActivity = [activity()];
    const seen = seedLiveToastSeenIds({
      deals: initialDeals,
      activity: initialActivity,
    });

    expect(
      selectNewLiveGameToasts({
        deals: initialDeals,
        activity: initialActivity,
        seenDealIds: seen.dealIds,
        seenActivityIds: seen.activityIds,
        traderNames: { "trader-1": "Bud Fox" },
        traderProfiles: {},
      })
    ).toEqual([]);
  });

  it("creates one deal toast for a new deal and does not replay it", () => {
    const firstSeen = seedLiveToastSeenIds({ deals: [], activity: [] });
    const firstPass = selectNewLiveGameToasts({
      deals: [deal()],
      activity: [],
      seenDealIds: firstSeen.dealIds,
      seenActivityIds: firstSeen.activityIds,
      traderNames: {},
      traderProfiles: {},
    });

    expect(firstPass).toHaveLength(1);
    expect(firstPass[0]).toMatchObject({
      id: "deal:deal-1",
      kind: "deal",
      title: "NEW DEAL HIT THE FLOOR",
      href: "/?deal=deal-1",
    });

    const replay = selectNewLiveGameToasts({
      deals: [deal()],
      activity: [],
      seenDealIds: new Set(["deal-1"]),
      seenActivityIds: firstSeen.activityIds,
      traderNames: {},
      traderProfiles: {},
    });

    expect(replay).toEqual([]);
  });

  it("filters wipeout toasts from global activity and ignores win or loss rows", () => {
    const toasts = selectNewLiveGameToasts({
      deals: [],
      activity: [
        activity({ id: "activity-win", activityType: "win" }),
        activity({ id: "activity-loss", activityType: "loss" }),
        activity({ id: "activity-wipeout", activityType: "wipeout" }),
      ],
      seenDealIds: new Set(),
      seenActivityIds: new Set(),
      traderNames: { "trader-1": "Gordon Gekko" },
      traderProfiles: {},
    });

    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      id: "wipeout:activity-wipeout",
      kind: "wipeout",
      title: "MARGIN CALL",
      body: "Gordon Gekko was wiped out",
      href: "/?trader=trader-1",
    });
  });
});
