import { describe, expect, it } from "vitest";
import {
  advanceCeremony,
  buildCeremonyReveal,
  IDLE_CEREMONY,
  type CeremonySnapshot,
  type SettleCeremony,
} from "./settle-ceremony";
import type { CrashTicket } from "./margin-call-crash";

const ticket: CrashTicket = {
  id: 7n,
  player: "0x0000000000000000000000000000000000000003",
  roundId: 12n,
  margin: 5_000_000n,
  leverageBps: 20_000n,
  reservedPayout: 10_000_000n,
  settled: false,
  claimed: false,
};

const snapshot: CeremonySnapshot = {
  roundId: 12n,
  ticket,
  tape: null,
  tiers: [],
};

function verifying(): SettleCeremony {
  return advanceCeremony(IDLE_CEREMONY, { type: "start", snapshot });
}

function climbing(): SettleCeremony {
  return advanceCeremony(verifying(), {
    type: "crash-point-known",
    crashPointBps: 25_000n,
    reducedMotion: false,
  });
}

function landed(): SettleCeremony {
  return advanceCeremony(climbing(), { type: "climb-complete" });
}

describe("advanceCeremony", () => {
  it("starts from idle only", () => {
    expect(verifying()).toEqual({ phase: "verifying", snapshot });
    const held = landed();
    expect(advanceCeremony(held, { type: "start", snapshot })).toBe(held);
  });

  it("reveals to climbing with the locally computed outcome and payout", () => {
    const state = climbing();
    expect(state.phase).toBe("climbing");
    if (state.phase !== "climbing") throw new Error("unreachable");
    expect(state.reveal).toEqual({
      crashPointBps: 25_000n,
      outcome: "won",
      payout: 10_000_000n,
    });
    expect(state.startNonce).toBe(0);
    expect(state.snapshot).toBe(snapshot);
  });

  it("computes a loss when the tier is above the crash point", () => {
    const reveal = buildCeremonyReveal(ticket, 15_000n);
    expect(reveal.outcome).toBe("lost");
    expect(reveal.payout).toBe(0n);
  });

  it("skips the climb under reduced motion", () => {
    const state = advanceCeremony(verifying(), {
      type: "crash-point-known",
      crashPointBps: 25_000n,
      reducedMotion: true,
    });
    expect(state.phase).toBe("landed");
  });

  it("ignores duplicate crash-point-known once revealed", () => {
    const state = climbing();
    expect(
      advanceCeremony(state, {
        type: "crash-point-known",
        crashPointBps: 99_000n,
        reducedMotion: false,
      })
    ).toBe(state);
  });

  it("lands when the climb completes and ignores it elsewhere", () => {
    expect(landed().phase).toBe("landed");
    const idle = IDLE_CEREMONY;
    expect(advanceCeremony(idle, { type: "climb-complete" })).toBe(idle);
    const pre = verifying();
    expect(advanceCeremony(pre, { type: "climb-complete" })).toBe(pre);
  });

  it("rewatches from landed with a bumped nonce", () => {
    const state = advanceCeremony(landed(), { type: "rewatch" });
    expect(state.phase).toBe("climbing");
    if (state.phase !== "climbing") throw new Error("unreachable");
    expect(state.startNonce).toBe(1);
    const relanded = advanceCeremony(state, { type: "climb-complete" });
    const again = advanceCeremony(relanded, { type: "rewatch" });
    if (again.phase !== "climbing") throw new Error("unreachable");
    expect(again.startNonce).toBe(2);
  });

  it("exits landed only through acknowledge", () => {
    const held = landed();
    expect(advanceCeremony(held, { type: "acknowledge" })).toBe(IDLE_CEREMONY);
    // Acknowledge elsewhere is a no-op: nothing to dismiss mid-verify.
    const pre = verifying();
    expect(advanceCeremony(pre, { type: "acknowledge" })).toBe(pre);
  });

  it("resets from any phase", () => {
    for (const state of [IDLE_CEREMONY, verifying(), climbing(), landed()]) {
      expect(advanceCeremony(state, { type: "reset" })).toBe(IDLE_CEREMONY);
    }
  });
});
