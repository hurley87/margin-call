"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Required Convex env vars:
 *   CDP_API_KEY_ID        — Coinbase CDP API key ID
 *   CDP_API_KEY_SECRET    — Coinbase CDP API key secret (PEM)
 *   CDP_WALLET_SECRET     — Coinbase CDP wallet encryption secret
 *   IDENTITY_REGISTRY_ADDRESS — ERC-8004 identity registry contract address
 *
 * Set via: npx convex env set CDP_API_KEY_ID <value>
 *          npx convex env set CDP_API_KEY_SECRET <value>
 *          npx convex env set CDP_WALLET_SECRET <value>
 *          npx convex env set IDENTITY_REGISTRY_ADDRESS <value>
 */

// If a `creating` job hasn't progressed in this long, treat it as crashed and allow a retry.
const CREATING_LEASE_MS = 5 * 60 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required Convex env var: ${name}`);
  }
  return value;
}

/**
 * Creates a CDP smart account for a trader.
 * Safe to retry: checks walletStatus before acting.
 * Only transitions: pending|creating → ready|error.
 */
export const createForTrader = internalAction({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const trader = await ctx.runQuery(internal.traders.loadInternal, {
      traderId,
    });
    if (!trader) return;
    if (trader.walletStatus === "ready") return; // no-op
    // Re-entry guard: another run is in flight and still within the lease window.
    if (
      trader.walletStatus === "creating" &&
      Date.now() - trader.updatedAt < CREATING_LEASE_MS
    ) {
      return;
    }

    // CAS: mark creating so concurrent runs are idempotent
    await ctx.runMutation(internal.traders.markCreating, { traderId });

    try {
      // Validate env vars with clear errors instead of opaque SDK failures.
      const cdpApiKeyId = requireEnv("CDP_API_KEY_ID");
      const cdpApiKeySecret = requireEnv("CDP_API_KEY_SECRET");
      const cdpWalletSecret = requireEnv("CDP_WALLET_SECRET");
      const identityRegistryAddress = requireEnv(
        "IDENTITY_REGISTRY_ADDRESS"
      ) as `0x${string}`;

      const { CdpClient } = await import("@coinbase/cdp-sdk");
      const { encodeFunctionData } = await import("viem");
      const { createPublicClient, http, decodeEventLog } = await import("viem");
      const { baseSepolia } = await import("viem/chains");

      const cdp = new CdpClient({
        apiKeyId: cdpApiKeyId,
        apiKeySecret: cdpApiKeySecret,
        walletSecret: cdpWalletSecret,
      });

      const identityRegistryAbi = [
        {
          type: "function",
          name: "register",
          inputs: [{ name: "agentURI", type: "string" }],
          outputs: [{ name: "tokenId", type: "uint256" }],
          stateMutability: "nonpayable",
        },
        {
          type: "event",
          name: "Transfer",
          inputs: [
            { name: "from", type: "address", indexed: true },
            { name: "to", type: "address", indexed: true },
            { name: "tokenId", type: "uint256", indexed: true },
          ],
        },
        {
          type: "function",
          name: "transferFrom",
          inputs: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "tokenId", type: "uint256" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ] as const;

      const ts = Date.now();

      // Step 1: Temporary mint accounts
      const mintOwner = await cdp.evm.getOrCreateAccount({
        name: `trader-mint-${ts}`,
      });
      const mintSmartAccount = await cdp.evm.getOrCreateSmartAccount({
        name: `trader-sa-mint-${ts}`,
        owner: mintOwner,
      });

      // Step 2: Mint ERC-8004 identity NFT
      const agentURI = `data:application/json,${JSON.stringify({ name: trader.name })}`;
      const mintData = encodeFunctionData({
        abi: identityRegistryAbi,
        functionName: "register",
        args: [agentURI],
      });

      const { userOpHash: mintOpHash } =
        await mintSmartAccount.sendUserOperation({
          network: "base-sepolia",
          calls: [
            { to: identityRegistryAddress, value: BigInt(0), data: mintData },
          ],
        });
      const mintReceipt = await mintSmartAccount.waitForUserOperation({
        userOpHash: mintOpHash,
      });
      if (mintReceipt.status !== "complete") {
        throw new Error(`Mint UserOp failed: ${mintReceipt.status}`);
      }

      // Parse Transfer event to get tokenId
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: mintReceipt.transactionHash as `0x${string}`,
      });

      let tokenId: number | undefined;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: identityRegistryAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "Transfer") {
            tokenId = Number((decoded.args as { tokenId: bigint }).tokenId);
            break;
          }
        } catch {
          // not our event
        }
      }
      if (tokenId === undefined) {
        throw new Error("Failed to extract tokenId from mint transaction");
      }

      // Step 3: Create canonical accounts
      const owner = await cdp.evm.getOrCreateAccount({
        name: `trader-${tokenId}`,
      });
      const smartAccount = await cdp.evm.getOrCreateSmartAccount({
        name: `trader-sa-${tokenId}`,
        owner,
      });

      // Step 4: Transfer NFT from mint SA → canonical SA
      const transferData = encodeFunctionData({
        abi: identityRegistryAbi,
        functionName: "transferFrom",
        args: [mintSmartAccount.address, smartAccount.address, BigInt(tokenId)],
      });

      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const { userOpHash: transferOpHash } =
            await mintSmartAccount.sendUserOperation({
              network: "base-sepolia",
              calls: [
                {
                  to: identityRegistryAddress,
                  value: BigInt(0),
                  data: transferData,
                },
              ],
            });
          const transferReceipt = await mintSmartAccount.waitForUserOperation({
            userOpHash: transferOpHash,
          });
          if (transferReceipt.status !== "complete") {
            throw new Error(
              `Transfer UserOp failed: ${transferReceipt.status}`
            );
          }
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            !msg.includes("initialize smart wallet") ||
            attempt === MAX_RETRIES - 1
          )
            throw err;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }

      await ctx.runMutation(internal.traders.applyWalletReady, {
        traderId,
        cdpWalletAddress: smartAccount.address,
        cdpOwnerAddress: owner.address,
        cdpAccountName: `trader-sa-${tokenId}`,
        tokenId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.traders.applyWalletError, {
        traderId,
        error: message,
      });
    }
  },
});
