import { describe, expect, it, vi } from "vitest";
import type { Address, Hash, TransactionReceipt } from "viem";

import {
  buildTopUpPlan,
  exitAndRedeemPack,
  redeemExitedPack,
  syncConfirmedTopUp,
  topUpAndSyncPack,
  type RedemptionPhase,
  type RedemptionTransactionAdapter,
  type TopUpPhase,
  type TopUpTransactionAdapter,
} from "./pack-lifecycle";
import {
  createMemoryJournalStorage,
  ensureWorkflow,
} from "./transaction-journal";

const TOKEN_A = "0x0000000000000000000000000000000000000001" as Address;
const HASH_A = `0x${"1".repeat(64)}` as Hash;
const HASH_B = `0x${"2".repeat(64)}` as Hash;
const HASH_C = `0x${"3".repeat(64)}` as Hash;

function receipt(status: "success" | "reverted" = "success") {
  return { status, logs: [] } as unknown as TransactionReceipt;
}

describe("Pack top-up validation", () => {
  it("validates approved additions, balances, allowances, quotes, and projected NAV", () => {
    const plan = buildTopUpPlan(
      [
        {
          symbol: "AMZN",
          address: TOKEN_A,
          decimals: 2,
          value: "2.5",
          approved: true,
          balance: 500n,
          allowance: 249n,
          quote: 25n,
        },
      ],
      50n,
      20n,
      100n
    );

    expect(plan.errors).toEqual([]);
    expect(plan.currentNav).toBe(50n);
    expect(plan.projectedNav).toBe(75n);
    expect(plan.eligible).toBe(true);
    expect(plan.approvals.map((token) => token.symbol)).toEqual(["AMZN"]);
  });

  it("fails closed for unapproved tokens, insufficient balances, stale basket quotes, and ineligible NAV", () => {
    const unapproved = buildTopUpPlan(
      [
        {
          symbol: "AMZN",
          address: TOKEN_A,
          decimals: 2,
          value: "1",
          approved: false,
          balance: 100n,
          allowance: 100n,
          quote: 10n,
        },
      ],
      50n,
      20n,
      100n
    );
    expect(unapproved.errors).toContain(
      "AMZN: token is not currently approved"
    );

    const invalid = buildTopUpPlan(
      [
        {
          symbol: "AMZN",
          address: TOKEN_A,
          decimals: 2,
          value: "2",
          approved: true,
          balance: 100n,
          allowance: 100n,
          quoteError: "live quote unavailable or stale",
        },
      ],
      undefined,
      20n,
      100n,
      "Existing basket quote unavailable or stale"
    );
    expect(invalid.errors).toContain("AMZN: amount exceeds wallet balance");
    expect(invalid.errors).toContain(
      "Existing basket quote unavailable or stale"
    );

    const outside = buildTopUpPlan(
      [
        {
          symbol: "AMZN",
          address: TOKEN_A,
          decimals: 2,
          value: "1",
          approved: true,
          balance: 100n,
          allowance: 100n,
          quote: 60n,
        },
      ],
      50n,
      20n,
      100n
    );
    expect(outside.errors).toContain(
      "Projected Pack NAV is outside the live eligibility band"
    );
  });
});

