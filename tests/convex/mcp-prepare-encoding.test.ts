import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseUnits } from "viem";
import {
  MCP_CHAIN,
  serializeCall,
  escrowAbi,
  erc20Abi,
  PREPARE_INSTRUCTIONS,
  type PreparedCall,
} from "../../convex/mcp/escrowConstants";
import { shapePrepareResult } from "../../convex/mcp/intents";
import { BASE_SEPOLIA_SLUG } from "../../convex/lib/baseSepoliaNetwork";
import { makeT, seedDeskManager } from "./setup";
import { internal } from "../../convex/_generated/api";

describe("MCP prepare encoding (#207)", () => {
  it("MCP_CHAIN is Base Sepolia slug", () => {
    expect(MCP_CHAIN).toBe(BASE_SEPOLIA_SLUG);
    expect(MCP_CHAIN).toBe("base-sepolia");
  });

  it("serializeCall hex-encodes value and preserves calldata", () => {
    const call: PreparedCall = {
      to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      value: 0n,
      data: "0xabcdef",
    };
    expect(serializeCall(call)).toEqual({
      to: call.to,
      value: "0x0",
      data: "0xabcdef",
    });
    expect(serializeCall({ ...call, value: 255n }).value).toBe("0xff");
  });

  it("shapePrepareResult returns prepare envelope with chain + calls", () => {
    const shaped = shapePrepareResult(
      {
        intentId: "jd7intent000000000000000000" as never,
        chain: MCP_CHAIN,
        calls: [
          serializeCall({
            to: "0xa244550f0e35032E9c0b09DA4EB4933848d28d16",
            value: 0n,
            data: "0x1234",
          }),
        ],
      },
      "Fund trader"
    );
    expect(shaped).toMatchObject({
      phase: "prepare",
      chain: "base-sepolia",
      instructions: PREPARE_INSTRUCTIONS,
      summary: "Fund trader",
    });
    expect(Array.isArray(shaped.calls)).toBe(true);
    expect((shaped.calls as unknown[])[0]).toMatchObject({
      to: "0xa244550f0e35032E9c0b09DA4EB4933848d28d16",
      value: "0x0",
      data: "0x1234",
    });
  });

  it("shapePrepareResult replays cached confirmed results", () => {
    const shaped = shapePrepareResult(
      {
        intentId: "jd7intent000000000000000000" as never,
        cached: true,
        confirmResult: { ok: true, dealId: "d1" },
      },
      "unused"
    );
    expect(shaped).toEqual({ cached: true, ok: true, dealId: "d1" });
  });

  it("fund_trader calldata encodes approve + depositFor", () => {
    const escrow = "0xa244550f0e35032E9c0b09DA4EB4933848d28d16" as const;
    const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
    const amount = parseUnits("25", 6);
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [escrow, amount],
    });
    const depositData = encodeFunctionData({
      abi: escrowAbi,
      functionName: "depositFor",
      args: [7n, amount],
    });
    expect(approveData.startsWith("0x")).toBe(true);
    expect(depositData.startsWith("0x")).toBe(true);
    expect(approveData).not.toBe(depositData);
  });
});

describe("MCP confirm → intent state (#207)", () => {
  it("markConfirmed upgrades pending intent and rejects txHash reuse", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const now = Date.now();

    const intentId = await t.run(async (ctx) => {
      return ctx.db.insert("mcpIntents", {
        deskManagerId: deskId,
        intentType: "fund_trader",
        chain: MCP_CHAIN,
        calls: [
          {
            to: "0xa244550f0e35032E9c0b09DA4EB4933848d28d16",
            value: "0x0",
            data: "0xdead",
          },
        ],
        payload: { traderId: "t1", amountUsdc: 10 },
        status: "pending",
        expiresAt: now + 3_600_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.mutation(internal.mcp.intents.markConfirmed, {
      intentId,
      txHash: "0xabc123",
      confirmResult: { ok: true, phase: "confirmed" },
      now: now + 1000,
    });

    await t.run(async (ctx) => {
      const row = await ctx.db.get(intentId);
      expect(row?.status).toBe("confirmed");
      expect(row?.txHash).toBe("0xabc123");
      expect(row?.confirmResult).toEqual({ ok: true, phase: "confirmed" });
    });

    const otherId = await t.run(async (ctx) => {
      return ctx.db.insert("mcpIntents", {
        deskManagerId: deskId,
        intentType: "fund_trader",
        chain: MCP_CHAIN,
        calls: [],
        payload: {},
        status: "pending",
        expiresAt: now + 3_600_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.mutation(internal.mcp.intents.markConfirmed, {
        intentId: otherId,
        txHash: "0xabc123",
        confirmResult: { ok: true },
        now: now + 2000,
      })
    ).rejects.toThrow(/txHash has already been used/);
  });
});
