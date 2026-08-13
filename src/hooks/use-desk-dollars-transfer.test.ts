import { describe, expect, it } from "vitest";
import { validateDeskDollarsTransfer } from "./use-desk-dollars-transfer";

const FROM = "0x0000000000000000000000000000000000000003" as const;
const TO = "0x0000000000000000000000000000000000000004" as const;

describe("validateDeskDollarsTransfer", () => {
  it("accepts a valid recipient and amount within balance", () => {
    expect(
      validateDeskDollarsTransfer({
        from: FROM,
        recipient: TO,
        amount: "10",
        balance: 100_000_000n,
      })
    ).toEqual({ ok: true, to: TO, amount: 10_000_000n });
  });

  it("rejects invalid, zero, and self recipients", () => {
    expect(
      validateDeskDollarsTransfer({
        from: FROM,
        recipient: "not-an-address",
        amount: "1",
        balance: 100_000_000n,
      }).ok
    ).toBe(false);
    expect(
      validateDeskDollarsTransfer({
        from: FROM,
        recipient: "0x0000000000000000000000000000000000000000",
        amount: "1",
        balance: 100_000_000n,
      })
    ).toMatchObject({ error: "Cannot transfer to the zero address." });
    expect(
      validateDeskDollarsTransfer({
        from: FROM,
        recipient: FROM,
        amount: "1",
        balance: 100_000_000n,
      })
    ).toMatchObject({ error: "Cannot transfer to your own wallet." });
  });

  it("rejects empty, zero, over-precise, and over-balance amounts", () => {
    expect(
      validateDeskDollarsTransfer({
        from: FROM,
        recipient: TO,
        amount: "",
        balance: 100_000_000n,
      }).ok
    ).toBe(false);
    expect(
      validateDeskDollarsTransfer({
        from: FROM,
        recipient: TO,
        amount: "0",
        balance: 100_000_000n,
      })
    ).toMatchObject({ error: "Enter an amount greater than zero." });
    expect(
      validateDeskDollarsTransfer({
        from: FROM,
        recipient: TO,
        amount: "1.1234567",
        balance: 100_000_000n,
      }).ok
    ).toBe(false);
    expect(
      validateDeskDollarsTransfer({
        from: FROM,
        recipient: TO,
        amount: "101",
        balance: 100_000_000n,
      })
    ).toMatchObject({ error: "Amount exceeds your Desk Dollars balance." });
  });
});
