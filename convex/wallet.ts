"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { buildTraderMetadataUrl } from "../src/lib/trader-metadata";

/**
 * Required Convex env vars:
 *   CDP_API_KEY_ID        — Coinbase CDP API key ID
 *   CDP_API_KEY_SECRET    — Coinbase CDP API key secret (PEM)
 *   CDP_WALLET_SECRET     — Coinbase CDP wallet encryption secret
 *   IDENTITY_REGISTRY_ADDRESS — optional; if set must match canonical Base Sepolia registry
 *   BASE_SEPOLIA_RPC_URL or NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL — Base Sepolia JSON-RPC
 *   NEXT_PUBLIC_APP_URL   — public app URL used for ERC-721 metadata
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
    let trader = await ctx.runQuery(internal.traders.loadInternal, {
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

    // CAS: mark creating so concurrent runs are idempotent. markCreating gates
    // on `updatedAt`, which is also bumped by unrelated pipelines (e.g. portrait
    // generation runs concurrently after create). A losing CAS there is NOT a
    // sign another wallet worker grabbed the lease — it just means an unrelated
    // write landed between our read and the CAS. Re-read and retry so wallet
    // provisioning isn't silently stranded in "pending" with no error/retry.
    let acquired = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      acquired = await ctx.runMutation(internal.traders.markCreating, {
        traderId,
        expectedUpdatedAt: trader.updatedAt,
      });
      if (acquired) break;

      const refreshed = await ctx.runQuery(internal.traders.loadInternal, {
        traderId,
      });
      if (!refreshed) return;
      // Genuinely done, or another worker holds a live lease — defer to it.
      if (refreshed.walletStatus === "ready") return;
      if (
        refreshed.walletStatus === "creating" &&
        Date.now() - refreshed.updatedAt < CREATING_LEASE_MS
      ) {
        return;
      }
      trader = refreshed;
    }
    if (!acquired) return;

    // Cosmetic checkpoint reporting for the onboarding checklist UI.
    // Must never abort provisioning.
    const reportStep = async (
      step: "id_minted" | "seat_registered",
      stepTokenId?: number
    ) => {
      try {
        await ctx.runMutation(internal.traders.setWalletStep, {
          traderId,
          step,
          tokenId: stepTokenId,
        });
      } catch (err) {
        console.warn(`setWalletStep(${step}) failed (non-fatal)`, err);
      }
    };

    try {
      // Validate env vars with clear errors instead of opaque SDK failures.
      const cdpApiKeyId = requireEnv("CDP_API_KEY_ID");
      const cdpApiKeySecret = requireEnv("CDP_API_KEY_SECRET");
      const cdpWalletSecret = requireEnv("CDP_WALLET_SECRET");
      const { IDENTITY_REGISTRY_ADDRESS: canonicalIdentityRegistry } =
        await import("./lib/baseSepoliaNetwork");
      const { resolveAddress } = await import("./lib/resolveAddress");
      const identityRegistryAddress = resolveAddress(
        [process.env.IDENTITY_REGISTRY_ADDRESS],
        canonicalIdentityRegistry,
        "IDENTITY_REGISTRY_ADDRESS"
      );
      const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");

      const { CdpClient } = await import("@coinbase/cdp-sdk");
      const { decodeEventLog, encodeFunctionData } = await import("viem");

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
      const agentURI = buildTraderMetadataUrl(appUrl, traderId);
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

      const mintTxHash =
        typeof mintReceipt.transactionHash === "string"
          ? mintReceipt.transactionHash
          : "";
      let transferTxHash = "";

      // Parse Transfer event to get tokenId
      const { getBaseSepoliaPublicClient } = await import("./mcp/deskByo");
      const publicClient = await getBaseSepoliaPublicClient();
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
      await reportStep("id_minted", tokenId);

      // Step 3: Create canonical accounts
      const owner = await cdp.evm.getOrCreateAccount({
        name: `trader-${tokenId}`,
      });
      const smartAccount = await cdp.evm.getOrCreateSmartAccount({
        name: `trader-sa-${tokenId}`,
        owner,
      });
      await reportStep("seat_registered");

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
          transferTxHash =
            typeof transferReceipt.transactionHash === "string"
              ? transferReceipt.transactionHash
              : "";
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            (!msg.includes("initialize smart wallet") &&
              !msg.includes("invalid account nonce") &&
              !msg.includes("AA25")) ||
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
        mintTxHash: mintTxHash || undefined,
        transferTxHash: transferTxHash || undefined,
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
