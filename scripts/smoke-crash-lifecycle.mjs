#!/usr/bin/env node
/**
 * Base Sepolia lifecycle smoke for MarginCallCrash #343.
 * Opens a round, reveals after lock, attests via Inco, finalizes, and optionally expires.
 */
import { createRequire } from "node:module";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  parseAbi,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// @inco/lightning-js ESM entry is incomplete in 1.0.2; load the CJS build.
const require = createRequire(import.meta.url);
const { Lightning } = require("@inco/lightning-js/lite");

const GAME =
  process.env.SMOKE_GAME_ADDRESS ??
  "0x7DFec2b446DdDB485eb5DDE0C4d0709A4f96bA87";
const RPC = process.env.BASE_SEPOLIA_RPC_URL;
const PK = process.env.OPERATOR_PRIVATE_KEY;
const RUN_EXPIRE = process.env.SMOKE_EXPIRE === "1";

if (!RPC || !PK) {
  throw new Error("BASE_SEPOLIA_RPC_URL and OPERATOR_PRIVATE_KEY are required");
}

const abi = parseAbi([
  "function getFee() view returns (uint256)",
  "function epochOrigin() view returns (uint64)",
  "function currentRoundId() view returns (uint256)",
  "function getRound(uint256 roundId) view returns ((uint256 id, uint64 openAt, uint64 lockAt, uint64 expiresAt, bytes32 crashRandom, uint256 crashPointBps, uint256 totalMargin, uint256 reservedPayout, uint8 status))",
  "function openRound(uint256 roundId) payable",
  "function requestReveal(uint256 roundId)",
  "function finalizeRound(uint256 roundId, uint256 plaintext, bytes[] signatures)",
  "function expireRound(uint256 roundId)",
]);

const incoAddress = "0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624";
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

async function waitUntil(target, label) {
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

async function send(data, value) {
  const hash = await walletClient.sendTransaction({
    to: GAME,
    data,
    value: value ?? 0n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction failed: ${hash}`);
  }
  console.log(`tx ${hash} in block ${receipt.blockNumber}`);
  return hash;
}

async function main() {
  console.log(`game=${GAME}`);
  console.log(`deployer=${account.address}`);

  const epochOrigin = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "epochOrigin",
  });
  await waitUntil(epochOrigin, "epoch");

  const fee = await publicClient.readContract({
    address: incoAddress,
    abi,
    functionName: "getFee",
  });
  console.log(`inco fee=${formatEther(fee)} ETH`);

  const roundId = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "currentRoundId",
  });
  console.log(`currentRoundId=${roundId}`);

  const existing = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "getRound",
    args: [roundId],
  });
  if (existing.status === 0) {
    await send(
      encodeFunctionData({
        abi,
        functionName: "openRound",
        args: [roundId],
      }),
      fee
    );
  } else {
    console.log(`round ${roundId} already status=${existing.status}`);
  }

  const expireRoundId = roundId + 1n;
  const expireExisting = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "getRound",
    args: [expireRoundId],
  });
  if (expireExisting.status === 0) {
    await send(
      encodeFunctionData({
        abi,
        functionName: "openRound",
        args: [expireRoundId],
      }),
      fee
    );
  }

  let round = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "getRound",
    args: [roundId],
  });
  console.log(
    `round ${roundId}: lockAt=${round.lockAt} expiresAt=${round.expiresAt} handle=${round.crashRandom}`
  );

  await waitUntil(round.lockAt, "lock");
  round = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "getRound",
    args: [roundId],
  });
  if (round.status < 2) {
    await send(
      encodeFunctionData({
        abi,
        functionName: "requestReveal",
        args: [roundId],
      })
    );
  }

  const zap = await Lightning.baseSepoliaTestnet({
    hostChainRpcUrls: [RPC],
  });
  console.log("requesting attestedReveal…");
  const attestations = await zap.attestedReveal([round.crashRandom]);
  const attestation = attestations[0];
  if (!attestation) throw new Error("No attestation returned");
  const plaintext = BigInt(attestation.plaintext.value);
  const signatures = attestation.covalidatorSignatures.map((signature) =>
    toHex(signature)
  );
  console.log(`plaintext=${plaintext} signatures=${signatures.length}`);

  await send(
    encodeFunctionData({
      abi,
      functionName: "finalizeRound",
      args: [roundId, plaintext, signatures],
    })
  );

  const finalized = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "getRound",
    args: [roundId],
  });
  console.log(
    `finalized status=${finalized.status} crashPointBps=${finalized.crashPointBps}`
  );
  if (finalized.status !== 3) {
    throw new Error(`Expected Finalized(3), got ${finalized.status}`);
  }
  if (finalized.crashPointBps === 0n) {
    throw new Error("Expected nonzero crashPointBps");
  }

  if (!RUN_EXPIRE) {
    console.log("Skipping expiry wait (set SMOKE_EXPIRE=1 to run).");
    return;
  }

  const expireRound = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "getRound",
    args: [expireRoundId],
  });
  await waitUntil(expireRound.expiresAt, "expiry");
  await send(
    encodeFunctionData({
      abi,
      functionName: "expireRound",
      args: [expireRoundId],
    })
  );
  const expired = await publicClient.readContract({
    address: GAME,
    abi,
    functionName: "getRound",
    args: [expireRoundId],
  });
  console.log(`expired round ${expireRoundId} status=${expired.status}`);
  if (expired.status !== 4) {
    throw new Error(`Expected Expired(4), got ${expired.status}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
