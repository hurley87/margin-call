import { describe, expect, it } from "vitest";

import {
  KEEPER_ROUND_STATUS,
  KEEPER_THRESHOLDS,
  classifyKeeperAlerts,
  isExpireEligible,
  isFinalizeEligible,
  isKeeperSessionActive,
  isRevealEligible,
  missingCredentialsAlert,
  planKeeperTick,
  type KeeperRoundSnapshot,
  type KeeperSnapshot,
  type KeeperVaultSnapshot,
} from "./crash-keeper";

const ONE_TUSD = 1_000_000n;

function vault(
  overrides: Partial<KeeperVaultSnapshot> = {}
): KeeperVaultSnapshot {
  return {
    shareOperationsFrozen: false,
    oldestBlockingRound: 0n,
    frozenRoundCount: 0n,
    freeLiquidity: 50_000n * ONE_TUSD,
    grossAssets: 50_000n * ONE_TUSD,
    oldestBlockingExpiresAt: null,
    ...overrides,
  };
}

function round(
  overrides: Partial<KeeperRoundSnapshot> & Pick<KeeperRoundSnapshot, "id">
): KeeperRoundSnapshot {
  return {
    status: KEEPER_ROUND_STATUS.uninitialized,
    openAt: 0n,
    lockAt: 0n,
    expiresAt: 0n,
    totalMargin: 0n,
    ...overrides,
  };
}

function snapshot(overrides: Partial<KeeperSnapshot> = {}): KeeperSnapshot {
  return {
    now: 1_000n,
    currentRoundId: 10n,
    rounds: [
      round({ id: 10n, status: KEEPER_ROUND_STATUS.uninitialized }),
      round({ id: 11n, status: KEEPER_ROUND_STATUS.uninitialized }),
    ],
    vault: vault(),
    keeperEthWei: 1n * 10n ** 18n,
    preopenEnabled: false,
    sponsorship: null,
    ...overrides,
  };
}

