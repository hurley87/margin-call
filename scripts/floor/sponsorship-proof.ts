/**
 * Independent-wallet signing + sponsorship proof for Robinhood Chain testnet (#248).
 *
 * Proves a non-House key can sign and submit a harmless call. Prefers the
 * intended Privy sponsorship path when configured; otherwise requires an
 * explicit --allow-self-funded flag so the packet can honestly record
 * gas payer === sender.
 *
 * Env:
 *   ROBINHOOD_TESTNET_RPC_URL          required
 *   FLOOR_PROOF_PRIVATE_KEY            required (independently controlled test key)
 *   FLOOR_SPONSORSHIP_MODE             optional: "privy" | "none" (default none)
 *   NEXT_PUBLIC_PRIVY_APP_ID / PRIVY_APP_SECRET  required when mode=privy
 *
 * Usage:
 *   ROBINHOOD_TESTNET_RPC_URL=... FLOOR_PROOF_PRIVATE_KEY=0x... \
 *     pnpm exec tsx scripts/floor/sponsorship-proof.ts --allow-self-funded
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseGwei,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CAIP2,
  ROBINHOOD_TESTNET_SLUG,
} from "./dependencies";
import { assertAllowedChainId } from "./preflight-checks";
import { loadFloorEnvLocal } from "./load-env";

const ROOT = join(import.meta.dirname, "../..");
const EVIDENCE_DIR = join(ROOT, ".floor-evidence");
const EVIDENCE_PATH = join(EVIDENCE_DIR, "sponsorship-proof.json");

type SponsorshipMode = "privy" | "none";

type ProofEvidence = {
  provedAt: string;
  issue: 248;
  network: {
    slug: typeof ROBINHOOD_TESTNET_SLUG;
    chainId: typeof ROBINHOOD_TESTNET_CHAIN_ID;
    caip2: typeof ROBINHOOD_TESTNET_CAIP2;
  };
  sender: `0x${string}`;
  gasPayer: `0x${string}`;
  sponsored: boolean;
  sponsorshipMode: SponsorshipMode;
  txHash: Hex;
  blockNumber: string;
  callKind: "self-zero-transfer";
  notes: string;
  noMainnet: true;
  noRealFunds: true;
};

function parseArgs(argv: string[]): {
  allowSelfFunded: boolean;
  dryRun: boolean;
} {
  return {
    allowSelfFunded: argv.includes("--allow-self-funded"),
    dryRun: argv.includes("--dry-run"),
  };
}

function requireEnv(name: string): string {
  loadFloorEnvLocal();
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required (set in .env.local or the shell)`);
  }
  return value;
}

function requireRpcUrl(): string {
  const url = requireEnv("ROBINHOOD_TESTNET_RPC_URL");
  if (/mainnet\.chain\.robinhood\.com/i.test(url)) {
    throw new Error(
      "ROBINHOOD_TESTNET_RPC_URL points at Robinhood mainnet — refusing proof"
    );
  }
  return url;
}

function requireProofKey(): Hex {
  const key = requireEnv("FLOOR_PROOF_PRIVATE_KEY");
  if (!/^0x[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error(
      "FLOOR_PROOF_PRIVATE_KEY must be a 0x-prefixed 32-byte hex private key"
    );
  }
  // Soft guard: refuse to reuse common operator env names by value check only.
  const operator = process.env.OPERATOR_PRIVATE_KEY?.trim();
  if (operator && operator.toLowerCase() === key.toLowerCase()) {
    throw new Error(
      "FLOOR_PROOF_PRIVATE_KEY must be an independently controlled test wallet — it matches OPERATOR_PRIVATE_KEY"
    );
  }
  return key as Hex;
}

function sponsorshipMode(): SponsorshipMode {
  loadFloorEnvLocal();
  const mode = (process.env.FLOOR_SPONSORSHIP_MODE ?? "none")
    .trim()
    .toLowerCase();
  if (mode === "privy") return "privy";
  if (mode === "none" || mode === "") return "none";
  throw new Error(
    `Unknown FLOOR_SPONSORSHIP_MODE="${mode}" (expected privy|none)`
  );
}

/**
 * Floor intends Privy gas sponsorship on Robinhood Chain testnet (same
 * sendTransaction({ sponsor: true }) pattern as Base Sepolia). When
 * mode=privy, require Privy credentials and fail closed until dashboard
 * sponsorship for chain 46630 is enabled and product wiring lands — do not
 * fake a sponsored receipt. Alchemy Gasless is intentionally not used.
 */
