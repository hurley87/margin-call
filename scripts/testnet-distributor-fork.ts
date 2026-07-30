/**
 * Fork Robinhood testnet and prove Distributor merkle claim (warp past epoch 0).
 *
 * Usage: pnpm testnet:e2e:distributor-fork
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CONTRACTS_DIR, loadEnvLocal } from "./deploy-utils";

type DistributorRecord = {
  address?: string;
  admin?: string;
};

function readDistributorRecord(): DistributorRecord {
  const path = join(
    CONTRACTS_DIR,
    "deployments",
    "robinhood-testnet.distributor.json"
  );
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as DistributorRecord;
}

function main() {
  const env = loadEnvLocal();
  const rpcUrl =
    env.ROBINHOOD_TESTNET_RPC_URL ?? env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL;
  if (!rpcUrl) {
    throw new Error("ROBINHOOD_TESTNET_RPC_URL missing in .env.local");
  }

  const record = readDistributorRecord();
  const distributor =
    env.DISTRIBUTOR_ADDRESS ??
    env.NEXT_PUBLIC_DISTRIBUTOR_ADDRESS ??
    record.address;
  const admin = env.DISTRIBUTOR_ADMIN ?? record.admin;
  if (!distributor) {
    throw new Error("DISTRIBUTOR_ADDRESS missing — deploy first");
  }
  if (!admin) {
    throw new Error(
      "DISTRIBUTOR_ADMIN missing — set in env or deployment record"
    );
  }

  console.log(
    `Forking testnet Distributor claim at ${distributor} (admin=${admin})…`
  );

  const output = execFileSync(
    "forge",
    ["test", "--match-path", "test/ForkDistributorClaim.t.sol", "-vv"],
    {
      cwd: CONTRACTS_DIR,
      env: {
        ...process.env,
        ROBINHOOD_TESTNET_RPC_URL: rpcUrl,
        DISTRIBUTOR_ADDRESS: distributor,
        DISTRIBUTOR_ADMIN: admin,
      },
      encoding: "utf8",
    }
  );
  console.log(output);
}

main();
