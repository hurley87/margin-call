import { describe, expect, it } from "vitest";
import {
  decideReconcile,
  decisionToStatus,
} from "../../convex/lib/chainIntents/reconcile";
import {
  confirmationDepth,
  evaluateReceipt,
} from "../../convex/lib/chainIntents/confirm";
import {
  BASE_SEPOLIA_SLUG,
  ROBINHOOD_TESTNET_SLUG,
} from "../../convex/lib/networks";
import { makeT } from "./setup";
import { internal } from "../../convex/_generated/api";

describe("evaluateReceipt", () => {
  it("confirms a successful receipt", () => {
    expect(
      evaluateReceipt({
        status: "success",
        blockNumber: 10n,
        transactionHash: "0xabc",
      })
    ).toEqual({
      kind: "confirmed",
      blockNumber: 10n,
      status: "success",
    });
  });

  it("marks a reverted receipt", () => {
    expect(
      evaluateReceipt({
        status: "reverted",
        blockNumber: 10n,
        transactionHash: "0xabc",
      }).kind
    ).toBe("reverted");
  });

  it("returns not_found when receipt is missing", () => {
    expect(evaluateReceipt(null).kind).toBe("not_found");
  });
});

describe("confirmationDepth", () => {
  it("uses 1 for robinhood-testnet and 2 for base-sepolia", () => {
    expect(confirmationDepth(ROBINHOOD_TESTNET_SLUG)).toBe(1);
    expect(confirmationDepth(BASE_SEPOLIA_SLUG)).toBe(2);
  });
});

describe("decideReconcile", () => {
  it("confirms when txHash receipt is found", () => {
    const decision = decideReconcile({
      status: "submitted",
      txHash: "0xabc",
      receiptByHash: {
        status: "success",
        blockNumber: 1n,
        transactionHash: "0xabc",
      },
      reconcileAttempts: 0,
    });
    expect(decision.action).toBe("confirm");
    expect(decisionToStatus(decision)).toBe("confirmed");
  });

  it("fails when receipt reverted", () => {
    const decision = decideReconcile({
      status: "reconciling",
      txHash: "0xabc",
      receiptByHash: {
        status: "reverted",
        blockNumber: 1n,
        transactionHash: "0xabc",
      },
      reconcileAttempts: 1,
    });
    expect(decision).toEqual({
      action: "fail",
      txHash: "0xabc",
      reason: "Transaction reverted on-chain",
    });
  });

  it("stays reconciling when receipt absent — never resubmits", () => {
    const decision = decideReconcile({
      status: "submitted",
      txHash: "0xabc",
      receiptByHash: null,
      reconcileAttempts: 0,
    });
    expect(decision.action).toBe("stay_reconciling");
    expect(decisionToStatus(decision)).toBe("reconciling");
  });

  it("confirms via sender nonce when txHash is missing", () => {
    const decision = decideReconcile({
      status: "reconciling",
      txHash: undefined,
      receiptByNonce: {
        status: "success",
        blockNumber: 5n,
        transactionHash: "0xnonce",
      },
      reconcileAttempts: 2,
    });
    expect(decision.action).toBe("confirm");
    if (decision.action === "confirm") {
      expect(decision.txHash).toBe("0xnonce");
    }
  });

  it("abandons after max reconcile attempts", () => {
    const decision = decideReconcile({
      status: "reconciling",
      txHash: "0xabc",
      receiptByHash: null,
      reconcileAttempts: 10,
      maxReconcileAttempts: 10,
    });
    expect(decision.action).toBe("abandon");
  });
});

describe("chainIntents reconcile transitions", () => {
  it("moves submitted → reconciling → confirmed idempotently", async () => {
    const t = makeT();
    const now = Date.now();
    const prepared = await t.mutation(internal.chainIntents.prepare, {
      networkSlug: BASE_SEPOLIA_SLUG,
      intentKey: "reconcile:happy",
      intentType: "fund_trader",
      now,
    });

    await t.mutation(internal.chainIntents.transition, {
      intentId: prepared.intentId,
      to: "submitted",
      txHash: "0xdead",
      now: now + 1,
    });

    await t.mutation(internal.chainIntents.transition, {
      intentId: prepared.intentId,
      to: "reconciling",
      txHash: "0xdead",
      now: now + 2,
    });

    await t.mutation(internal.chainIntents.transition, {
      intentId: prepared.intentId,
      to: "confirmed",
      txHash: "0xdead",
      confirmResult: { reconciled: true },
      now: now + 3,
    });

    // Duplicate confirm is idempotent
    const again = await t.mutation(internal.chainIntents.transition, {
      intentId: prepared.intentId,
      to: "confirmed",
      txHash: "0xdead",
      now: now + 4,
    });
    expect(again.status).toBe("confirmed");

    const row = await t.query(internal.chainIntents.getById, {
      intentId: prepared.intentId,
    });
    expect(row?.status).toBe("confirmed");
    expect(row?.txHash).toBe("0xdead");
  });
});