async function submitPrivySponsored(_opts: {
  rpcUrl: string;
  sender: `0x${string}`;
}): Promise<never> {
  void _opts;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error(
      "FLOOR_SPONSORSHIP_MODE=privy requires NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET"
    );
  }
  throw new Error(
    "Privy gas sponsorship on Robinhood Chain testnet is not yet proved in this repository. Enable Robinhood Chain testnet sponsorship in the Privy dashboard, wire Floor writes through sendTransaction({ sponsor: true }), then re-run. Until then record sponsorship as unverified in the #248 packet, or use FLOOR_SPONSORSHIP_MODE=none --allow-self-funded to prove independent signing/submit first."
  );
}

async function submitSelfFundedZeroTransfer(opts: {
  rpcUrl: string;
  privateKey: Hex;
}): Promise<{
  txHash: Hex;
  sender: `0x${string}`;
  gasPayer: `0x${string}`;
  blockNumber: bigint;
}> {
  const account = privateKeyToAccount(opts.privateKey);
  const publicClient = createPublicClient({ transport: http(opts.rpcUrl) });
  const walletClient = createWalletClient({
    account,
    transport: http(opts.rpcUrl),
  });

  const chainId = await publicClient.getChainId();
  assertAllowedChainId(chainId);
  if (chainId === FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID) {
    throw new Error("unreachable: mainnet guard");
  }

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    throw new Error(
      `Proof wallet ${account.address} has zero native balance — fund via https://faucet.testnet.chain.robinhood.com then retry`
    );
  }

  const txHash = await walletClient.sendTransaction({
    chain: {
      id: ROBINHOOD_TESTNET_CHAIN_ID,
      name: "Robinhood Chain Testnet",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [opts.rpcUrl] } },
    },
    to: account.address,
    value: 0n,
    // Cap tip so a misconfigured faucet wallet cannot burn unexpected value.
    maxPriorityFeePerGas: parseGwei("0.01"),
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  if (receipt.status !== "success") {
    throw new Error(`Proof transaction reverted: ${txHash}`);
  }

  return {
    txHash,
    sender: account.address,
    gasPayer: account.address,
    blockNumber: receipt.blockNumber,
  };
}

function writeEvidence(evidence: ProofEvidence): void {
  if (!existsSync(EVIDENCE_DIR)) {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + "\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = sponsorshipMode();

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          chainId: ROBINHOOD_TESTNET_CHAIN_ID,
          sponsorshipMode: mode,
          allowSelfFunded: args.allowSelfFunded,
          evidencePath: EVIDENCE_PATH,
        },
        null,
        2
      )
    );
    return;
  }

  const rpcUrl = requireRpcUrl();
  const privateKey = requireProofKey();

  if (mode === "privy") {
    const account = privateKeyToAccount(privateKey);
    await submitPrivySponsored({ rpcUrl, sender: account.address });
  }

  if (!args.allowSelfFunded) {
    throw new Error(
      "Sponsorship path unavailable/unconfigured. Re-run with --allow-self-funded to prove independent signing and submission (gas payer will equal sender), or set FLOOR_SPONSORSHIP_MODE=privy once Privy Robinhood testnet sponsorship is enabled and wired."
    );
  }

  const result = await submitSelfFundedZeroTransfer({ rpcUrl, privateKey });

  const evidence: ProofEvidence = {
    provedAt: new Date().toISOString(),
    issue: 248,
    network: {
      slug: ROBINHOOD_TESTNET_SLUG,
      chainId: ROBINHOOD_TESTNET_CHAIN_ID,
      caip2: ROBINHOOD_TESTNET_CAIP2,
    },
    sender: result.sender,
    gasPayer: result.gasPayer,
    sponsored: false,
    sponsorshipMode: "none",
    txHash: result.txHash,
    blockNumber: result.blockNumber.toString(),
    callKind: "self-zero-transfer",
    notes:
      "Self-funded harmless 0-value self-transfer. Privy sponsorship remains unverified until FLOOR_SPONSORSHIP_MODE=privy is enabled for Robinhood Chain testnet and proved.",
    noMainnet: true,
    noRealFunds: true,
  };

  writeEvidence(evidence);
  console.log(
    JSON.stringify(
      {
        ok: true,
        evidencePath: EVIDENCE_PATH,
        ...evidence,
      },
      null,
      2
    )
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Sponsorship proof failed: ${message}`);
  process.exitCode = 1;
});
