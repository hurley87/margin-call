/**
 * Dependency invariant: SeatVault / tier / staking modules must not be imported
 * by deal selection, outcome resolution prompts, probability, payout, or rake
 * code paths (issue #190 / PRD #187).
 *
 * Capacity scheduling may use seatVault; ranking and economic outcomes must not.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");

const FORBIDDEN_MODULES = [
  "convex/agent/dealSelection.ts",
  "convex/agent/outcomeResolver.ts",
  "convex/agent/_evaluator.ts",
  "convex/agent/_constants.ts",
  "convex/agent/_schemas.ts",
] as const;

/** Import paths / identifiers that would leak staking into economic logic. */
const FORBIDDEN_PATTERNS = [
  /from\s+["'].*seatVault/i,
  /from\s+["'].*\/capacity["']/i,
  /seatVault\//i,
  /readTierOf/,
  /TIER_CAPACITY/,
  /capacityForTier/,
  /traderSeatState/,
  /effectiveTier/,
  /SeatTierName/,
  /CornerOffice/,
  /\$BLOW/,
] as const;

describe("blow capacity invariants", () => {
  it("forbids seatVault/tier imports in selection, resolution, probability, payout, rake modules", () => {
    const violations: string[] = [];

    for (const rel of FORBIDDEN_MODULES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${rel} matches ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps RAKE_PERCENTAGE and win probability constants free of tier coupling", () => {
    const constants = readFileSync(
      join(ROOT, "convex/agent/_constants.ts"),
      "utf8"
    );
    expect(constants).toMatch(/RAKE_PERCENTAGE\s*=\s*10/);
    expect(constants).toMatch(/BASE_WIN_PROBABILITY/);
    expect(constants).not.toMatch(/tier/i);
    expect(constants).not.toMatch(/seat/i);
    expect(constants).not.toMatch(/blow/i);
  });
});
