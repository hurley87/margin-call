#!/usr/bin/env node
/**
 * Forward-only finalized-round seeder for AC 14.
 * Finalizes the current epoch after lock (within expiry), then advances.
 *
 * SEED_FINALIZED_ROUNDS=20 node scripts/seed-forward-finalized.mjs
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

async function countFinalized(maxId) {
  let count = 0;
  for (let id = 0n; id <= maxId; id++) {
    const round = await readRound(id);
    if (round.status === ROUND_STATUS.finalized) count += 1;
  }
  return count;
}

async function ensureOpen(roundId, fee) {
  const existing = await readRound(roundId);
  if (existing.status !== ROUND_STATUS.uninitialized) return existing;
  try {
    await sendGameTransaction("openRound", [roundId], fee);
  } catch (error) {
    const message = String(
      error?.shortMessage ?? error?.details ?? error?.message ?? error
    );
    if (
      !message.includes("RoundAlreadyInitialized") &&
      !message.includes("0x1c346c10") &&
      !message.includes("already")
    ) {
      throw error;
    }
    console.log(`round ${roundId} already open`);
  }
  return readRound(roundId);
}

async function finalizeInWindow(roundId) {
  let round = await readRound(roundId);
  if (round.status === ROUND_STATUS.finalized) return true;
  if (round.status === ROUND_STATUS.expired) return false;
  if (round.status === ROUND_STATUS.uninitialized) return false;

  const block = await publicClient.getBlock({ blockTag: "latest" });
  if (block.timestamp >= round.expiresAt) {
    console.log(`round ${roundId} past expiry; expiring`);
    await sendGameTransaction("expireRound", [roundId]);
    return false;
  }

  await waitUntil(round.lockAt, `lock-${roundId}`);
  round = await readRound(roundId);
  if (round.status === ROUND_STATUS.finalized) return true;

  const latest = await publicClient.getBlock({ blockTag: "latest" });
  if (latest.timestamp >= round.expiresAt) {
    await sendGameTransaction("expireRound", [roundId]);
    return false;
  }

  if (round.status < ROUND_STATUS.revealRequested) {
    await sendGameTransaction("requestReveal", [roundId]);
    round = await readRound(roundId);
  }

  const zap = await Lightning.baseSepoliaTestnet({
    hostChainRpcUrls: [RPC_URL],
  });
  let attestation = null;
  for (let attempt = 1; attempt <= 18; attempt++) {
    try {
      console.log(`round ${roundId} attest attempt ${attempt}`);
      const attestations = await zap.attestedReveal([round.crashRandom]);
      attestation = attestations[0] ?? null;
      if (attestation) break;
    } catch (error) {
      console.error(error?.cause?.message ?? error?.message ?? error);
      await new Promise((r) => setTimeout(r, 8_000));
    }
  }
  if (!attestation) {
    console.error(`attestation miss for ${roundId}`);
    return false;
  }

  await sendGameTransaction("finalizeRound", [
    roundId,
    BigInt(attestation.plaintext.value),
    attestation.covalidatorSignatures.map((s) => toHex(s)),
  ]);
  const finalized = await readRound(roundId);
  console.log(
    `round ${roundId} finalized crashPointBps=${finalized.crashPointBps}`
  );
  return finalized.status === ROUND_STATUS.finalized;
}

async function main() {
  console.log(
    `game=${GAME_ADDRESS} operator=${account.address} target=${TARGET}`
  );
  const fee = await publicClient.readContract({
    address: INCO_LIGHTNING_ADDRESS,
    abi: incoLightningAbi,
    functionName: "getFee",
  });

  let finalized = await countFinalized(await readGame("currentRoundId"));
  console.log(`starting finalized count=${finalized}`);

  while (finalized < TARGET) {
    const current = await readGame("currentRoundId");
    // Keeper already pre-opens with the same EOA — avoid nonce races.
    const round = await readRound(current);
    if (round.status === ROUND_STATUS.uninitialized) {
      console.log(`current ${current} uninitialized; waiting for keeper`);
      await new Promise((r) => setTimeout(r, 8_000));
      continue;
    }

    const ok = await finalizeInWindow(current);
    if (ok) {
      finalized = await countFinalized(current + 5n);
      console.log(`progress finalized=${finalized}/${TARGET}`);
    } else {
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  console.log(`DONE finalized=${finalized}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
