/**
 * Source-verify MarginCallEscrow and/or SeatVault on Base Sepolia (Basescan).
 *
 * Requires:
 *   ETHERSCAN_API_KEY (or BASESCAN_API_KEY) in .env.local / env
 *   Contract address + constructor fields (from env and/or CLI)
 *
 * Usage:
 *   pnpm verify:escrow
 *   pnpm verify:seat-vault
 *   pnpm verify:contracts
 *
 * Escrow env (or flags):
 *   ESCROW_ADDRESS / NEXT_PUBLIC_ESCROW_ADDRESS
 *   SETTLEMENT_OPERATOR_ADDRESS
 *   DEPOSITOR_BINDER_ADDRESS
 *   ENTRY_TIMEOUT_SECONDS (default 3600)
 *
 * SeatVault env:
 *   SEAT_VAULT_ADDRESS / NEXT_PUBLIC_SEAT_VAULT_ADDRESS
 *   ESCROW_ADDRESS / NEXT_PUBLIC_ESCROW_ADDRESS
 *   MARGINCALL_TOKEN / NEXT_PUBLIC_MARGINCALL_TOKEN
 *   SEAT_THRESHOLD, CORNER_THRESHOLD, UNSTAKE_COOLDOWN (optional; defaults match DeploySeatVault.s.sol)
 */
import {
  castAbiEncode,
  loadEnvLocal,
  requireAddress,
  runForgeVerify,
} from "./deploy-utils";
import {
  IDENTITY_REGISTRY_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
} from "../convex/lib/baseSepoliaNetwork";

const DEFAULT_SEAT = "10000000000000000000000";
const DEFAULT_CORNER = "50000000000000000000000";
const DEFAULT_COOLDOWN = "86400";

type Target = "escrow" | "seat-vault" | "all";

function parseTarget(argv: string[]): Target {
  const flag = argv.find((a) => a.startsWith("--target="));
  if (flag) {
    const value = flag.slice("--target=".length);
    if (value === "escrow" || value === "seat-vault" || value === "all") {
      return value;
    }
    throw new Error(`Unknown --target=${value}`);
  }
  if (argv.includes("--escrow")) return "escrow";
  if (argv.includes("--seat-vault")) return "seat-vault";
  return "all";
}

function apiKey(env: Record<string, string>): string {
  // loadEnvLocal already merges these keys from the shell.
  const key = env.ETHERSCAN_API_KEY ?? env.BASESCAN_API_KEY;
  if (!key) {
    throw new Error(
      "ETHERSCAN_API_KEY or BASESCAN_API_KEY required for forge verify-contract"
    );
  }
  return key;
}

/** Verify one contract on Basescan and print its explorer link. */
function verifyContract(opts: {
  name: string;
  address: `0x${string}`;
  contractPath: string;
  constructorArgsHex: string;
  key: string;
}) {
  console.log(`Verifying ${opts.name} at ${opts.address}…`);
  const output = runForgeVerify({
    address: opts.address,
    contractPath: opts.contractPath,
    constructorArgsHex: opts.constructorArgsHex,
    etherscanApiKey: opts.key,
  });
  console.log(output);
  console.log(
    `Explorer: https://sepolia.basescan.org/address/${opts.address}#code`
  );
}

function verifyEscrow(env: Record<string, string>, key: string) {
  const address = requireAddress(
    env.ESCROW_ADDRESS ?? env.NEXT_PUBLIC_ESCROW_ADDRESS,
    "ESCROW_ADDRESS"
  );
  const settlementOperator = requireAddress(
    env.SETTLEMENT_OPERATOR_ADDRESS,
    "SETTLEMENT_OPERATOR_ADDRESS"
  );
  const depositorBinder = requireAddress(
    env.DEPOSITOR_BINDER_ADDRESS,
    "DEPOSITOR_BINDER_ADDRESS"
  );
  const entryTimeout = env.ENTRY_TIMEOUT_SECONDS ?? "3600";

  const constructorArgsHex = castAbiEncode(
    "constructor(address,address,address,address,uint256)",
    [
      USDC_SEPOLIA_ADDRESS,
      IDENTITY_REGISTRY_ADDRESS,
      settlementOperator,
      depositorBinder,
      entryTimeout,
    ]
  );

  verifyContract({
    name: "MarginCallEscrow",
    address,
    contractPath: "src/MarginCallEscrow.sol:MarginCallEscrow",
    constructorArgsHex,
    key,
  });
}

function verifySeatVault(env: Record<string, string>, key: string) {
  const address = requireAddress(
    env.SEAT_VAULT_ADDRESS ?? env.NEXT_PUBLIC_SEAT_VAULT_ADDRESS,
    "SEAT_VAULT_ADDRESS"
  );
  const escrow = requireAddress(
    env.ESCROW_ADDRESS ?? env.NEXT_PUBLIC_ESCROW_ADDRESS,
    "ESCROW_ADDRESS"
  );
  const token = requireAddress(
    env.MARGINCALL_TOKEN ?? env.NEXT_PUBLIC_MARGINCALL_TOKEN,
    "MARGINCALL_TOKEN"
  );
  const seat = env.SEAT_THRESHOLD ?? DEFAULT_SEAT;
  const corner = env.CORNER_THRESHOLD ?? DEFAULT_CORNER;
  const cooldown = env.UNSTAKE_COOLDOWN ?? DEFAULT_COOLDOWN;

  const constructorArgsHex = castAbiEncode(
    "constructor(address,address,uint256,uint256,uint256)",
    [escrow, token, seat, corner, cooldown]
  );

  verifyContract({
    name: "SeatVault",
    address,
    contractPath: "src/SeatVault.sol:SeatVault",
    constructorArgsHex,
    key,
  });
}

function main() {
  const target = parseTarget(process.argv.slice(2));
  const env = loadEnvLocal();
  const key = apiKey(env);

  if (target === "escrow" || target === "all") {
    verifyEscrow(env, key);
  }
  if (target === "seat-vault" || target === "all") {
    verifySeatVault(env, key);
  }
}

main();
