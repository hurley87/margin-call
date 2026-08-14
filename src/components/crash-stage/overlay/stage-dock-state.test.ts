import { describe, expect, it } from "vitest";
import {
  deriveStageDockKind,
  type StageDockStateInput,
} from "./stage-dock-state";

function base(
  overrides: Partial<StageDockStateInput> = {}
): StageDockStateInput {
  return {
    mode: "countdown",
    phase: "open",
    countdownSeconds: 22,
    hasTicket: false,
    hasSettlementTicket: false,
    canVerify: false,
    canClaim: false,
    canSettle: false,
    canRetry: false,
    settlementPhase: null,
    settlementOutcome: null,
    ...overrides,
  };
}

describe("deriveStageDockKind", () => {
  it("offers enter while the round is open with time left", () => {
    expect(deriveStageDockKind(base())).toBe("enter");
  });

  it("arms during the five-second cutoff", () => {
    expect(deriveStageDockKind(base({ countdownSeconds: 4 }))).toBe("arm");
  });

  it("arms between rounds while locked or reveal-requested", () => {
    expect(
      deriveStageDockKind(base({ phase: "locked", countdownSeconds: 8 }))
    ).toBe("arm");
    expect(
      deriveStageDockKind(
        base({ phase: "reveal-requested", countdownSeconds: 5 })
      )
    ).toBe("arm");
    expect(
      deriveStageDockKind(base({ phase: "finalized", countdownSeconds: 3 }))
    ).toBe("arm");
  });

  it("arms for prelaunch and uninitialized epochs", () => {
    expect(deriveStageDockKind(base({ phase: "prelaunch" }))).toBe("arm");
    expect(deriveStageDockKind(base({ phase: "uninitialized" }))).toBe("arm");
  });

  it("prefers settle when the settlement ticket can act", () => {
    expect(
      deriveStageDockKind(
        base({
          hasTicket: true,
          hasSettlementTicket: true,
          canVerify: true,
          phase: "locked",
          mode: "awaiting-settle",
        })
      )
    ).toBe("settle");
  });

  it("prefers refund for expiry leftovers over arm or enter", () => {
    expect(
      deriveStageDockKind(
        base({
          hasTicket: true,
          settlementPhase: "expired",
          settlementOutcome: "refundable",
        })
      )
    ).toBe("refund");
  });

  it("keeps enter available during a previous-round outcome when the next round is open", () => {
    expect(
      deriveStageDockKind(
        base({
          mode: "outcome",
          phase: "open",
          countdownSeconds: 22,
        })
      )
    ).toBe("enter");
  });

  it("hides the dock during replay or outcome when entry is closed", () => {
    expect(
      deriveStageDockKind(
        base({
          mode: "replay",
          phase: "finalized",
          countdownSeconds: 8,
        })
      )
    ).toBe("none");
    expect(
      deriveStageDockKind(
        base({
          mode: "outcome",
          phase: "finalized",
          hasTicket: true,
          hasSettlementTicket: true,
          countdownSeconds: 12,
        })
      )
    ).toBe("none");
  });

  it("does not arm when the player already holds a ticket", () => {
    expect(
      deriveStageDockKind(
        base({
          hasTicket: true,
          phase: "locked",
          countdownSeconds: 10,
        })
      )
    ).toBe("none");
  });
});
