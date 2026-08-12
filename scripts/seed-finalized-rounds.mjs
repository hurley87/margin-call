#!/usr/bin/env node
/**
 * Seeds ≥ N finalized Base Sepolia rounds for AC 14 history proof.
 * Uses OPERATOR_PRIVATE_KEY + BASE_SEPOLIA_RPC_URL (not Privy).
 *
 * Usage: SEED_FINALIZED_ROUNDS=20 node scripts/seed-finalized-rounds.mjs
 */
import { createRequire } from "node:module";
import { toHex } from "viem";
import {
  GAME_ADDRESS,
  INCO_LIGHTNING_ADDRESS,
  ROUND_STATUS,
  RPC_URL,
  account,
  publicClient,
  readGame,
  readRound,
  sendGameTransaction,
  waitUntil,
} from "./lib/crash-smoke.mjs";

const require = createRequire(import.meta.url);
const { Lightning, incoLightningAbi } = require("@inco/lightning-js/lite");

const TARGET = Number(process.env.SEED_FINALIZED_ROUNDS ?? "20");

async function ensureOpen(roundId, fee) {
  const existing = await readRound(roundId);
  if (existing.status === ROUND_STATUS.uninitialized) {
    try {
      await sendGameTransaction("openRound", [roundId], fee);
    } catch (error) {
      const message = String(error?.shortMessage ?? error?.message ?? error);
      if (!message.includes("RoundAlreadyInitialized")) throw error;
      console.log(`round ${roundId} already initialized`);
    }
  }
}

/** @returns {Promise<boolean>} true when the round is finalized (or already was). */
async function finalizeRound(roundId) {
  let round = await readRound(roundId);
  if (round.status === ROUND_STATUS.finalized) {
    console.log(`round ${roundId} already finalized`);
    return true;
  }
  if (round.status === ROUND_STATUS.expired) {
    console.log(`round ${roundId} expired; skipping`);
    return true;
  }
  if (round.status === ROUND_STATUS.uninitialized) {
    throw new Error(`round ${roundId} is uninitialized`);
  }

  await waitUntil(round.lockAt, `lock-${roundId}`);
  round = await readRound(roundId);
  if (round.status === ROUND_STATUS.finalized) return true;
  if (round.status < ROUND_STATUS.revealRequested) {
    try {
      await sendGameTransaction("requestReveal", [roundId]);
    } catch (error) {
      const message = String(error?.shortMessage ?? error?.message ?? error);
      // Another keeper may have revealed already.
      if (!/reveal|status|already/i.test(message)) throw error;
      console.log(`requestReveal race on ${roundId}: ${message}`);
    }
    round = await readRound(roundId);
  }

  const zap = await Lightning.baseSepoliaTestnet({
    hostChainRpcUrls: [RPC_URL],
  });
  let attestation = null;
  for (let attempt = 1; attempt <= 24; attempt++) {
    try {
      console.log(`round ${roundId} attestedReveal attempt ${attempt}`);
      const attestations = await zap.attestedReveal([round.crashRandom]);
      attestation = attestations[0] ?? null;
      if (attestation) break;
    } catch (error) {
      const detail = error?.cause?.message ?? error?.message ?? String(error);
      console.error(`attestedReveal failed: ${detail}`);
      await new Promise((resolve) => setTimeout(resolve, 12_000));
    }
  }
  if (!attestation) {
    console.error(
      `No attestation for round ${roundId} after retries; will retry later`
    );
    return false;
  }

  const plaintext = BigInt(attestation.plaintext.value);
  const signatures = attestation.covalidatorSignatures.map((signature) =>
    toHex(signature)
  );
  await sendGameTransaction("finalizeRound", [roundId, plaintext, signatures]);
  const finalized = await readRound(roundId);
  if (finalized.status !== ROUND_STATUS.finalized) {
    throw new Error(`round ${roundId} not finalized (${finalized.status})`);
  }
  console.log(
    `round ${roundId} finalized crashPointBps=${finalized.crashPointBps}`
  );
  return true;
}

async function main() {
  console.log(
    `game=${GAME_ADDRESS} operator=${account.address} target=${TARGET}`
  );
  const epochOrigin = await readGame("epochOrigin");
  await waitUntil(epochOrigin, "epoch");

  const fee = await publicClient.readContract({
    address: INCO_LIGHTNING_ADDRESS,
    abi: incoLightningAbi,
    functionName: "getFee",
  });

  let finalizedCount = 0;
  let roundId = 0n;
  while (finalizedCount < TARGET) {
    const current = await readGame("currentRoundId");
    await ensureOpen(current, fee);
    await ensureOpen(current + 1n, fee);

    if (roundId > current) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      continue;
    }

    const round = await readRound(roundId);
    if (round.status === ROUND_STATUS.finalized) {
      finalizedCount += 1;
      console.log(`progress ${finalizedCount}/${TARGET} (round ${roundId})`);
      roundId += 1n;
      continue;
    }
    if (round.status === ROUND_STATUS.uninitialized) {
      await ensureOpen(roundId, fee);
    }

    const ok = await finalizeRound(roundId);
    if (!ok) {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      continue;
    }
    finalizedCount += 1;
    console.log(`progress ${finalizedCount}/${TARGET}`);
    roundId += 1n;
  }

  console.log(`seeded ${finalizedCount} finalized rounds`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
