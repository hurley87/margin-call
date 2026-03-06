import { describe, it, expect } from "vitest";
import { RAKE_PERCENTAGE, MAX_EXTRACTION_PERCENTAGE } from "@/lib/constants";

// Extract the validation logic from the route into testable pure functions
// These mirror the logic in src/app/api/deal/enter/route.ts

function capOutcome(
  balanceChange: number,
  potUsdc: number,
  entryCostUsdc: number
): { balanceChange: number; corrected: boolean } {
  const maxValuePerWin = potUsdc * (MAX_EXTRACTION_PERCENTAGE / 100);
  let corrected = false;

  let capped = balanceChange;

  // Cap winnings at 25% of pot
  if (capped > maxValuePerWin) {
    capped = maxValuePerWin;
    corrected = true;
  }

  // Cap losses at entry cost
  if (capped < -entryCostUsdc) {
    capped = -entryCostUsdc;
    corrected = true;
  }

  return { balanceChange: capped, corrected };
}

function calculateRake(balanceChange: number): number {
  if (balanceChange <= 0) return 0;
  return balanceChange * (RAKE_PERCENTAGE / 100);
}

function calculateTraderPnl(balanceChange: number, rake: number): number {
  return balanceChange > 0 ? balanceChange - rake : balanceChange;
}

function calculatePotChange(
  entryCostUsdc: number,
  balanceChange: number
): number {
  return entryCostUsdc - (balanceChange > 0 ? balanceChange : 0);
}

describe("deal outcome validation", () => {
  describe("capOutcome", () => {
    it("caps winnings at 25% of pot", () => {
      const result = capOutcome(100, 200, 10); // 25% of 200 = 50
      expect(result.balanceChange).toBe(50);
      expect(result.corrected).toBe(true);
    });

    it("does not cap winnings within limit", () => {
      const result = capOutcome(40, 200, 10); // 25% of 200 = 50
      expect(result.balanceChange).toBe(40);
      expect(result.corrected).toBe(false);
    });

    it("caps losses at entry cost", () => {
      const result = capOutcome(-50, 200, 10);
      expect(result.balanceChange).toBe(-10);
      expect(result.corrected).toBe(true);
    });

    it("does not cap losses within limit", () => {
      const result = capOutcome(-5, 200, 10);
      expect(result.balanceChange).toBe(-5);
      expect(result.corrected).toBe(false);
    });

    it("handles exact boundary values", () => {
      const result = capOutcome(50, 200, 10); // exactly 25% of pot
      expect(result.balanceChange).toBe(50);
      expect(result.corrected).toBe(false);
    });

    it("handles zero balance change", () => {
      const result = capOutcome(0, 200, 10);
      expect(result.balanceChange).toBe(0);
      expect(result.corrected).toBe(false);
    });
  });

  describe("calculateRake", () => {
    it("takes 10% rake on winnings", () => {
      expect(calculateRake(100)).toBe(10);
    });

    it("takes no rake on losses", () => {
      expect(calculateRake(-50)).toBe(0);
    });

    it("takes no rake on zero", () => {
      expect(calculateRake(0)).toBe(0);
    });

    it("handles fractional amounts", () => {
      expect(calculateRake(33)).toBeCloseTo(3.3);
    });
  });

  describe("calculateTraderPnl", () => {
    it("subtracts rake from winnings", () => {
      expect(calculateTraderPnl(100, 10)).toBe(90);
    });

    it("returns full loss amount (no rake on losses)", () => {
      expect(calculateTraderPnl(-50, 0)).toBe(-50);
    });

    it("returns zero for zero balance change", () => {
      expect(calculateTraderPnl(0, 0)).toBe(0);
    });
  });

  describe("calculatePotChange", () => {
    it("pot grows when trader loses", () => {
      // entry cost goes in, nothing comes out
      expect(calculatePotChange(10, -5)).toBe(10);
    });

    it("pot shrinks when trader wins big", () => {
      // entry cost goes in, winnings come out
      expect(calculatePotChange(10, 50)).toBe(-40);
    });

    it("pot grows by entry cost on zero change", () => {
      expect(calculatePotChange(10, 0)).toBe(10);
    });
  });

  describe("correction trigger", () => {
    it("triggers correction when winnings exceed 25% of pot", () => {
      const { corrected } = capOutcome(60, 200, 10);
      expect(corrected).toBe(true);
    });

    it("triggers correction when loss exceeds entry cost", () => {
      const { corrected } = capOutcome(-20, 200, 10);
      expect(corrected).toBe(true);
    });

    it("does not trigger correction for valid outcome", () => {
      const { corrected } = capOutcome(30, 200, 10);
      expect(corrected).toBe(false);
    });
  });
});
