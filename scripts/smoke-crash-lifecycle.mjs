#!/usr/bin/env node
/**
 * Base Sepolia lifecycle smoke for MarginCallCrash #343.
 * Opens a round, reveals after lock, attests via Inco, finalizes, and optionally expires.
 */
import { createRequire } from "node:module";
import { formatEther, toHex } from "viem";
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

// @inco/lightning-js ESM entry is incomplete in 1.0.2; load the CJS build.
const require = createRequire(import.meta.url);
const { Lightning, incoLightningAbi } = require("@inco/lightning-js/lite");

const RUN_EXPIRE = process.env.SMOKE_EXPIRE === "1";

async function main() {
  console.log(`game=${GAME_ADDRESS}`);
  console.log(`deployer=${account.address}`);

  const epochOrigin = await readGame("epochOrigin");
  await waitUntil(epochOrigin, "epoch");

  const fee = await publicClient.readContract({
    address: INCO_LIGHTNING_ADDRESS,
    abi: incoLightningAbi,
    functionName: "getFee",
  });
  console.log(`inco fee=${formatEther(fee)} ETH`);

  const roundId = await readGame("currentRoundId");
  console.log(`currentRoundId=${roundId}`);

  const existing = await readRound(roundId);
  if (existing.status === ROUND_STATUS.uninitialized) {
    await sendGameTransaction("openRound", [roundId], fee);
  } else {
    console.log(`round ${roundId} already status=${existing.status}`);
  }

  const expireRoundId = roundId + 1n;
  const expireExisting = await readRound(expireRoundId);
  if (expireExisting.status === ROUND_STATUS.uninitialized) {
    await sendGameTransaction("openRound", [expireRoundId], fee);
  }

  let round = await readRound(roundId);
  console.log(
    `round ${roundId}: lockAt=${round.lockAt} expiresAt=${round.expiresAt} handle=${round.crashRandom}`
  );

  await waitUntil(round.lockAt, "lock");
  round = await readRound(roundId);
  if (round.status < ROUND_STATUS.revealRequested) {
    await sendGameTransaction("requestReveal", [roundId]);
  }

  const zap = await Lightning.baseSepoliaTestnet({
    hostChainRpcUrls: [RPC_URL],
  });
  // Inco covalidators can lag the onchain Reveal event briefly with ACL denials.
  let attestation = null;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      console.log(`requesting attestedReveal (attempt ${attempt})…`);
      const attestations = await zap.attestedReveal([round.crashRandom]);
      attestation = attestations[0] ?? null;
      if (attestation) break;
    } catch (error) {
      const detail = error?.cause?.message ?? error?.message ?? String(error);
      console.error(`attestedReveal attempt ${attempt} failed: ${detail}`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
  if (!attestation) throw new Error("No attestation returned after retries");
  const plaintext = BigInt(attestation.plaintext.value);
  const signatures = attestation.covalidatorSignatures.map((signature) =>
    toHex(signature)
  );
  console.log(`plaintext=${plaintext} signatures=${signatures.length}`);

  await sendGameTransaction("finalizeRound", [roundId, plaintext, signatures]);

  const finalized = await readRound(roundId);
  console.log(
    `finalized status=${finalized.status} crashPointBps=${finalized.crashPointBps}`
  );
  if (finalized.status !== ROUND_STATUS.finalized) {
    throw new Error(
      `Expected Finalized(${ROUND_STATUS.finalized}), got ${finalized.status}`
    );
  }
  if (finalized.crashPointBps === 0n) {
    throw new Error("Expected nonzero crashPointBps");
  }

  if (!RUN_EXPIRE) {
    console.log("Skipping expiry wait (set SMOKE_EXPIRE=1 to run).");
    return;
  }

  const expireRound = await readRound(expireRoundId);
  await waitUntil(expireRound.expiresAt, "expiry");
  await sendGameTransaction("expireRound", [expireRoundId]);
  const expired = await readRound(expireRoundId);
  console.log(`expired round ${expireRoundId} status=${expired.status}`);
  if (expired.status !== ROUND_STATUS.expired) {
    throw new Error(
      `Expected Expired(${ROUND_STATUS.expired}), got ${expired.status}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
