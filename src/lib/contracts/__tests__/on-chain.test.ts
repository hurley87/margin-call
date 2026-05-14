import { describe, it, expect } from "vitest";
import { DEAL_STATUS_CLOSED, DEAL_STATUS_OPEN } from "@/lib/contracts/escrow";

describe("escrow constants", () => {
  it("DEAL_STATUS_OPEN is 0 to match MarginCallEscrow.DealStatus.Open", () => {
    expect(DEAL_STATUS_OPEN).toBe(0);
  });

  it("DEAL_STATUS_CLOSED is 1 to match MarginCallEscrow.DealStatus.Closed", () => {
    expect(DEAL_STATUS_CLOSED).toBe(1);
  });
});
