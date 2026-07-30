import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { PAYMENT_CHAIN, PAYMENT_PUBLIC_RPC_URL } from "@/lib/privy/config";

/** Resolve Robinhood testnet RPC (public fallback when env unset). */
export function getRobinhoodRpcUrl(): string {
  return (
    process.env.ROBINHOOD_TESTNET_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL?.trim() ||
    PAYMENT_PUBLIC_RPC_URL
  );
}

/** Shared viem public client for Robinhood Chain testnet reads. */
export function createRobinhoodPublicClient(): PublicClient {
  return createPublicClient({
    chain: PAYMENT_CHAIN,
    transport: http(getRobinhoodRpcUrl()),
  });
}

/**
 * Wallet client for server-side minting (Starter Grant).
 * Expects a 0x-prefixed 32-byte private key.
 */
export function createRobinhoodWalletClient(privateKey: Hex): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: PAYMENT_CHAIN,
    transport: http(getRobinhoodRpcUrl()),
  });
}

/** Normalize a private key env value to Hex (adds 0x if missing). */
export function parsePrivateKey(raw: string): Hex {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Private key is empty");
  }
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(withPrefix)) {
    throw new Error("Private key must be a 0x-prefixed 32-byte hex string");
  }
  return withPrefix as Hex;
}
