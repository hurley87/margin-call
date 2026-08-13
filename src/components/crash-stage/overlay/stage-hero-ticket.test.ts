import { describe, expect, it } from "vitest";
import type { CrashTicket } from "@/lib/margin-call-crash";
import { stageHeroTicket } from "./stage-hero-ticket";

function ticket(
  overrides: Partial<CrashTicket> &
    Pick<CrashTicket, "id" | "roundId" | "settled">
): CrashTicket {
  return {
    player: "0x0000000000000000000000000000000000000003",
    margin: 1_000_000n,
    leverageBps: 50_000n,
    reservedPayout: 5_000_000n,
    claimed: false,
    ...overrides,
  };
}

describe("stageHeroTicket", () => {
  it("prefers an unsettled ticket over a settled hero-round ticket", () => {
    const unsettled = ticket({ id: 25n, roundId: 2047n, settled: false });
    const settled = ticket({
      id: 24n,
      roundId: 2028n,
      settled: true,
      claimed: false,
    });
    expect(
      stageHeroTicket({
        unsettledTicket: unsettled,
        playerTicket: settled,
        settlementTicket: settled,
        replayRoundId: 2028n,
      })
    ).toBe(unsettled);
  });

  it("allows a settled ticket only when it belongs to the replay hero round", () => {
    const settled = ticket({
      id: 24n,
      roundId: 2028n,
      settled: true,
      claimed: false,
    });
    expect(
      stageHeroTicket({
        unsettledTicket: null,
        playerTicket: null,
        settlementTicket: settled,
        replayRoundId: 2028n,
      })
    ).toBe(settled);
    expect(
      stageHeroTicket({
        unsettledTicket: null,
        playerTicket: null,
        settlementTicket: settled,
        replayRoundId: 2047n,
      })
    ).toBeNull();
    expect(
      stageHeroTicket({
        unsettledTicket: null,
        playerTicket: null,
        settlementTicket: settled,
        replayRoundId: null,
      })
    ).toBeNull();
  });
});
