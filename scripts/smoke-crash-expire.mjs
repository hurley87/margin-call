#!/usr/bin/env node
/**
 * Expire-only follow-up for an already-opened unresolved Crash round.
 */
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const GAME =
  process.env.SMOKE_GAME_ADDRESS ??
  "0x7DFec2b446DdDB485eb5DDE0C4d0709A4f96bA87";
const ROUND_ID = BigInt(process.env.SMOKE_EXPIRE_ROUND_ID ?? "1");
const RPC = process.env.BASE_SEPOLIA_RPC_URL;
const PK = process.env.OPERATOR_PRIVATE_KEY;

if (!RPC || !PK) {
  throw new Error("BASE_SEPOLIA_RPC_URL and OPERATOR_PRIVATE_KEY are required");
}

const abi = parseAbi([
  "function getRound(uint256 roundId) view returns ((uint256 id, uint64 openAt, uint64 lockAt, uint64 expiresAt, bytes32 crashRandom, uint256 crashPointBps, uint256 totalMargin, uint256 reservedPayout, uint8 status))",
  "function expireRound(uint256 roundId)",
]);

const account = privateKeyToAccount(PK);
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC),
});
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC),
});

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const round = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "getRound",
    args: [ROUND_ID],
  });
  console.log(
    `round ${ROUND_ID}: status=${round.status} expiresAt=${round.expiresAt}`
  );
  if (round.status === 4) {
    console.log("already expired");
    return;
  }
  if (round.status === 0) {
    throw new Error("round is uninitialized");
  }
  if (round.status === 3) {
    throw new Error("finalized rounds cannot expire");
  }

  for (;;) {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (block.timestamp >= round.expiresAt) break;
    const remaining = Number(round.expiresAt - block.timestamp);
    console.log(`expiry: waiting ${remaining}s (chain=${block.timestamp})`);
    await sleep(Math.min(Math.max(remaining, 1), 20) * 1000);
  }

  const hash = await walletClient.sendTransaction({
    to: GAME,
    data: encodeFunctionData({
      abi,
      functionName: "expireRound",
      args: [ROUND_ID],
    }),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`expire failed: ${hash}`);
  console.log(`expire tx ${hash} in block ${receipt.blockNumber}`);

  const expired = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "getRound",
    args: [ROUND_ID],
  });
  console.log(`expired round ${ROUND_ID} status=${expired.status}`);
  if (expired.status !== 4) {
    throw new Error(`Expected Expired(4), got ${expired.status}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
