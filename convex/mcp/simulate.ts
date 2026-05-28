/**
 * Pre-flight viem `simulateContract` wrappers for every on-chain write the MCP
 * surface performs. Each helper simulates the underlying call against the desk
 * CDP smart-account address (`account`) and surfaces revert reasons up the
 * stack as a clear `Error("simulation reverted: ...")`. The caller (always an
 * `internalAction` wrapped by `mcpWriteRoute`) turns the throw into a cached
 * error under the idempotency key — i.e. a retry with the same key returns the
 * same human-readable reason without re-attempting the on-chain submission.
 *
 * Why simulate?
 *   - Catches >90% of failure modes (insufficient USDC, allowlist mismatch,
 *     escrow status, paused contract) before any user-op is submitted.
 *   - Free and fast (single RPC call vs a full user-op submission).
 *   - Gas estimation is intentionally left to CDP — sponsored gas on Base
 *     Sepolia means estimation is best handled by the bundler, not this layer.
 *
 * Smart-account note: viem's `simulateContract` runs against `account` (the
 * desk wallet). For ERC-4337 user-ops the underlying call is the same call
 * the bundler will execute, so a successful simulate is a strong signal that
 * the user-op will succeed (modulo gas/paymaster issues handled by CDP).
 */

import type { Abi } from "viem";

/**
 * Structural shape of the only viem PublicClient method we use. Avoids
 * pulling in the strict `PublicClient` generic instantiation (which causes
 * incompatibility across callers that construct clients with different
 * transport/chain combos).
 */
export type SimClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  simulateContract: (args: any) => Promise<unknown>;
};

const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

const escrowAbi = [
  {
    type: "function",
    name: "depositFor",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createDeal",
    inputs: [
      { name: "prompt", type: "string" },
      { name: "potAmount", type: "uint256" },
      { name: "entryCost", type: "uint256" },
    ],
    outputs: [{ name: "dealId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closeDeal",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

async function simulate(
  client: SimClient,
  label: string,
  address: `0x${string}`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abi: any,
  functionName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[],
  account: `0x${string}`
): Promise<void> {
  try {
    await client.simulateContract({
      address,
      abi,
      functionName,
      args,
      account,
    });
  } catch (err) {
    // Lazy-import the viem error class so this file stays cheap to load.
    const viem = await import("viem");
    const short =
      err instanceof viem.ContractFunctionRevertedError
        ? (err.shortMessage ?? err.message)
        : err instanceof viem.BaseError
          ? err.shortMessage
          : err instanceof Error
            ? err.message
            : String(err);
    throw new Error(`simulation reverted: ${label}: ${short}`);
  }
}

export function simulateUsdcTransfer(
  client: SimClient,
  usdcAddress: `0x${string}`,
  account: `0x${string}`,
  to: `0x${string}`,
  amountAtomic: bigint
): Promise<void> {
  return simulate(
    client,
    "USDC.transfer",
    usdcAddress,
    erc20Abi,
    "transfer",
    [to, amountAtomic],
    account
  );
}

export function simulateUsdcApprove(
  client: SimClient,
  usdcAddress: `0x${string}`,
  account: `0x${string}`,
  spender: `0x${string}`,
  amountAtomic: bigint
): Promise<void> {
  return simulate(
    client,
    "USDC.approve",
    usdcAddress,
    erc20Abi,
    "approve",
    [spender, amountAtomic],
    account
  );
}

export function simulateEscrowDepositFor(
  client: SimClient,
  escrowAddress: `0x${string}`,
  account: `0x${string}`,
  traderId: bigint,
  amountAtomic: bigint
): Promise<void> {
  return simulate(
    client,
    "escrow.depositFor",
    escrowAddress,
    escrowAbi,
    "depositFor",
    [traderId, amountAtomic],
    account
  );
}

export function simulateEscrowTraderWithdraw(
  client: SimClient,
  escrowAddress: `0x${string}`,
  account: `0x${string}`,
  traderId: bigint,
  amountAtomic: bigint
): Promise<void> {
  return simulate(
    client,
    "escrow.withdraw",
    escrowAddress,
    escrowAbi,
    "withdraw",
    [traderId, amountAtomic],
    account
  );
}

export function simulateEscrowCreateDeal(
  client: SimClient,
  escrowAddress: `0x${string}`,
  account: `0x${string}`,
  prompt: string,
  potAtomic: bigint,
  entryCostAtomic: bigint
): Promise<void> {
  return simulate(
    client,
    "escrow.createDeal",
    escrowAddress,
    escrowAbi,
    "createDeal",
    [prompt, potAtomic, entryCostAtomic],
    account
  );
}

export function simulateEscrowCloseDeal(
  client: SimClient,
  escrowAddress: `0x${string}`,
  account: `0x${string}`,
  dealId: bigint
): Promise<void> {
  return simulate(
    client,
    "escrow.closeDeal",
    escrowAddress,
    escrowAbi,
    "closeDeal",
    [dealId],
    account
  );
}
