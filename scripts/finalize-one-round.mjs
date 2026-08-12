#!/usr/bin/env node
/**
 * Finalize a single MarginCallCrash round (operator path).
 * Usage: ROUND_ID=3 node scripts/finalize-one-round.mjs
 */
import { createRequire } from "node:module";
import { toHex } from "viem";
import {
  GAME_ADDRESS,
  ROUND_STATUS,
  RPC_URL,
  readRound,
  sendGameTransaction,
  waitUntil,
} from "./lib/crash-smoke.mjs";

const require = createRequire(import.meta.url);
const { Lightning } = require("@inco/lightning-js/lite");

const roundId = BigInt(process.env.ROUND_ID ?? "0");

async function main() {
  let round = await readRound(roundId);
  console.log(`round ${roundId} status=${round.status}`);
  if (round.status === ROUND_STATUS.finalized) {
    console.log("already finalized");
    return;
  }
  if (round.status === ROUND_STATUS.uninitialized) {
    throw new Error("round uninitialized");
  }
  if (round.status === ROUND_STATUS.expired) {
    console.log("expired; nothing to finalize");
    return;
  }

  await waitUntil(round.lockAt, "lock");
  round = await readRound(roundId);
  if (round.status === ROUND_STATUS.finalized) {
    console.log("already finalized after lock");
    return;
  }
  if (round.status < ROUND_STATUS.revealRequested) {
    await sendGameTransaction("requestReveal", [roundId]);
    round = await readRound(roundId);
  }

  const zap = await Lightning.baseSepoliaTestnet({
    hostChainRpcUrls: [RPC_URL],
  });
  let attestation = null;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      console.log(`attestedReveal attempt ${attempt}`);
      const attestations = await zap.attestedReveal([round.crashRandom]);
      attestation = attestations[0] ?? null;
      if (attestation) break;
    } catch (error) {
      console.error(error?.cause?.message ?? error?.message ?? error);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  if (!attestation) throw new Error("attestation unavailable");

  await sendGameTransaction("finalizeRound", [
    roundId,
    BigInt(attestation.plaintext.value),
    attestation.covalidatorSignatures.map((s) => toHex(s)),
  ]);
  const finalized = await readRound(roundId);
  console.log(
    `finalized status=${finalized.status} crashPointBps=${finalized.crashPointBps}`
  );
  if (finalized.status !== ROUND_STATUS.finalized) {
    throw new Error("finalize failed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
