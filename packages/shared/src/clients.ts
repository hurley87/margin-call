import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { PAYMENT_CHAIN, PAYMENT_PUBLIC_RPC_URL } from "./chain";

/** Resolve Robinhood testnet RPC (public fallback when env unset). */
export function getRobinhoodRpcUrl(): string {
  return (
    process.env.ROBINHOOD_TESTNET_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL?.trim() ||
    PAYMENT_PUBLIC_RPC_URL
  );
}

/**
 * Shared viem public client for Robinhood Chain testnet reads.
 * Batched reads go through explicit Multicall3 (`client.multicall`, using the
 * canonical address wired on `PAYMENT_CHAIN`); the http transport also batches
 * concurrent JSON-RPC calls on the wire (#322).
 */
export function createRobinhoodPublicClient(): PublicClient {
  return createPublicClient({
    chain: PAYMENT_CHAIN,
    transport: http(getRobinhoodRpcUrl(), { batch: true }),
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