describe("crash-keeper planner", () => {
  it("emits zero actions when idle (inactive session, no work)", () => {
    const plan = planKeeperTick(snapshot());
    expect(plan.sessionActive).toBe(false);
    expect(plan.actions).toEqual([]);
  });

  it("detects active session from preopen flag or recent demand", () => {
    expect(isKeeperSessionActive(snapshot({ preopenEnabled: true }))).toBe(
      true
    );
    expect(
      isKeeperSessionActive(
        snapshot({
          rounds: [
            round({
              id: 10n,
              status: KEEPER_ROUND_STATUS.open,
              totalMargin: ONE_TUSD,
              openAt: 900n,
              lockAt: 945n,
              expiresAt: 1845n,
            }),
          ],
        })
      )
    ).toBe(true);
    // Margin only on current-3 is outside the lookback window.
    expect(
      isKeeperSessionActive(
        snapshot({
          rounds: [
            round({
              id: 7n,
              status: KEEPER_ROUND_STATUS.finalized,
              totalMargin: ONE_TUSD,
            }),
            round({ id: 10n }),
          ],
        })
      )
    ).toBe(false);
    // Prior-2 (current-2) with margin counts as recent demand.
    expect(
      isKeeperSessionActive(
        snapshot({
          currentRoundId: 10n,
          rounds: [
            round({
              id: 8n,
              status: KEEPER_ROUND_STATUS.expired,
              totalMargin: ONE_TUSD,
            }),
            round({ id: 10n }),
          ],
        })
      )
    ).toBe(true);
  });

  it("prioritizes expiry before reveal and finalize", () => {
    const plan = planKeeperTick(
      snapshot({
        now: 2_000n,
        preopenEnabled: false,
        rounds: [
          round({
            id: 9n,
            status: KEEPER_ROUND_STATUS.revealRequested,
            totalMargin: ONE_TUSD,
            openAt: 800n,
            lockAt: 845n,
            expiresAt: 1_745n,
          }),
          round({
            id: 10n,
            status: KEEPER_ROUND_STATUS.open,
            totalMargin: ONE_TUSD,
            openAt: 900n,
            lockAt: 945n,
            expiresAt: 1_845n,
          }),
          round({
            id: 11n,
            status: KEEPER_ROUND_STATUS.revealRequested,
            totalMargin: ONE_TUSD,
            openAt: 1_000n,
            lockAt: 1_045n,
            expiresAt: 2_045n,
          }),
          // Ticketless past expiry is not keeper work (no vault exposure).
          round({
            id: 8n,
            status: KEEPER_ROUND_STATUS.open,
            totalMargin: 0n,
            openAt: 700n,
            lockAt: 745n,
            expiresAt: 1_645n,
          }),
        ],
      })
    );

    expect(plan.actions.map((a) => a.type)).toEqual([
      "expire",
      "expire",
      "finalize",
    ]);
    expect(plan.actions[0]).toEqual({ type: "expire", roundId: 9n });
    expect(plan.actions[1]).toEqual({ type: "expire", roundId: 10n });
    expect(plan.actions[2]).toEqual({ type: "finalize", roundId: 11n });
  });

  it("skips reveal for ticketless locked rounds", () => {
    expect(
      isRevealEligible(
        round({
          id: 10n,
          status: KEEPER_ROUND_STATUS.open,
          totalMargin: 0n,
          lockAt: 900n,
          expiresAt: 1_800n,
        }),
        1_000n
      )
    ).toBe(false);

    const plan = planKeeperTick(
      snapshot({
        now: 1_000n,
        rounds: [
          round({
            id: 10n,
            status: KEEPER_ROUND_STATUS.open,
            totalMargin: 0n,
            openAt: 900n,
            lockAt: 945n,
            expiresAt: 1_845n,
          }),
        ],
      })
    );
    expect(plan.actions).toEqual([]);
  });

  it("requests reveal for ticketed locked rounds before expiry", () => {
    const locked = round({
      id: 10n,
      status: KEEPER_ROUND_STATUS.open,
      totalMargin: ONE_TUSD,
      openAt: 900n,
      lockAt: 945n,
      expiresAt: 1_845n,
    });
    expect(isRevealEligible(locked, 950n)).toBe(true);
    expect(isRevealEligible(locked, 1_845n)).toBe(false);

    const plan = planKeeperTick(
      snapshot({
        now: 950n,
        rounds: [
          locked,
          round({
            id: 11n,
            status: KEEPER_ROUND_STATUS.open,
            openAt: 960n,
            lockAt: 1_005n,
            expiresAt: 1_905n,
          }),
        ],
      })
    );
    expect(plan.actions).toEqual([{ type: "requestReveal", roundId: 10n }]);
  });

  it("plans finalize without inventing plaintext", () => {
    const revealing = round({
      id: 10n,
      status: KEEPER_ROUND_STATUS.revealRequested,
      totalMargin: ONE_TUSD,
      openAt: 900n,
      lockAt: 945n,
      expiresAt: 1_845n,
    });
    expect(isFinalizeEligible(revealing, 1_000n)).toBe(true);
    expect(isFinalizeEligible(revealing, 1_845n)).toBe(false);

    const plan = planKeeperTick(
      snapshot({
        now: 1_000n,
        rounds: [
          revealing,
          round({
            id: 11n,
            status: KEEPER_ROUND_STATUS.open,
            openAt: 960n,
            lockAt: 1_005n,
            expiresAt: 1_905n,
          }),
        ],
      })
    );
    expect(plan.actions).toEqual([{ type: "finalize", roundId: 10n }]);
    expect(plan.actions[0]).not.toHaveProperty("plaintext");
  });

  it("pre-opens current and next only during active sessions", () => {
    const inactive = planKeeperTick(snapshot({ preopenEnabled: false }));
    expect(inactive.actions).toEqual([]);

    const active = planKeeperTick(snapshot({ preopenEnabled: true }));
    expect(active.sessionActive).toBe(true);
    expect(active.actions).toEqual([
      { type: "openRound", roundId: 10n },
      { type: "openRound", roundId: 11n },
    ]);

    const alreadyOpen = planKeeperTick(
      snapshot({
        preopenEnabled: true,
        rounds: [
          round({
            id: 10n,
            status: KEEPER_ROUND_STATUS.open,
            openAt: 900n,
            lockAt: 945n,
            expiresAt: 1_845n,
          }),
          round({
            id: 11n,
            status: KEEPER_ROUND_STATUS.open,
            openAt: 960n,
            lockAt: 1_005n,
            expiresAt: 1_905n,
          }),
        ],
      })
    );
    expect(alreadyOpen.actions).toEqual([]);
  });

  it("marks exposed rounds expire-eligible after expiresAt", () => {
    const exposed = round({
      id: 10n,
      status: KEEPER_ROUND_STATUS.open,
      totalMargin: ONE_TUSD,
      expiresAt: 1_000n,
    });
    expect(isExpireEligible(exposed, 999n)).toBe(false);
    expect(isExpireEligible(exposed, 1_000n)).toBe(true);
  });
});

