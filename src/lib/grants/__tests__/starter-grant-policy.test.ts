import { describe, expect, it } from "vitest";

import {
  STARTER_GRANT_CONFIG_V1,
  decideRefill,
  decideStarterGrant,
  formatMockUsd,
} from "@/lib/grants/starter-grant-policy";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("decideStarterGrant", () => {
  it("issues a one-time $50 grant to a new wallet", () => {
    const decision = decideStarterGrant(null);
    expect(decision).toEqual({
      kind: "grant",
      amount: STARTER_GRANT_CONFIG_V1.grantAmount,
      configVersion: 1,
    });
    expect(formatMockUsd(decision.kind === "grant" ? decision.amount : 0)).toBe(
      "50.00"
    );
  });

  it("rejects a second grant for the same wallet", () => {
    const decision = decideStarterGrant({
      grantedAt: 1,
      lastRefillAt: null,
      configVersion: 1,
    });
    expect(decision.kind).toBe("already_granted");
  });
});

describe("decideRefill", () => {
  it("requires a prior grant", () => {
    const decision = decideRefill(null, Date.UTC(2026, 6, 30));
    expect(decision.kind).toBe("grant");
  });

  it("blocks refill inside the 24h cooldown from grant time", () => {
    const grantedAt = Date.UTC(2026, 6, 30, 12);
    const decision = decideRefill(
      { grantedAt, lastRefillAt: null, configVersion: 1 },
      grantedAt + DAY_MS - 1
    );
    expect(decision.kind).toBe("cooldown");
    if (decision.kind === "cooldown") {
      expect(decision.availableAt).toBe(grantedAt + DAY_MS);
    }
  });

  it("allows $50 refill after cooldown", () => {
    const grantedAt = Date.UTC(2026, 6, 30, 12);
    const now = grantedAt + DAY_MS;
    const decision = decideRefill(
      { grantedAt, lastRefillAt: null, configVersion: 1 },
      now
    );
    expect(decision).toMatchObject({
      kind: "refill",
      amount: STARTER_GRANT_CONFIG_V1.refillAmount,
    });
  });

  it("uses lastRefillAt as the cooldown anchor when present", () => {
    const grantedAt = Date.UTC(2026, 6, 1);
    const lastRefillAt = Date.UTC(2026, 6, 29, 12);
    const blocked = decideRefill(
      { grantedAt, lastRefillAt, configVersion: 1 },
      lastRefillAt + DAY_MS - 1
    );
    expect(blocked.kind).toBe("cooldown");
    const allowed = decideRefill(
      { grantedAt, lastRefillAt, configVersion: 1 },
      lastRefillAt + DAY_MS
    );
    expect(allowed.kind).toBe("refill");
  });
});
