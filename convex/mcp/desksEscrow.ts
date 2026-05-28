"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { assertPerActionCap } from "./limits";
import { simulateUsdcTransfer } from "./simulate";
import { isAllowlisted, normalizeAddress, startOfUtcDay } from "./desks";

type WithdrawToAddressResult = {
  ok: true;
  txHash: string;
  to: string;
  amountUsdc: number;
  dailyUsedAfter: number;
};

/**
 * MCP `withdraw_to_address` — performs USDC transfer via CDP EVM account.
 * Lives in this `"use node"` file (separate from the desks.ts query +
 * mutation, which run in the default Convex isolate) because the CDP SDK
 * pulls in node built-ins like `crypto`. Same split pattern as
 * `dealsEscrow.ts` and `tradersEscrow.ts`.
 *
 * Called only after `mcpWriteRoute` has passed idempotency + auth.
 */
export const withdrawToAddress = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    address: v.string(),
    amountUsdc: v.number(), // human units, e.g. 123.45
  },
  handler: async (
    ctx,
    { deskManagerId, address, amountUsdc }
  ): Promise<WithdrawToAddressResult> => {
    await assertPerActionCap(
      ctx,
      deskManagerId,
      "withdraw_to_address",
      amountUsdc
    );

    const desk = await ctx.runQuery(internal.deskManagers.getByIdInternal, {
      id: deskManagerId,
    });
    if (!desk) throw new Error("Desk not found for withdrawal");

    if ((desk.walletBalanceUsdc ?? 0) < amountUsdc) {
      throw new Error(
        `Insufficient balance: have ${(desk.walletBalanceUsdc ?? 0).toFixed(2)}, requested ${amountUsdc.toFixed(2)} USDC`
      );
    }

    const normDest = normalizeAddress(address);
    if (!isAllowlisted(desk.withdrawAllowlist, normDest)) {
      throw new Error(
        `Destination ${normDest} is not on this desk's withdrawal allowlist. Use register_withdraw_address (after ceremony) to add it.`
      );
    }

    // Daily cap check + reset.
    const now = Date.now();
    const cap = desk.dailyWithdrawCapUsdc ?? 1000;
    let used = desk.dailyWithdrawUsedUsdc ?? 0;
    const lastReset = desk.dailyWithdrawResetAt ?? 0;
    const todayStart = startOfUtcDay(now);
    if (lastReset < todayStart) used = 0;
    if (used + amountUsdc > cap) {
      throw new Error(
        `Daily withdrawal cap exceeded: used ${used.toFixed(2)} + ${amountUsdc.toFixed(2)} > cap ${cap} USDC. Cap resets at UTC midnight.`
      );
    }

    if (!desk.cdpAccountName) {
      throw new Error(
        "Desk CDP account name not recorded; cannot initiate transfer (re-issue key or contact operator)"
      );
    }
    if (!desk.walletAddress) {
      throw new Error("Desk wallet address not provisioned");
    }

    const cdpApiKeyId = process.env.CDP_API_KEY_ID;
    const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;
    const cdpWalletSecret = process.env.CDP_WALLET_SECRET;
    if (!cdpApiKeyId || !cdpApiKeySecret || !cdpWalletSecret) {
      throw new Error(
        "CDP credentials not configured on Convex for withdrawal"
      );
    }

    const { CdpClient } = await import("@coinbase/cdp-sdk");
    const cdp = new CdpClient({
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
      walletSecret: cdpWalletSecret,
    });
    const account = await cdp.evm.getOrCreateAccount({
      name: desk.cdpAccountName,
    });

    // amount in USDC smallest units (6 decimals)
    const amountUnits = BigInt(Math.floor(amountUsdc * 1_000_000));

    const { createPublicClient, http } = await import("viem");
    const { baseSepolia } = await import("viem/chains");
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });
    const USDC_SEPOLIA_ADDRESS =
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

    await simulateUsdcTransfer(
      publicClient,
      USDC_SEPOLIA_ADDRESS,
      account.address as `0x${string}`,
      normDest as `0x${string}`,
      amountUnits
    );

    const { transactionHash } = await account.transfer({
      to: normDest as `0x${string}`,
      amount: amountUnits,
      token: "usdc",
      network: "base-sepolia",
    });

    const newUsed = used + amountUsdc;
    await ctx.runMutation(internal.deskManagers.recordWithdrawUsage, {
      deskManagerId,
      amountUsdc,
      newDailyUsed: newUsed,
      resetAt: todayStart,
      txHash: transactionHash,
    });

    return {
      ok: true as const,
      txHash: transactionHash,
      to: normDest,
      amountUsdc,
      dailyUsedAfter: newUsed,
    };
  },
});
