import { describe, expect, it, vi } from "vitest";
import { primaryTicketResolveAction } from "./primary-ticket-resolve-action";

function settlement(
  overrides: Partial<
    Parameters<typeof primaryTicketResolveAction>[0]["settlement"]
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
    NonNullable<Parameters<typeof primaryTicketResolveAction>[0]["refund"]>
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

describe("primaryTicketResolveAction", () => {
  it("prefers verify over claim when both can* flags are set", () => {
    const settle = settlement({ canVerify: true, canClaim: true });
    const action = primaryTicketResolveAction({
      settlement: settle,
      refund: null,
    });
    expect(action?.label).toBe("Verify and settle");
    action?.run();
    expect(settle.verifyAndSettle).toHaveBeenCalledOnce();
  });

  it("offers refund when settle flags are idle", () => {
    const refundState = refund({ canRefund: true });
    const action = primaryTicketResolveAction({
      settlement: settlement(),
      refund: refundState,
    });
    expect(action?.label).toBe("Refund margin");
    action?.run();
    expect(refundState.refund).toHaveBeenCalledOnce();
  });

  it("returns null when no can* flag is set", () => {
    expect(
      primaryTicketResolveAction({
        settlement: settlement(),
        refund: refund(),
      })
    ).toBeNull();
  });
});
