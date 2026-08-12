/**
 * Shared plumbing for MarginCallCrash Base Sepolia smoke scripts.
 * Addresses default to contracts/deployments/base_sepolia.json so a redeploy
 * only moves the curated record; SMOKE_GAME_ADDRESS stays as an override.
 */
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const deployments = JSON.parse(
  readFileSync(
    new URL("../../contracts/deployments/base_sepolia.json", import.meta.url),
    "utf8"
  )
);

export const GAME_ADDRESS =
  process.env.SMOKE_GAME_ADDRESS ?? deployments.marginCallCrash;
export const INCO_LIGHTNING_ADDRESS = deployments.incoLightning;

/** Mirrors MarginCallCrash.RoundStatus. */
export const ROUND_STATUS = {
  uninitialized: 0,
  open: 1,
  revealRequested: 2,
  finalized: 3,
  expired: 4,
};

export const gameAbi = parseAbi([
  "function epochOrigin() view returns (uint64)",
  "function currentRoundId() view returns (uint256)",
  "function getRound(uint256 roundId) view returns ((uint256 id, uint64 openAt, uint64 lockAt, uint64 expiresAt, bytes32 crashRandom, uint256 crashPointBps, uint256 totalMargin, uint256 reservedPayout, uint8 status))",
  "function openRound(uint256 roundId) payable",
  "function requestReveal(uint256 roundId)",
  "function finalizeRound(uint256 roundId, uint256 plaintext, bytes[] signatures)",
  "function expireRound(uint256 roundId)",
]);

export const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;
const PK = process.env.OPERATOR_PRIVATE_KEY;

if (!RPC_URL || !PK) {
  throw new Error("BASE_SEPOLIA_RPC_URL and OPERATOR_PRIVATE_KEY are required");
}

export const account = privateKeyToAccount(PK);
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});
export const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC_URL),
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntil(target, label) {
  for (;;) {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (block.timestamp >= target) {
      console.log(`${label}: reached ${target}`);
      return;
    }
    const remaining = Number(target - block.timestamp);
    console.log(`${label}: waiting ${remaining}s (chain=${block.timestamp})`);
    await sleep(Math.min(Math.max(remaining, 1), 15) * 1000);
  }
}

export function readGame(functionName, args = []) {
  return publicClient.readContract({
    address: GAME_ADDRESS,
    abi: gameAbi,
    functionName,
    args,
  });
}

export function readRound(roundId) {
  return readGame("getRound", [roundId]);
}

export async function sendGameTransaction(functionName, args, value = 0n) {
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  const hash = await walletClient.sendTransaction({
    to: GAME_ADDRESS,
    data: encodeFunctionData({ abi: gameAbi, functionName, args }),
    value,
    nonce,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction failed: ${hash}`);
  }
  console.log(`tx ${hash} in block ${receipt.blockNumber}`);
  return hash;
}