describe("crash-keeper alerts", () => {
  it("fires every listed alert kind in a synthetic scenario", () => {
    const alerts = classifyKeeperAlerts(
      snapshot({
        now: 2_000n,
        preopenEnabled: true,
        currentRoundId: 10n,
        keeperEthWei: 1n,
        attestationFailures: [9n],
        sponsorship: {
          failuresInWindow: 2,
          spendWeiInWindow: 100n,
          spendBudgetWei: 50n,
        },
        vault: vault({
          shareOperationsFrozen: true,
          oldestBlockingRound: 8n,
          frozenRoundCount: 1n,
          oldestBlockingExpiresAt: 1_500n,
          freeLiquidity: 1n * ONE_TUSD,
          grossAssets: 11_000n * ONE_TUSD,
        }),
        rounds: [
          round({
            id: 8n,
            status: KEEPER_ROUND_STATUS.revealRequested,
            totalMargin: ONE_TUSD,
            openAt: 500n,
            lockAt: 545n,
            expiresAt: 1_445n,
          }),
          round({
            id: 9n,
            status: KEEPER_ROUND_STATUS.open,
            totalMargin: ONE_TUSD,
            openAt: 800n,
            lockAt: 845n,
            expiresAt: 1_745n,
          }),
          round({ id: 10n, status: KEEPER_ROUND_STATUS.uninitialized }),
        ],
      })
    );

    const kinds = new Set(alerts.map((a) => a.kind));
    expect(kinds.has("delayed_reveal")).toBe(true);
    expect(kinds.has("failed_attestation")).toBe(true);
    expect(kinds.has("expiry_eligibility")).toBe(true);
    expect(kinds.has("freeze_outliving_expiry")).toBe(true);
    expect(kinds.has("low_free_liquidity")).toBe(true);
    expect(kinds.has("entry_floor_approach")).toBe(true);
    expect(kinds.has("low_keeper_eth")).toBe(true);
    expect(kinds.has("stale_preopen")).toBe(true);
    expect(kinds.has("paymaster_failure")).toBe(true);
    expect(kinds.has("paymaster_spend")).toBe(true);
  });

  it("alerts stale pre-open when active players have no open round", () => {
    const alerts = classifyKeeperAlerts(
      snapshot({
        preopenEnabled: true,
        rounds: [round({ id: 10n }), round({ id: 11n })],
      })
    );
    expect(alerts.some((a) => a.kind === "stale_preopen")).toBe(true);
  });

  it("alerts delayed reveal after lockAt + SLA", () => {
    const lockAt = 900n;
    const alerts = classifyKeeperAlerts(
      snapshot({
        now: lockAt + KEEPER_THRESHOLDS.delayedRevealSeconds + 1n,
        rounds: [
          round({
            id: 10n,
            status: KEEPER_ROUND_STATUS.open,
            totalMargin: ONE_TUSD,
            lockAt,
            expiresAt: lockAt + 900n,
          }),
        ],
      })
    );
    expect(alerts.some((a) => a.kind === "delayed_reveal")).toBe(true);
  });

  it("alerts entry floor at 12,500 tUSD", () => {
    const alerts = classifyKeeperAlerts(
      snapshot({
        vault: vault({
          grossAssets: KEEPER_THRESHOLDS.entryFloorAlertAssets - 1n,
        }),
      })
    );
    expect(alerts.some((a) => a.kind === "entry_floor_approach")).toBe(true);
  });

  it("builds a missing-credentials alert for the executor", () => {
    const a = missingCredentialsAlert("KEEPER_PRIVATE_KEY");
    expect(a.kind).toBe("missing_credentials");
    expect(a.severity).toBe("critical");
  });

  it("never treats alerts as settlement actions", () => {
    const plan = planKeeperTick(
      snapshot({
        vault: vault({
          grossAssets: 1n,
          freeLiquidity: 1n,
        }),
        keeperEthWei: 1n,
      })
    );
    expect(plan.actions).toEqual([]);
    expect(plan.alerts.length).toBeGreaterThan(0);
  });
});
