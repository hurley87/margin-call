import { describe, expect, it, vi } from "vitest";
import type { Address, Hash, TransactionReceipt } from "viem";

import {
  buildPackPlan,
  createAndEnrollPack,
  enrollMintedPack,
  isNavInBand,
  parseTokenAmount,
  transactionPhaseMessage,
  type PackTransactionAdapter,
  type TransactionPhase,
} from "./pack-composer";
import {
  createMemoryJournalStorage,
  ensureWorkflow,
} from "./transaction-journal";

const TOKEN_A = "0x0000000000000000000000000000000000000001" as Address;
const TOKEN_B = "0x0000000000000000000000000000000000000002" as Address;
const HASH_A = `0x${"1".repeat(64)}` as Hash;
const HASH_B = `0x${"2".repeat(64)}` as Hash;
const HASH_C = `0x${"3".repeat(64)}` as Hash;

function receipt(status: "success" | "reverted" = "success") {
  return { status, logs: [] } as unknown as TransactionReceipt;
}

describe("Pack composer amount and NAV validation", () => {
  it("parses decimal strings exactly into raw token units", () => {
    expect(parseTokenAmount("1.25", 6)).toEqual({
      ok: true,
      amount: 1_250_000n,
    });
    expect(parseTokenAmount("0.000001", 6)).toEqual({
      ok: true,
      amount: 1n,
    });
    expect(parseTokenAmount("0", 18)).toEqual({
      ok: false,
      error: "Amount must be greater than zero",
    });
    expect(parseTokenAmount("1.0000001", 6)).toEqual({
      ok: false,
      error: "Maximum 6 decimal places",
    });
    expect(parseTokenAmount("1e3", 18).ok).toBe(false);
  });

  it("uses an inclusive live NAV band", () => {
    expect(isNavInBand(20n, 20n, 300n)).toBe(true);
    expect(isNavInBand(300n, 20n, 300n)).toBe(true);
    expect(isNavInBand(19n, 20n, 300n)).toBe(false);
    expect(isNavInBand(301n, 20n, 300n)).toBe(false);
  });

  it("plans only insufficient allowances and sums quoted NAV", () => {
    const plan = buildPackPlan(
      [
        {
          symbol: "AAA",
          address: TOKEN_A,
          decimals: 2,
          value: "2.5",
          balance: 500n,
          allowance: 249n,
          quote: 25n,
        },
        {
          symbol: "BBB",
          address: TOKEN_B,
          decimals: 2,
          value: "1",
          balance: 100n,
          allowance: 100n,
          quote: 10n,
        },
      ],
      20n,
      300n
    );

    expect(plan.errors).toEqual([]);
    expect(plan.nav).toBe(35n);
    expect(plan.eligible).toBe(true);
    expect(plan.approvals.map((token) => token.symbol)).toEqual(["AAA"]);
  });

  it("rejects empty, zero, over-balance, stale quote, and out-of-band baskets", () => {
    expect(
      buildPackPlan(
        [
          {
            symbol: "AAA",
            address: TOKEN_A,
            decimals: 18,
            value: "",
          },
        ],
        20n,
        300n
      ).errors
    ).toContain("Add at least one Stock Token to the Pack");

    const plan = buildPackPlan(
      [
        {
          symbol: "AAA",
          address: TOKEN_A,
          decimals: 2,
          value: "0",
          balance: 100n,
          allowance: 100n,
        },
        {
          symbol: "BBB",
          address: TOKEN_B,
          decimals: 2,
          value: "2",
          balance: 100n,
          allowance: 100n,
          quoteError: "Testnet price is stale — operator action is required",
        },
      ],
      20n,
      300n
    );

    expect(plan.errors).toContain("AAA: Amount must be greater than zero");
    expect(plan.errors).toContain("BBB: amount exceeds wallet balance");

    const stale = buildPackPlan(
      [
        {
          symbol: "AAA",
          address: TOKEN_A,
          decimals: 2,
          value: "1",
          balance: 100n,
          allowance: 100n,
          quoteError: "Testnet price is stale — operator action is required",
        },
      ],
      20n,
      300n
    );
    expect(stale.errors).toContain(
      "AAA: Testnet price is stale — operator action is required"
    );

    const outside = buildPackPlan(
      [
        {
          symbol: "AAA",
          address: TOKEN_A,
          decimals: 2,
          value: "1",
          balance: 100n,
          allowance: 100n,
          quote: 10n,
        },
      ],
      20n,
      300n
    );
    expect(outside.errors).toContain(
      "Basket NAV is outside the live eligibility band"
    );
  });
});

