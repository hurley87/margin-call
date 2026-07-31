import { describe, expect, it, vi } from "vitest";

import {
  PendingTransactionError,
  createMemoryJournalStorage,
  ensureWorkflow,
  runJournaledStep,
} from "./transaction-journal";

const HASH = `0x${"11".repeat(32)}` as const;

describe("Maker transaction journal", () => {
  it("persists the accepted hash before receipt polling and never resubmits after timeout", async () => {
    const storage = createMemoryJournalStorage();
    const workflow = ensureWorkflow(storage, {
      chainId: 46630,
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      kind: "create",
      requestFingerprint: "pack-a",
      context: {},
    });
    const submit = vi.fn().mockResolvedValue(HASH);
    const timeout = vi.fn().mockRejectedValue(new Error("receipt timeout"));

    await expect(
      runJournaledStep({
        storage,
        workflowKey: workflow.key,
        step: "mint",
        action: "mint",
        submit,
        reconcile: timeout,
      })
    ).rejects.toBeInstanceOf(PendingTransactionError);

    expect(storage.get(workflow.key)?.current?.hash).toBe(HASH);
    expect(submit).toHaveBeenCalledOnce();

    const receipt = { status: "success" as const };
    await expect(
      runJournaledStep({
        storage,
        workflowKey: workflow.key,
        step: "mint",
        action: "mint",
        submit,
        reconcile: vi.fn().mockResolvedValue(receipt),
      })
    ).resolves.toMatchObject({ hash: HASH, recovered: true, receipt });
    expect(submit).toHaveBeenCalledOnce();
  });

  it("keeps an RPC-failed accepted hash across a remount-like storage reuse", async () => {
    const storage = createMemoryJournalStorage();
    const workflow = ensureWorkflow(storage, {
      chainId: 46630,
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      kind: "redemption",
      requestFingerprint: "pack-42",
      context: { tokenId: "42" },
    });
    const submit = vi.fn().mockResolvedValue(HASH);
    const args = {
      storage,
      workflowKey: workflow.key,
      step: "exit",
      action: "exitPool" as const,
      submit,
    };

    await expect(
      runJournaledStep({
        ...args,
        reconcile: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
      })
    ).rejects.toMatchObject({ hash: HASH });

    await runJournaledStep({
      ...args,
      reconcile: vi.fn().mockResolvedValue({ status: "success" as const }),
    });
    expect(submit).toHaveBeenCalledOnce();
    expect(storage.get(workflow.key)?.completed.exit).toBe(HASH);
  });
});
