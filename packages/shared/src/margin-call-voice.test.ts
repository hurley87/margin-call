import { describe, expect, it } from "vitest";
import { isWinningTicket } from "./crash-outcome";
import {
  extractPrivyPhoneNumber,
  MARGIN_CALL_LIQUIDATION_TWIML,
} from "./margin-call-voice";

describe("crash-outcome", () => {
  it("treats equality as a win and leverage above crash as a loss", () => {
    expect(isWinningTicket(25_000n, 25_000n)).toBe(true);
    expect(isWinningTicket(12_500n, 25_000n)).toBe(true);
    expect(isWinningTicket(50_000n, 25_000n)).toBe(false);
  });
});

describe("margin-call-voice helpers", () => {
  it("extracts phone from top-level or linked Privy accounts", () => {
    expect(
      extractPrivyPhoneNumber({ phone: { number: " +15555550123 " } })
    ).toBe("+15555550123");
    expect(
      extractPrivyPhoneNumber({
        linkedAccounts: [
          { type: "email" },
          { type: "phone", number: "+15555550999" },
        ],
      })
    ).toBe("+15555550999");
    expect(extractPrivyPhoneNumber({ linkedAccounts: [] })).toBeNull();
  });

  it("keeps liquidation TwiML free of phone-shaped content", () => {
    expect(MARGIN_CALL_LIQUIDATION_TWIML).toContain("<Say");
    expect(MARGIN_CALL_LIQUIDATION_TWIML).toContain("liquidated");
    expect(MARGIN_CALL_LIQUIDATION_TWIML).not.toMatch(/\+1\d{10}/);
  });
});
