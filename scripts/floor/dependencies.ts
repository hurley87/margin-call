/**
 * Typed loader for contracts/deployments/robinhood-testnet.dependencies.json.
 * Environment-free: no RPC, no env reads. Issue #248 dependency matrix.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const ROOT = join(import.meta.dirname, "../..");

export const DEPENDENCIES_JSON_PATH = join(
  ROOT,
  "contracts/deployments/robinhood-testnet.dependencies.json"
);

export const ROBINHOOD_TESTNET_CHAIN_ID = 46630 as const;
export const ROBINHOOD_TESTNET_CAIP2 = "eip155:46630" as const;
export const ROBINHOOD_TESTNET_SLUG = "robinhood-testnet" as const;
export const FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID = 4663 as const;

/** Canonical ERC-6551 registry CREATE2 address (chain-independent). */
export const ERC6551_REGISTRY_ADDRESS =
  "0x000000006551c19487814612e58FE06813775758" as const;

const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x-prefixed 20-byte address");

const NullableAddressSchema = z.union([AddressSchema, z.null()]);

export const DependencyStatusSchema = z.enum([
  "canonical",
  "test-asset-fallback",
  "unverified",
]);

export type DependencyStatus = z.infer<typeof DependencyStatusSchema>;

const CandidateReferenceSchema = z.object({
  name: z.string().min(1),
  referenceAddressOtherChain: AddressSchema.optional(),
  referenceChain: z.string().min(1).optional(),
  notes: z.string().optional(),
});

const DependencyEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  status: DependencyStatusSchema,
  label: z.string().min(1),
  address: NullableAddressSchema,
  ticker: z.string().optional(),
  expectedInterfaces: z.array(z.string()),
  decimalsHint: z.number().int().nonnegative().optional(),
  heartbeatSecondsHint: z.number().int().positive().optional(),
  notes: z.string().optional(),
  candidateReference: CandidateReferenceSchema.optional(),
  canonicalMainnetReference: z
    .object({
      address: AddressSchema,
      chainId: z.number().int().positive(),
      notes: z.string().optional(),
    })
    .optional(),
});

export type DependencyEntry = z.infer<typeof DependencyEntrySchema>;

const NetworkSchema = z.object({
  name: z.string().min(1),
  slug: z.literal(ROBINHOOD_TESTNET_SLUG),
  chainId: z.literal(ROBINHOOD_TESTNET_CHAIN_ID),
  caip2: z.literal(ROBINHOOD_TESTNET_CAIP2),
  nativeGasAsset: z.object({
    symbol: z.string().min(1),
    decimals: z.number().int().nonnegative(),
    label: z.string().min(1),
  }),
  rpc: z.object({
    public: z.string().url(),
    alchemyTemplate: z.string().min(1),
    envKey: z.literal("ROBINHOOD_TESTNET_RPC_URL"),
  }),
  websocket: z.object({
    alchemyTemplate: z.string().min(1),
  }),
  sequencer: z.object({
    http: z.string().url(),
    feedWs: z.string().min(1),
  }),
  explorer: z.object({
    browserUrl: z.string().url(),
    apiUrl: z.string().url(),
    verifier: z.string().min(1),
  }),
  faucet: z.string().url(),
  confirmationAssumptions: z.object({
    finalityModel: z.string().min(1),
    recommendWaitBlocks: z.number().int().positive(),
    notes: z.string().min(1),
  }),
  docs: z.object({
    connecting: z.string().url(),
    oracles: z.string().url(),
    contracts: z.string().url(),
  }),
});

export const RobinhoodTestnetDependenciesSchema = z.object({
  version: z.number().int().positive(),
  issue: z.literal(248),
  network: NetworkSchema,
  forbidden: z.object({
    mainnetChainId: z.literal(FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID),
    mainnetCaip2: z.literal("eip155:4663"),
    notes: z.string().min(1),
  }),
  dependencies: z.array(DependencyEntrySchema).min(1),
});

export type RobinhoodTestnetDependencies = z.infer<
  typeof RobinhoodTestnetDependenciesSchema
>;

/** Load and validate the pinned dependency matrix from disk. */
export function loadRobinhoodTestnetDependencies(
  path: string = DEPENDENCIES_JSON_PATH
): RobinhoodTestnetDependencies {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return RobinhoodTestnetDependenciesSchema.parse(raw);
}

/** Look up a dependency by stable id. */
export function getDependency(
  deps: RobinhoodTestnetDependencies,
  id: string
): DependencyEntry | undefined {
  return deps.dependencies.find((entry) => entry.id === id);
}

/** True when chainId is Robinhood Chain testnet. */
export function isRobinhoodTestnetChainId(chainId: string | number): boolean {
  if (typeof chainId === "number") {
    return chainId === ROBINHOOD_TESTNET_CHAIN_ID;
  }
  return (
    chainId === ROBINHOOD_TESTNET_CAIP2 ||
    chainId === String(ROBINHOOD_TESTNET_CHAIN_ID)
  );
}

/** True when chainId is Robinhood Chain mainnet (forbidden for #248). */
export function isForbiddenRobinhoodMainnetChainId(
  chainId: string | number
): boolean {
  if (typeof chainId === "number") {
    return chainId === FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID;
  }
  return (
    chainId === "eip155:4663" ||
    chainId === String(FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID)
  );
}
