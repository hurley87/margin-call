import { describe, it, expect } from "vitest";
import {
  isOwnDeskCreatedDeal,
  isTraderEligibleToEnterDealByDesk,
} from "./deal-entry-eligibility";

describe("deal-entry-eligibility (same-desk rule)", () => {
  const deskA = "jd7abc123" as const;
  const deskB = "jd7xyz999" as const;

  it("house / no creator desk id is never own-desk", () => {
    expect(isOwnDeskCreatedDeal({}, deskA)).toBe(false);
    expect(isOwnDeskCreatedDeal({ creatorDeskManagerId: null }, deskA)).toBe(
      false
    );
    expect(isOwnDeskCreatedDeal({ creatorDeskManagerId: "" }, deskA)).toBe(
      false
    );
    expect(
      isTraderEligibleToEnterDealByDesk(
        { creatorDeskManagerId: undefined },
        { deskManagerId: deskA }
      )
    ).toBe(true);
  });

  it("same desk is own-desk and not eligible", () => {
    expect(isOwnDeskCreatedDeal({ creatorDeskManagerId: deskA }, deskA)).toBe(
      true
    );
    expect(
      isTraderEligibleToEnterDealByDesk(
        { creatorDeskManagerId: deskA },
        { deskManagerId: deskA }
      )
    ).toBe(false);
  });

  it("another desk is eligible", () => {
    expect(
      isTraderEligibleToEnterDealByDesk(
        { creatorDeskManagerId: deskB },
        { deskManagerId: deskA }
      )
    ).toBe(true);
  });

  it("compares ids as strings", () => {
    expect(
      isOwnDeskCreatedDeal({ creatorDeskManagerId: deskA }, `${deskA}`)
    ).toBe(true);
  });
});