describe("Pack top-up transaction lifecycle", () => {
  it("confirms approval, top-up, and NAV sync in order", async () => {
    const calls: string[] = [];
    const phases: TopUpPhase[] = [];
    const adapter: TopUpTransactionAdapter = {
      approve: vi.fn(async () => {
        calls.push("approve");
        return HASH_A;
      }),
      topUp: vi.fn(async () => {
        calls.push("topUp");
        return HASH_B;
      }),
      syncPackNav: vi.fn(async () => {
        calls.push("sync");
        return HASH_C;
      }),
      waitForReceipt: vi.fn(async (hash) => {
        calls.push(`receipt:${hash}`);
        return receipt();
      }),
    };
    const addition = {
      symbol: "AMZN",
      address: TOKEN_A,
      amount: 5n,
      allowance: 0n,
      quote: 25n,
    };
    const confirmed = vi.fn();

    await topUpAndSyncPack(
      42n,
      { additions: [addition], approvals: [addition] },
      adapter,
      (phase) => phases.push(phase),
      confirmed
    );

    expect(calls).toEqual([
      "approve",
      `receipt:${HASH_A}`,
      "topUp",
      `receipt:${HASH_B}`,
      "sync",
      `receipt:${HASH_C}`,
    ]);
    expect(confirmed).toHaveBeenCalledOnce();
    expect(phases.map((phase) => phase.kind)).toEqual([
      "approving",
      "approval-pending",
      "topping-up",
      "top-up-pending",
      "syncing",
      "sync-pending",
      "complete",
    ]);
  });

  it("retries sync after a confirmed top-up without repeating the top-up", async () => {
    const topUp = vi.fn().mockResolvedValue(HASH_B);
    const syncPackNav = vi
      .fn()
      .mockRejectedValueOnce(new Error("Sync rejected"))
      .mockResolvedValueOnce(HASH_C);
    const adapter: TopUpTransactionAdapter = {
      approve: vi.fn(),
      topUp,
      syncPackNav,
      waitForReceipt: vi.fn().mockResolvedValue(receipt()),
    };
    const confirmed = vi.fn();
    const addition = {
      symbol: "AMZN",
      address: TOKEN_A,
      amount: 5n,
      allowance: 5n,
      quote: 25n,
    };

    await expect(
      topUpAndSyncPack(
        42n,
        { additions: [addition], approvals: [] },
        adapter,
        () => undefined,
        confirmed
      )
    ).rejects.toThrow("Sync rejected");
    expect(confirmed).toHaveBeenCalledOnce();

    await syncConfirmedTopUp(42n, adapter, () => undefined);
    expect(topUp).toHaveBeenCalledOnce();
    expect(syncPackNav).toHaveBeenCalledTimes(2);
  });

  it("recovers confirmed top-up through NAV sync after remount", async () => {
    const storage = createMemoryJournalStorage();
    const workflow = ensureWorkflow(storage, {
      chainId: 46630,
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      kind: "top-up",
      requestFingerprint: "pack-42-topup",
      context: { tokenId: "42" },
    });
    const journal = { storage, workflowKey: workflow.key };
    const topUp = vi.fn().mockResolvedValue(HASH_B);
    const syncPackNav = vi
      .fn()
      .mockRejectedValueOnce(new Error("wallet unavailable after reload"))
      .mockResolvedValueOnce(HASH_C);
    const adapter: TopUpTransactionAdapter = {
      approve: vi.fn(),
      topUp,
      syncPackNav,
      waitForReceipt: vi.fn().mockResolvedValue(receipt()),
    };
    const addition = {
      symbol: "AMZN",
      address: TOKEN_A,
      amount: 5n,
      allowance: 5n,
      quote: 25n,
    };

    await expect(
      topUpAndSyncPack(
        42n,
        { additions: [addition], approvals: [] },
        adapter,
        () => undefined,
        () => undefined,
        journal
      )
    ).rejects.toThrow("wallet unavailable after reload");
    expect(storage.get(workflow.key)?.completed.topUp).toBe(HASH_B);

    await topUpAndSyncPack(
      42n,
      { additions: [addition], approvals: [] },
      adapter,
      () => undefined,
      () => undefined,
      journal
    );
    expect(topUp).toHaveBeenCalledOnce();
    expect(syncPackNav).toHaveBeenCalledTimes(2);
  });

  it("stops after a reverted top-up receipt", async () => {
    const adapter: TopUpTransactionAdapter = {
      approve: vi.fn(),
      topUp: vi.fn().mockResolvedValue(HASH_B),
      syncPackNav: vi.fn(),
      waitForReceipt: vi.fn().mockResolvedValue(receipt("reverted")),
    };
    const addition = {
      symbol: "AMZN",
      address: TOKEN_A,
      amount: 5n,
      allowance: 5n,
      quote: 25n,
    };

    await expect(
      topUpAndSyncPack(
        42n,
        { additions: [addition], approvals: [] },
        adapter,
        () => undefined,
        () => undefined
      )
    ).rejects.toThrow("Pack top-up transaction reverted");
    expect(adapter.syncPackNav).not.toHaveBeenCalled();
  });
});

