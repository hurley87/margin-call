import "server-only";

import type { CdpClient } from "@coinbase/cdp-sdk";
import { getCdpClient } from "./client";
import {
  IDENTITY_REGISTRY_ADDRESS,
  ESCROW_ADDRESS,
  identityRegistryAbi,
  escrowAbi,
} from "@/lib/contracts/escrow";
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
 * Called by the smart account (as operator) to authorize the desk manager's wallet.
 */
export async function setDepositorOnChain(
  smartAccount: TraderSmartAccount,
  tokenId: number,
  depositorAddress: string
): Promise<void> {
  await sendContractCall(smartAccount, {
    address: ESCROW_ADDRESS,
    abi: escrowAbi as unknown as import("viem").Abi,
    functionName: "setDepositor",
    args: [BigInt(tokenId), depositorAddress],
  });
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
  // Using ERC-721 transferFrom via the mint smart account
  await sendContractCall(mintSmartAccount, {
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
  });

  return {
    owner,
    smartAccount,
    tokenId,
    cdpOwnerAddress: owner.address,
    cdpWalletAddress: smartAccount.address,
  };
}
