/**
 * Typed loader for contracts/deployments/robinhood-testnet.traders.json.
 * Environment-free: no RPC, no env reads.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROBINHOOD_TESTNET_CHAIN_ID } from "./dependencies";

const ROOT = join(import.meta.dirname, "../..");

export const TRADER_DEPLOYMENTS_FILENAME =
  "robinhood-testnet.traders.json" as const;

export const TRADER_DEPLOYMENTS_JSON_PATH = join(
  ROOT,
  "contracts/deployments",
  TRADER_DEPLOYMENTS_FILENAME
);

const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x-prefixed 20-byte address");

const FloorTraderDeploymentSchema = z.object({
  version: z.number().int().positive(),
  chainId: z.literal(ROBINHOOD_TESTNET_CHAIN_ID),
  identity: AddressSchema,
  accountImplementation: AddressSchema,
  delegation: AddressSchema,
  registry: AddressSchema,
  name: z.string().min(1),
  symbol: z.string().min(1),
  baseUri: z.string().min(1),
  deployedAt: z.string().min(1),
  txHash: z.string().optional(),
  blockNumber: z.number().int().nonnegative().optional(),
});

export type FloorTraderDeployment = z.infer<typeof FloorTraderDeploymentSchema>;

const FloorTraderDeploymentsSchema = z.array(FloorTraderDeploymentSchema);

/** Load every recorded Floor Trader deployment, oldest first. */
export function loadFloorTraderDeployments(
  path: string = TRADER_DEPLOYMENTS_JSON_PATH
): FloorTraderDeployment[] {
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return FloorTraderDeploymentsSchema.parse(raw);
}

/** The deployment the app should be pointed at, or null before the first one. */
export function loadActiveFloorTraderDeployment(
  path: string = TRADER_DEPLOYMENTS_JSON_PATH
): FloorTraderDeployment | null {
  const all = loadFloorTraderDeployments(path);
  return all.length > 0 ? (all[all.length - 1] as FloorTraderDeployment) : null;
}