describe("Pack redemption transaction lifecycle", () => {
  it("exits a resting Pack before redeeming and confirms both receipts", async () => {
    const phases: RedemptionPhase[] = [];
    const adapter: RedemptionTransactionAdapter = {
      exitPool: vi.fn().mockResolvedValue(HASH_A),
      delistAndRedeem: vi.fn().mockResolvedValue(HASH_B),
      waitForReceipt: vi.fn().mockResolvedValue(receipt()),
    };
    const exited = vi.fn();

    await exitAndRedeemPack(
      42n,
      { isResting: true, isListed: true },
      adapter,
      (phase) => phases.push(phase),
      exited
    );

    expect(adapter.exitPool).toHaveBeenCalledWith(42n);
    expect(adapter.delistAndRedeem).toHaveBeenCalledWith(42n);
    expect(adapter.waitForReceipt).toHaveBeenNthCalledWith(1, HASH_A);
    expect(adapter.waitForReceipt).toHaveBeenNthCalledWith(2, HASH_B);
    expect(exited).toHaveBeenCalledOnce();
    expect(phases.map((phase) => phase.kind)).toEqual([
      "exiting",
      "exit-pending",
      "redeeming",
      "redeem-pending",
      "complete",
    ]);
  });

  it("redeems an already-exited listed Pack directly", async () => {
    const adapter: RedemptionTransactionAdapter = {
      exitPool: vi.fn(),
      delistAndRedeem: vi.fn().mockResolvedValue(HASH_B),
      waitForReceipt: vi.fn().mockResolvedValue(receipt()),
    };

    await exitAndRedeemPack(
      42n,
      { isResting: false, isListed: true },
      adapter,
      () => undefined,
      () => undefined
    );

    expect(adapter.exitPool).not.toHaveBeenCalled();
    expect(adapter.delistAndRedeem).toHaveBeenCalledOnce();
  });

  it("retries redemption after confirmed exit without repeating exit", async () => {
    const exitPool = vi.fn().mockResolvedValue(HASH_A);
    const delistAndRedeem = vi
      .fn()
      .mockRejectedValueOnce(new Error("Redeem rejected"))
      .mockResolvedValueOnce(HASH_B);
    const adapter: RedemptionTransactionAdapter = {
      exitPool,
      delistAndRedeem,
      waitForReceipt: vi.fn().mockResolvedValue(receipt()),
    };
    const exited = vi.fn();

    await expect(
      exitAndRedeemPack(
        42n,
        { isResting: true, isListed: true },
        adapter,
        () => undefined,
        exited
      )
    ).rejects.toThrow("Redeem rejected");
    expect(exited).toHaveBeenCalledOnce();

    await redeemExitedPack(42n, adapter, () => undefined);
    expect(exitPool).toHaveBeenCalledOnce();
    expect(delistAndRedeem).toHaveBeenCalledTimes(2);
  });

  it("recovers a confirmed exit through redemption after remount", async () => {
    const storage = createMemoryJournalStorage();
    const workflow = ensureWorkflow(storage, {
      chainId: 46630,
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      kind: "redemption",
      requestFingerprint: "pack-42-redeem",
      context: { tokenId: "42" },
    });
    const journal = { storage, workflowKey: workflow.key };
    const exitPool = vi.fn().mockResolvedValue(HASH_A);
    const delistAndRedeem = vi
      .fn()
      .mockRejectedValueOnce(new Error("wallet unavailable after reload"))
      .mockResolvedValueOnce(HASH_B);
    const adapter: RedemptionTransactionAdapter = {
      exitPool,
      delistAndRedeem,
      waitForReceipt: vi.fn().mockResolvedValue(receipt()),
    };

    await expect(
      exitAndRedeemPack(
        42n,
        { isResting: true, isListed: true },
        adapter,
        () => undefined,
        () => undefined,
        journal
      )
    ).rejects.toThrow("wallet unavailable after reload");
    expect(storage.get(workflow.key)?.completed.exitPool).toBe(HASH_A);

    await redeemExitedPack(42n, adapter, () => undefined, journal);
    expect(exitPool).toHaveBeenCalledOnce();
    expect(delistAndRedeem).toHaveBeenCalledTimes(2);
  });

  it("does not redeem after a reverted exit receipt", async () => {
    const adapter: RedemptionTransactionAdapter = {
      exitPool: vi.fn().mockResolvedValue(HASH_A),
      delistAndRedeem: vi.fn(),
      waitForReceipt: vi.fn().mockResolvedValue(receipt("reverted")),
    };

    await expect(
      exitAndRedeemPack(
        42n,
        { isResting: true, isListed: true },
        adapter,
        () => undefined,
        () => undefined
      )
    ).rejects.toThrow("Pool exit transaction reverted");
    expect(adapter.delistAndRedeem).not.toHaveBeenCalled();
  });
});
