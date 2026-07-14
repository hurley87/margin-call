import { describe, expect, it } from "vitest";
import {
  BLOW_DECIMALS,
  CORNER_OFFICE_THRESHOLD_HUMAN,
  CORNER_OFFICE_THRESHOLD_WEI,
  MARGINCALL_TOKEN_ADDRESS,
  SEAT_THRESHOLD_HUMAN,
  SEAT_THRESHOLD_WEI,
  SEAT_VAULT_V1,
  TIER_CAPACITY,
  TIER_CORNER_OFFICE,
  TIER_GALLERY,
  TIER_SEAT,
  UNSTAKE_COOLDOWN_SECONDS,
  capacityForTier,
  formatBlowAmount,
  parseBlowAmount,
  seatTierNameFromOnChain,
  seatTierToOnChain,
  seatVaultAbi,
  seatVaultEventDedupeKey,
  tierFromActiveAmount,
} from "@/lib/contracts/seatVault";

describe("SeatVault immutable policy", () => {
  it("matches on-chain Tier enum ordinals", () => {
    expect(TIER_GALLERY).toBe(0);
    expect(TIER_SEAT).toBe(1);
    expect(TIER_CORNER_OFFICE).toBe(2);
    expect(seatTierNameFromOnChain(0)).toBe("Gallery");
    expect(seatTierNameFromOnChain(1)).toBe("Seat");
    expect(seatTierNameFromOnChain(2)).toBe("CornerOffice");
    expect(seatTierToOnChain("Gallery")).toBe(0);
    expect(seatTierToOnChain("Seat")).toBe(1);
    expect(seatTierToOnChain("CornerOffice")).toBe(2);
  });

  it("matches deploy thresholds and cooldown", () => {
    expect(SEAT_THRESHOLD_HUMAN).toBe(10_000);
    expect(CORNER_OFFICE_THRESHOLD_HUMAN).toBe(50_000);
    expect(UNSTAKE_COOLDOWN_SECONDS).toBe(86_400);
    expect(SEAT_THRESHOLD_WEI).toBe("10000000000000000000000");
    expect(CORNER_OFFICE_THRESHOLD_WEI).toBe("50000000000000000000000");
    expect(SEAT_VAULT_V1.seatThresholdWei).toBe(SEAT_THRESHOLD_WEI);
    expect(SEAT_VAULT_V1.cornerOfficeThresholdWei).toBe(
      CORNER_OFFICE_THRESHOLD_WEI
    );
    expect(SEAT_VAULT_V1.unstakeCooldownSeconds).toBe(UNSTAKE_COOLDOWN_SECONDS);
    expect(SEAT_VAULT_V1.address).toBe(
      "0xA901DFC8C46faF3A24F4002849dE98dFE9722C95"
    );
  });

  it("maps capacity cadence and unresolved caps per PRD", () => {
    expect(TIER_CAPACITY.Gallery).toEqual({
      cycleIntervalMs: 10 * 60 * 1000,
      maxUnresolvedEntries: 1,
    });
    expect(TIER_CAPACITY.Seat).toEqual({
      cycleIntervalMs: 5 * 60 * 1000,
      maxUnresolvedEntries: 1,
    });
    expect(TIER_CAPACITY.CornerOffice).toEqual({
      cycleIntervalMs: 5 * 60 * 1000,
      maxUnresolvedEntries: 2,
    });
    expect(capacityForTier("CornerOffice").maxUnresolvedEntries).toBe(2);
  });

  it("formats and parses 18-decimal $BLOW amounts", () => {
    expect(BLOW_DECIMALS).toBe(18);
    expect(formatBlowAmount(SEAT_THRESHOLD_WEI)).toBe("10000");
    expect(formatBlowAmount(CORNER_OFFICE_THRESHOLD_WEI)).toBe("50000");
    expect(parseBlowAmount("10000")).toBe(SEAT_THRESHOLD_WEI);
    expect(parseBlowAmount("9999.5")).toBe("9999500000000000000000");
  });
});

describe("tierFromActiveAmount thresholds", () => {
  it("is Gallery below Seat", () => {
    expect(tierFromActiveAmount("0")).toBe("Gallery");
    expect(tierFromActiveAmount(parseBlowAmount("9999"))).toBe("Gallery");
  });

  it("is Seat at Seat threshold and below Corner", () => {
    expect(tierFromActiveAmount(SEAT_THRESHOLD_WEI)).toBe("Seat");
    expect(tierFromActiveAmount(parseBlowAmount("49999"))).toBe("Seat");
  });

  it("is Corner Office at Corner threshold", () => {
    expect(tierFromActiveAmount(CORNER_OFFICE_THRESHOLD_WEI)).toBe(
      "CornerOffice"
    );
    expect(tierFromActiveAmount(parseBlowAmount("100000"))).toBe(
      "CornerOffice"
    );
  });
});

describe("seatVaultEventDedupeKey", () => {
  it("normalizes vault address and encodes block + logIndex", () => {
    expect(
      seatVaultEventDedupeKey(
        "0xA901DFC8C46faF3A24F4002849dE98dFE9722C95",
        12,
        3
      )
    ).toBe("0xa901dfc8c46faf3a24f4002849de98dfe9722c95:12:3");
  });
});

describe("client token + write ABI", () => {
  it("exports MARGINCALL_TOKEN_ADDRESS from v1 defaults", () => {
    expect(MARGINCALL_TOKEN_ADDRESS.toLowerCase()).toBe(
      SEAT_VAULT_V1.margincallToken.toLowerCase()
    );
  });

  it("includes stake / initiateUnstake / completeUnstake writes", () => {
    const names = seatVaultAbi
      .filter((item) => item.type === "function")
      .map((item) => item.name);
    expect(names).toContain("stake");
    expect(names).toContain("initiateUnstake");
    expect(names).toContain("completeUnstake");
    expect(names).toContain("stakeOf");
  });
});
