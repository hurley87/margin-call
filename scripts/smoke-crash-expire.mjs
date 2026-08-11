#!/usr/bin/env node
/**
 * Expire-only follow-up for an already-opened unresolved Crash round.
 */
import {
  ROUND_STATUS,
  readRound,
  sendGameTransaction,
  waitUntil,
} from "./lib/crash-smoke.mjs";

const ROUND_ID = BigInt(process.env.SMOKE_EXPIRE_ROUND_ID ?? "1");

async function main() {
  const round = await readRound(ROUND_ID);
  console.log(
    `round ${ROUND_ID}: status=${round.status} expiresAt=${round.expiresAt}`
  );
  if (round.status === ROUND_STATUS.expired) {
    console.log("already expired");
    return;
  }
  if (round.status === ROUND_STATUS.uninitialized) {
    throw new Error("round is uninitialized");
  }
  if (round.status === ROUND_STATUS.finalized) {
    throw new Error("finalized rounds cannot expire");
  }

  await waitUntil(round.expiresAt, "expiry");
  await sendGameTransaction("expireRound", [ROUND_ID]);

  const expired = await readRound(ROUND_ID);
  console.log(`expired round ${ROUND_ID} status=${expired.status}`);
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