describe("Pack composer transaction lifecycle", () => {
  it("labels accepted hashes as pending confirmations", () => {
    expect(
      transactionPhaseMessage({
        kind: "approval-pending",
        symbol: "AMZN",
        hash: HASH_A,
      })
    ).toContain("waiting for confirmation");
    expect(
      transactionPhaseMessage({ kind: "mint-pending", hash: HASH_B })
    ).toContain("waiting for confirmation");
    expect(
      transactionPhaseMessage({
        kind: "enrollment-pending",
        tokenId: 42n,
        hash: HASH_C,
      })
    ).toContain("waiting for confirmation");
  });

  it("confirms approvals, mint, decoded token ID, and enrollment in order", async () => {
    const phases: TransactionPhase[] = [];
    const approve = vi.fn().mockResolvedValue(HASH_A);
    const mint = vi.fn().mockResolvedValue(HASH_B);
    const enterPool = vi.fn().mockResolvedValue(HASH_C);
    const waitForReceipt = vi.fn().mockResolvedValue(receipt());
    const adapter: PackTransactionAdapter = {
      approve,
      mint,
      enterPool,
      waitForReceipt,
      getMintedTokenId: () => 42n,
    };
    const token = {
      symbol: "AMZN",
      address: TOKEN_A,
      amount: 5n,
      allowance: 0n,
      quote: 25n,
    };
    let minted: bigint | null = null;

    await expect(
      createAndEnrollPack(
        { selected: [token], approvals: [token] },
        adapter,
        (phase) => phases.push(phase),
        (tokenId) => {
          minted = tokenId;
        }
      )
    ).resolves.toBe(42n);

    expect(approve).toHaveBeenCalledWith(TOKEN_A, 5n);
    expect(mint).toHaveBeenCalledWith([TOKEN_A], [5n]);
    expect(enterPool).toHaveBeenCalledWith(42n);
    expect(waitForReceipt.mock.calls.map(([hash]) => hash)).toEqual([
      HASH_A,
      HASH_B,
      HASH_C,
    ]);
    expect(minted).toBe(42n);
    expect(phases.map((phase) => phase.kind)).toEqual([
      "approving",
      "approval-pending",
      "minting",
      "mint-pending",
      "enrolling",
      "enrollment-pending",
      "complete",
    ]);
  });

  it("preserves a confirmed minted ID when enrollment fails and retries without reminting", async () => {
    const mint = vi.fn().mockResolvedValue(HASH_B);
    const enterPool = vi
      .fn()
      .mockRejectedValueOnce(new Error("User rejected enrollment"))
      .mockResolvedValueOnce(HASH_C);
    const adapter: PackTransactionAdapter = {
      approve: vi.fn(),
      mint,
      enterPool,
      waitForReceipt: vi.fn().mockResolvedValue(receipt()),
      getMintedTokenId: () => 77n,
    };
    const token = {
      symbol: "AMZN",
      address: TOKEN_A,
      amount: 5n,
      allowance: 5n,
      quote: 25n,
    };
    let minted: bigint | null = null;

    await expect(
      createAndEnrollPack(
        { selected: [token], approvals: [] },
        adapter,
        () => undefined,
        (tokenId) => {
          minted = tokenId;
        }
      )
    ).rejects.toThrow("User rejected enrollment");
    expect(minted).toBe(77n);
    expect(mint).toHaveBeenCalledTimes(1);

    await expect(
      enrollMintedPack(77n, adapter, () => undefined)
    ).resolves.toBeUndefined();
    expect(enterPool).toHaveBeenCalledTimes(2);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("recovers a confirmed mint after remount without duplicate submission", async () => {
    const storage = createMemoryJournalStorage();
    const workflow = ensureWorkflow(storage, {
      chainId: 46630,
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      kind: "create",
      requestFingerprint: "pack-77",
      context: {},
    });
    const journal = { storage, workflowKey: workflow.key };
    const mint = vi.fn().mockResolvedValue(HASH_B);
    const enterPool = vi
      .fn()
      .mockRejectedValueOnce(new Error("wallet unavailable after reload"))
      .mockResolvedValueOnce(HASH_C);
    const adapter: PackTransactionAdapter = {
      approve: vi.fn(),
      mint,
      enterPool,
      waitForReceipt: vi.fn().mockResolvedValue(receipt()),
      getMintedTokenId: () => 77n,
    };
    const token = {
      symbol: "AMZN",
      address: TOKEN_A,
      amount: 5n,
      allowance: 5n,
      quote: 25n,
    };

    await expect(
      createAndEnrollPack(
        { selected: [token], approvals: [] },
        adapter,
        () => undefined,
        () => undefined,
        journal
      )
    ).rejects.toThrow("wallet unavailable after reload");
    expect(storage.get(workflow.key)?.completed.mint).toBe(HASH_B);

    await createAndEnrollPack(
      { selected: [token], approvals: [] },
      adapter,
      () => undefined,
      () => undefined,
      journal
    );
    expect(mint).toHaveBeenCalledOnce();
    expect(enterPool).toHaveBeenCalledTimes(2);
  });

  it("does not advance after a reverted receipt", async () => {
    const enterPool = vi.fn();
    const adapter: PackTransactionAdapter = {
      approve: vi.fn().mockResolvedValue(HASH_A),
      mint: vi.fn(),
      enterPool,
      waitForReceipt: vi.fn().mockResolvedValue(receipt("reverted")),
      getMintedTokenId: () => 1n,
    };
    const token = {
      symbol: "AMZN",
      address: TOKEN_A,
      amount: 1n,
      allowance: 0n,
      quote: 20n,
    };

    await expect(
      createAndEnrollPack(
        { selected: [token], approvals: [token] },
        adapter,
        () => undefined,
        () => undefined
      )
    ).rejects.toThrow("AMZN approval transaction reverted");
    expect(adapter.mint).not.toHaveBeenCalled();
    expect(enterPool).not.toHaveBeenCalled();
  });
});
