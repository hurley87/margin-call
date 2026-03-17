import "server-only";

import type { CdpClient } from "@coinbase/cdp-sdk";
import { getCdpClient } from "./client";
import {
  IDENTITY_REGISTRY_ADDRESS,
  ESCROW_ADDRESS,
  identityRegistryAbi,
  escrowAbi,
} from "@/lib/contracts/escrow";
import { makeOperatorWalletClient } from "@/lib/contracts/operator";
import { makePublicClient } from "@/lib/contracts/client";
import { sendContractCall } from "./send-contract-call";

/** The owner account type returned by CDP SDK. */
export type TraderOwnerAccount = Awaited<
  ReturnType<CdpClient["evm"]["getOrCreateAccount"]>
>;

/** The smart account type returned by CDP SDK. */
export type TraderSmartAccount = Awaited<
  ReturnType<CdpClient["evm"]["getOrCreateSmartAccount"]>
>;

/**
 * Get or create a CDP Smart Account for a trader.
 * Each trader gets its own independent Smart Account (ERC-4337)
 * with its own nonce — no contention between concurrent agent cycles.
 *
 * Gas is automatically sponsored on Base Sepolia.
 */
export async function getOrCreateTraderSmartAccount(
  tokenId: number | string
): Promise<{
  owner: TraderOwnerAccount;
  smartAccount: TraderSmartAccount;
  address: string;
}> {
  const cdp = getCdpClient();

  const owner = await cdp.evm.getOrCreateAccount({
    name: `trader-${tokenId}`,
  });

  const smartAccount = await cdp.evm.getOrCreateSmartAccount({
    name: `trader-sa-${tokenId}`,
    owner,
  });

  return { owner, smartAccount, address: smartAccount.address };
}

/**
 * Mint an ERC-8004 identity NFT via a smart account UserOperation.
 * The smart account calls `register(agentURI)` — NFT mints to the smart account address.
 * Gas is sponsored (no ETH funding needed).
 * Returns the tokenId parsed from the Transfer event log.
 */
async function mintTraderNft(
  smartAccount: TraderSmartAccount,
  name: string
): Promise<number> {
  const agentURI = `data:application/json,${JSON.stringify({ name })}`;

  const { transactionHash } = await sendContractCall(smartAccount, {
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi as unknown as import("viem").Abi,
    functionName: "register",
    args: [agentURI],
  });

  // Parse Transfer event from the transaction receipt to get tokenId
  const { createPublicClient, http, decodeEventLog } = await import("viem");
  const { baseSepolia } = await import("viem/chains");
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const receipt = await publicClient.getTransactionReceipt({
    hash: transactionHash as `0x${string}`,
  });

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: identityRegistryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Transfer") {
        return Number((decoded.args as { tokenId: bigint }).tokenId);
      }
    } catch {
      // not our event
    }
  }

  throw new Error("Failed to extract tokenId from mint transaction");
}

/**
 * Set the depositor for a trader on the escrow contract.
 * Called by the operator wallet (already authorized) to avoid race conditions
 * with the smart account's addOperator registration.
 */
export async function setDepositorOnChain(
  tokenId: number,
  depositorAddress: string
): Promise<void> {
  const walletClient = makeOperatorWalletClient();
  const publicClient = makePublicClient();

  const hash = await walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "setDepositor",
    args: [BigInt(tokenId), depositorAddress as `0x${string}`],
  });

  await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Full trader CDP account creation flow:
 * 1. Create a "mint" smart account to mint the NFT (we don't know tokenId yet)
 * 2. Mint NFT via UserOp — NFT owned by the mint smart account, gas sponsored
 * 3. Create the canonical trader-{tokenId} accounts for all future operations
 * 4. Transfer NFT ownership from mint account to canonical account
 *
 * The canonical smart account IS the agent identity.
 */
export async function createTraderCdpAccounts(name: string): Promise<{
  owner: TraderOwnerAccount;
  smartAccount: TraderSmartAccount;
  tokenId: number;
  cdpOwnerAddress: string;
  cdpWalletAddress: string;
}> {
  const cdp = getCdpClient();
  const ts = Date.now();

  // Step 1: Temporary accounts just for minting
  const mintOwner = await cdp.evm.getOrCreateAccount({
    name: `trader-mint-${ts}`,
  });
  const mintSmartAccount = await cdp.evm.getOrCreateSmartAccount({
    name: `trader-sa-mint-${ts}`,
    owner: mintOwner,
  });

  // Step 2: Mint NFT — owned by mintSmartAccount
  const tokenId = await mintTraderNft(mintSmartAccount, name);

  // Step 3: Create canonical accounts (used for all future operations)
  const owner = await cdp.evm.getOrCreateAccount({
    name: `trader-${tokenId}`,
  });
  const smartAccount = await cdp.evm.getOrCreateSmartAccount({
    name: `trader-sa-${tokenId}`,
    owner,
  });

  // Step 4: Transfer NFT from mint account → canonical smart account
  // Using ERC-721 transferFrom via the mint smart account.
  // The CDP backend may still be reconciling the mint account's initialization
  // state after the first UserOp, so retry with backoff on that specific error.
  const transferArgs = {
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: [
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
    ] as unknown as import("viem").Abi,
    functionName: "transferFrom",
    args: [mintSmartAccount.address, smartAccount.address, BigInt(tokenId)],
  };

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await sendContractCall(mintSmartAccount, transferArgs);
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

  return {
    owner,
    smartAccount,
    tokenId,
    cdpOwnerAddress: owner.address,
    cdpWalletAddress: smartAccount.address,
  };
}
