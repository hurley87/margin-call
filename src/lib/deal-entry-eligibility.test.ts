import { describe, it, expect } from "vitest";
import {
  isOwnDeskCreatedDeal,
  isTraderEligibleToEnterDealByDesk,
} from "./deal-entry-eligibility";

describe("deal-entry-eligibility (same-desk rule)", () => {
  const deskA = "jd7abc123" as const;
  const deskB = "jd7xyz999" as const;
  const walletA = "0xAbC123";
  const walletB = "0xDeF456";

  it("house / no creator desk id and no wallet match is never own-desk", () => {
    expect(isOwnDeskCreatedDeal({}, { deskManagerId: deskA })).toBe(false);
    expect(
      isOwnDeskCreatedDeal(
        { creatorDeskManagerId: null },
        { deskManagerId: deskA }
      )
    ).toBe(false);
    expect(
      isOwnDeskCreatedDeal(
        { creatorDeskManagerId: "" },
        { deskManagerId: deskA }
      )
    ).toBe(false);
    expect(
      isTraderEligibleToEnterDealByDesk(
        { creatorDeskManagerId: undefined },
        { deskManagerId: deskA }
      )
    ).toBe(true);
  });

  it("same desk id is own-desk and not eligible", () => {
    expect(
      isOwnDeskCreatedDeal(
        { creatorDeskManagerId: deskA },
        { deskManagerId: deskA }
      )
    ).toBe(true);
    expect(
      isTraderEligibleToEnterDealByDesk(
        { creatorDeskManagerId: deskA },
        { deskManagerId: deskA }
      )
    ).toBe(false);
  });

  it("another desk id is eligible", () => {
    expect(
      isTraderEligibleToEnterDealByDesk(
        { creatorDeskManagerId: deskB },
        { deskManagerId: deskA }
      )
    ).toBe(true);
  });

  it("compares ids as strings", () => {
    expect(
      isOwnDeskCreatedDeal(
        { creatorDeskManagerId: deskA },
        { deskManagerId: `${deskA}` }
      )
    ).toBe(true);
  });

  it("same creator wallet with null desk id is own-desk", () => {
    expect(
      isOwnDeskCreatedDeal(
        { creatorDeskManagerId: null, creatorAddress: walletA },
        { deskManagerId: deskA, deskWalletAddress: walletA }
      )
    ).toBe(true);
    expect(
      isTraderEligibleToEnterDealByDesk(
        { creatorAddress: walletA },
        { deskManagerId: deskA, deskWalletAddress: walletA }
      )
    ).toBe(false);
  });

  it("different wallets with null desk id is eligible", () => {
    expect(
      isTraderEligibleToEnterDealByDesk(
        { creatorAddress: walletB },
        { deskManagerId: deskA, deskWalletAddress: walletA }
      )
    ).toBe(true);
  });

  it("compares wallet addresses case-insensitively", () => {
    expect(
      isOwnDeskCreatedDeal(
        { creatorAddress: "0xabc123" },
        { deskManagerId: deskA, deskWalletAddress: "0xAbC123" }
      )
    ).toBe(true);
  });
});
