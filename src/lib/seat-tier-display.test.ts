import { describe, expect, it } from "vitest";
import {
  amountNeededForNextTier,
  canCompleteWithdrawal,
  canInitiateUnstake,
  canPostPrincipal,
  formatUnlockCountdown,
  isCooldownActive,
  isCooldownComplete,
  isLapsedSeat,
  SEAT_TIER_FLOOR_LABEL,
} from "./seat-tier-display";
import {
  CORNER_OFFICE_THRESHOLD_WEI,
  SEAT_THRESHOLD_WEI,
  parseBlowAmount,
} from "@/lib/contracts/seatVault";

describe("amountNeededForNextTier", () => {
  it("targets Seat from Gallery", () => {
    const next = amountNeededForNextTier(parseBlowAmount("2500"));
    expect(next?.nextTier).toBe("Seat");
    expect(next?.deltaHuman).toBe("7500");
    expect(next?.thresholdWei).toBe(SEAT_THRESHOLD_WEI);
  });

  it("targets Corner Office from Seat", () => {
    const next = amountNeededForNextTier(SEAT_THRESHOLD_WEI);
    expect(next?.nextTier).toBe("CornerOffice");
    expect(next?.deltaHuman).toBe("40000");
    expect(next?.thresholdWei).toBe(CORNER_OFFICE_THRESHOLD_WEI);
  });

  it("returns null at Corner Office", () => {
    expect(amountNeededForNextTier(CORNER_OFFICE_THRESHOLD_WEI)).toBeNull();
  });
});

describe("cooldown boundaries", () => {
  it("treats unlockTime 0 as incomplete", () => {
    expect(isCooldownComplete(0, 1_000)).toBe(false);
    expect(isCooldownActive(0, parseBlowAmount("100"), 1_000)).toBe(false);
  });

  it("blocks before unlock and clears at/after unlock", () => {
    const unlock = 1_700_000_100;
    expect(isCooldownComplete(unlock, unlock - 1)).toBe(false);
    expect(isCooldownComplete(unlock, unlock)).toBe(true);
    expect(isCooldownComplete(unlock, unlock + 5)).toBe(true);
    expect(isCooldownActive(unlock, parseBlowAmount("10"), unlock - 1)).toBe(
      true
    );
    expect(isCooldownActive(unlock, parseBlowAmount("10"), unlock)).toBe(false);
    expect(isCooldownActive(unlock, "0", unlock - 1)).toBe(false);
  });

  it("formats countdown and Ready", () => {
    expect(formatUnlockCountdown(0, 100)).toBe("—");
    expect(formatUnlockCountdown(200, 200)).toBe("Ready");
    expect(formatUnlockCountdown(200, 199)).toBe("1s");
    expect(formatUnlockCountdown(3_661 + 100, 100)).toBe("1h 01m 01s");
  });
});

describe("lapsed seat + authorization", () => {
  it("flags lapsed when pending exists below Seat", () => {
    expect(isLapsedSeat(parseBlowAmount("9999"), parseBlowAmount("100"))).toBe(
      true
    );
    expect(isLapsedSeat(SEAT_THRESHOLD_WEI, parseBlowAmount("100"))).toBe(
      false
    );
    expect(isLapsedSeat(parseBlowAmount("100"), "0")).toBe(false);
  });

  it("gates posting to matching depositor on active vault", () => {
    expect(
      canPostPrincipal({
        walletAddress: "0xAbc",
        depositorAddress: "0xabc",
        isActiveVault: true,
      })
    ).toBe(true);
    expect(
      canPostPrincipal({
        walletAddress: "0xAbc",
        depositorAddress: "0xdef",
        isActiveVault: true,
      })
    ).toBe(false);
    expect(
      canPostPrincipal({
        walletAddress: "0xAbc",
        depositorAddress: "0xabc",
        isActiveVault: false,
      })
    ).toBe(false);
  });

  it("allows depositor or staker to initiate; complete only after cooldown", () => {
    expect(
      canInitiateUnstake({
        walletAddress: "0x1",
        depositorAddress: "0x1",
        stakerAddress: "0x2",
        activeWei: parseBlowAmount("10"),
      })
    ).toBe(true);
    expect(
      canInitiateUnstake({
        walletAddress: "0x2",
        depositorAddress: "0x1",
        stakerAddress: "0x2",
        activeWei: parseBlowAmount("10"),
      })
    ).toBe(true);
    expect(
      canInitiateUnstake({
        walletAddress: "0x3",
        depositorAddress: "0x1",
        stakerAddress: "0x2",
        activeWei: parseBlowAmount("10"),
      })
    ).toBe(false);
    expect(
      canInitiateUnstake({
        walletAddress: "0x1",
        depositorAddress: "0x1",
        stakerAddress: "0x1",
        activeWei: "0",
      })
    ).toBe(false);

    expect(
      canCompleteWithdrawal({
        pendingWei: parseBlowAmount("5"),
        unlockTimeSeconds: 100,
        nowSeconds: 99,
      })
    ).toBe(false);
    expect(
      canCompleteWithdrawal({
        pendingWei: parseBlowAmount("5"),
        unlockTimeSeconds: 100,
        nowSeconds: 100,
      })
    ).toBe(true);
    expect(
      canCompleteWithdrawal({
        pendingWei: "0",
        unlockTimeSeconds: 100,
        nowSeconds: 200,
      })
    ).toBe(false);
  });

  it("uses floor labels without yield language", () => {
    expect(SEAT_TIER_FLOOR_LABEL.CornerOffice).toBe("Corner Office");
    expect(SEAT_TIER_FLOOR_LABEL.Seat).toBe("Seat");
    expect(SEAT_TIER_FLOOR_LABEL.Gallery).toBe("Gallery");
  });
});
