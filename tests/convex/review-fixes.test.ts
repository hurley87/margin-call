import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { seedDeskManager, seedActiveTrader, seedDeal } from "./setup";
import {
  verifyEscrowDepositInReceipt,
  verifyEscrowWithdrawalInReceipt,
} from "../../convex/mcp/deskByo";
import {
  classifyResolveEntryRevert,
  ON_CHAIN_TX_RECONCILED_NO_ENTRY,
  reconciledTxHash,
} from "../../convex/agent/onChainSettlement";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("beginEntryRecording", () => {
  it("is idempotent on (traderId, dealId)", async () => {
    process.env.MC_FORCE_MARKET_OPEN = "1";
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const first = await t.mutation(internal.deals.beginEntryRecording, {
      dealId: dealId as never,
      traderId,
      entryCostUsdc: 50,
      onChainDealId: 1,
    });
    const second = await t.mutation(internal.deals.beginEntryRecording, {
      dealId: dealId as never,
      traderId,
      entryCostUsdc: 50,
      onChainDealId: 1,
    });

    expect(second.alreadyClaimed).toBe(true);
    expect(second.entryId).toBe(first.entryId);
    expect(second.paymentId).toMatch(/^pending:/);
  });
});

describe("setWalletForMcp one-way bind", () => {
  it("rejects rebinding to a different address", async () => {
    const t = convexTest(schema, modules);
    const deskId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("deskManagers", {
        subject: "mcp:cdp-wallet:test",
        walletAddress: "0x1111111111111111111111111111111111111111",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.mutation(internal.mcp.desks.setWalletForMcp, {
        deskManagerId: deskId as never,
        walletAddress: "0x2222222222222222222222222222222222222222",
      })
    ).rejects.toThrow(/already bound/);
  });
});

describe("escrow receipt verification", () => {
  it("rejects fund confirm when no Deposit event is present", async () => {
    await expect(
      verifyEscrowDepositInReceipt({ logs: [] } as never, {
        tokenId: 1,
        amountAtomic: BigInt(1_000_000),
      })
    ).rejects.toThrow(/no matching Deposit event/);
  });

  it("rejects withdraw confirm when no Withdrawal event is present", async () => {
    await expect(
      verifyEscrowWithdrawalInReceipt({ logs: [] } as never, {
        tokenId: 1,
        amountAtomic: BigInt(1_000_000),
      })
    ).rejects.toThrow(/no matching Withdrawal event/);
  });
});

describe("on-chain settlement reconciliation", () => {
  it("classifies FIFO and ghost-resolve revert messages", () => {
    expect(classifyResolveEntryRevert("Trader mismatch")).toEqual({
      status: "queue_not_head",
    });
    expect(classifyResolveEntryRevert("No pending entry")).toEqual({
      status: "already_resolved",
      reason: "no_trader_entry",
    });
    expect(classifyResolveEntryRevert("PnL exceeds pot")).toBeNull();
  });

  it("findUnresolvedOnChain skips reconciled sentinel outcomes", async () => {
    process.env.MC_FORCE_MARKET_OPEN = "1";
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t, { onChainDealId: 99 });

    const outcomeId = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId,
      traderPnlUsdc: 10,
    });
    await t.mutation(internal.dealOutcomes.markOnChainResolved, {
      outcomeId: outcomeId as never,
      onChainTxHash: reconciledTxHash("no_trader_entry"),
    });

    const pending = await t.query(internal.dealOutcomes.findUnresolvedOnChain, {
      traderId,
      now: Date.now(),
    });
    expect(pending).toBeNull();
    expect(ON_CHAIN_TX_RECONCILED_NO_ENTRY).toBe("reconciled:no-trader-entry");
  });
});
