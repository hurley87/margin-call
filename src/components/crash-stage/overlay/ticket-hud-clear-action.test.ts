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

  it("uses the shared primary resolve action when ready", () => {
    const settle = settlement({ canVerify: true });
    const action = ticketHudClearAction({
      isLiveOpenEntry: false,
      settlement: settle,
      refund: null,
    });
    expect(action?.label).toBe("Verify and settle");
    action?.run();
    expect(settle.verifyAndSettle).toHaveBeenCalledOnce();
  });

  it("returns null when no can* flag is set", () => {
    expect(
      ticketHudClearAction({
        isLiveOpenEntry: false,
        settlement: settlement(),
        refund: refund(),
      })
    ).toBeNull();
  });
});
