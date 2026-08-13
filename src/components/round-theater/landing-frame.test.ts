import { describe, expect, it } from "vitest";
import {
  presentLanding,
  ticketForRound,
  ticketLanding,
  type TicketLanding,
} from "./landing-frame";
import { theaterCopy } from "./theater-copy";

const CRASH = "2.50x";

describe("ticketForRound", () => {
  const ticket = {
    id: 1n,
    player: "0x00000000000000000000000000000000000000aa" as const,
    roundId: 12n,
    margin: 5_000_000n,
    leverageBps: 20_000n,
    reservedPayout: 10_000_000n,
    settled: false,
    claimed: false,
  };

  it("passes a ticket from the same round through", () => {
    expect(ticketForRound(ticket, 12n)).toBe(ticket);
  });

  it("nulls a ticket from another round so it lands as spectator", () => {
    expect(ticketForRound(ticket, 13n)).toBeNull();
    expect(ticketLanding(ticketForRound(ticket, 13n), 25_000n)).toEqual({
      kind: "spectator",
    });
  });

  it("passes null through", () => {
    expect(ticketForRound(null, 12n)).toBeNull();
  });
});

describe("ticketLanding", () => {
  it("returns spectator when there is no ticket", () => {
    expect(ticketLanding(null, 25_000n)).toEqual({ kind: "spectator" });
  });

  it("returns won when Arcade Leverage is at or below the Crash Point", () => {
    expect(
      ticketLanding(
        {
          id: 1n,
          player: "0x00000000000000000000000000000000000000aa",
          roundId: 12n,
          margin: 5_000_000n,
          leverageBps: 20_000n,
          reservedPayout: 10_000_000n,
          settled: false,
          claimed: false,
        },
        25_000n
      )
    ).toEqual({ kind: "won" });
  });

  it("returns margin-called when Arcade Leverage is above the Crash Point", () => {
    expect(
      ticketLanding(
        {
          id: 1n,
          player: "0x00000000000000000000000000000000000000aa",
          roundId: 12n,
          margin: 5_000_000n,
          leverageBps: 50_000n,
          reservedPayout: 25_000_000n,
          settled: false,
          claimed: false,
        },
        25_000n
      )
    ).toEqual({ kind: "margin-called" });
  });
});

describe("presentLanding", () => {
  it("freezes won without a margin-call stamp", () => {
    const frame = presentLanding({ kind: "won" }, CRASH);
    expect(frame.heroValue).toBe(theaterCopy.playerWon);
    expect(frame.supportingCrashPoint).toBe(`Crash Point ${CRASH}`);
    expect(frame.outcomeDetail).toBe(theaterCopy.playerWonDetail);
    expect(frame.showMarginCallStamp).toBe(false);
    expect(frame.stampDetail).toBeNull();
    expect(frame.heroColorClass).toContain("green");
  });

  it("freezes margin-called with personal detail once and market stamp copy", () => {
    const frame = presentLanding({ kind: "margin-called" }, CRASH);
    expect(frame.heroValue).toBe(theaterCopy.playerMarginCalled);
    expect(frame.outcomeDetail).toBe(theaterCopy.playerMarginCalledDetail);
    expect(frame.showMarginCallStamp).toBe(true);
    // Stamp must not re-print the personal detail.
    expect(frame.stampDetail).toBe(theaterCopy.marginCallDetail);
    expect(frame.stampDetail).not.toBe(frame.outcomeDetail);
  });

  it("freezes spectator on Crash Point in red with the market stamp", () => {
    const frame = presentLanding({ kind: "spectator" }, CRASH);
    expect(frame.heroLabel).toBe(theaterCopy.verifiedCrashPoint);
    expect(frame.heroValue).toBe(CRASH);
    expect(frame.heroIsMultiplier).toBe(true);
    expect(frame.heroColorClass).toContain("red");
    expect(frame.supportingCrashPoint).toBeNull();
    expect(frame.showMarginCallStamp).toBe(true);
    expect(frame.stampDetail).toBe(theaterCopy.marginCallDetail);
  });

  it("covers every TicketLanding kind", () => {
    const kinds: TicketLanding["kind"][] = [
      "spectator",
      "won",
      "margin-called",
    ];
    for (const kind of kinds) {
      expect(presentLanding({ kind }, CRASH).heroValue.length).toBeGreaterThan(
        0
      );
    }
  });
});
