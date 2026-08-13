import { describe, expect, it, vi } from "vitest";
import { ticketHudClearAction } from "./ticket-hud-clear-action";

function settlement(
  overrides: Partial<
    Parameters<typeof ticketHudClearAction>[0]["settlement"]
  > = {}
) {
  return {
    canVerify: false,
    canClaim: false,
    canSettle: false,
    canRetry: false,
    retryAction: null,
    phase: null,
    outcome: null,
    verifyAndSettle: vi.fn(),
    claim: vi.fn(),
    settleLoss: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function refund(
  overrides: Partial<
    NonNullable<Parameters<typeof ticketHudClearAction>[0]["refund"]>
  > = {}
) {
  return {
    canExpire: false,
    canRefund: false,
    canRetry: false,
    retryAction: null,
    expireRound: vi.fn(),
    refund: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

describe("ticketHudClearAction", () => {
  it("returns null for the current live Open entry", () => {
    expect(
      ticketHudClearAction({
        isLiveOpenEntry: true,
        settlement: settlement({ canVerify: true }),
        refund: refund({ canRefund: true }),
      })
    ).toBeNull();
  });

  it("prefers verify and settle when the settlement dock would", () => {
    const settle = settlement({ canVerify: true, canClaim: true });
    const action = ticketHudClearAction({
      isLiveOpenEntry: false,
      settlement: settle,
      refund: null,
    });
    expect(action?.label).toBe("Verify and settle");
    action?.run();
    expect(settle.verifyAndSettle).toHaveBeenCalledOnce();
  });

  it("offers refund margin for an expiry leftover", () => {
    const refundState = refund({ canRefund: true });
    const action = ticketHudClearAction({
      isLiveOpenEntry: false,
      settlement: settlement(),
      refund: refundState,
    });
    expect(action?.label).toBe("Refund margin");
    action?.run();
    expect(refundState.refund).toHaveBeenCalledOnce();
  });

  it("falls back to verify when phase is locked but canVerify is not ready", () => {
    const settle = settlement({ phase: "locked", outcome: "pending" });
    const action = ticketHudClearAction({
      isLiveOpenEntry: false,
      settlement: settle,
      refund: null,
    });
    expect(action?.label).toBe("Verify and settle");
    action?.run();
    expect(settle.verifyAndSettle).toHaveBeenCalledOnce();
  });

  it("falls back to refund when settlement already knows the ticket is refundable", () => {
    const refundState = refund();
    const action = ticketHudClearAction({
      isLiveOpenEntry: false,
      settlement: settlement({ phase: "expired", outcome: "refundable" }),
      refund: refundState,
    });
    expect(action?.label).toBe("Refund margin");
    action?.run();
    expect(refundState.refund).toHaveBeenCalledOnce();
  });

  it("returns null when no resolve path exists", () => {
    expect(
      ticketHudClearAction({
        isLiveOpenEntry: false,
        settlement: settlement({ phase: "open", outcome: "pending" }),
        refund: refund(),
      })
    ).toBeNull();
  });
});
