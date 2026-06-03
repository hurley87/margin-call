import "server-only";

import { getAddress } from "viem";
import {
  createSiweMessage,
  generateSiweNonce,
  parseSiweMessage,
  verifySiweMessage,
} from "viem/siwe";
import { makePublicClient } from "@/lib/contracts/client";
import { CONTRACTS_CHAIN_ID } from "@/lib/contracts/escrow";
import { createConvexNonceStore } from "@/lib/siwa/nonce-store";

const nonceStore = createConvexNonceStore();

export const MCP_BASE_SUBJECT_PREFIX = "mcp:base:" as const;
export const MCP_ISSUE_STATEMENT =
  "Issue Margin Call MCP desk key and bind my Base Account as desk treasury.";

const SIWE_TTL_MS = 5 * 60 * 1000;
const NONCE_ISSUE_RETRIES = 3;

function siweDomain(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
    "localhost:3000"
  );
}

function siweUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ?? "http://localhost:3000";
}

/** Desk subject for a Base Account that signed the SIWE issuance challenge. */
export function mcpBaseSubject(address: string): string {
  return `${MCP_BASE_SUBJECT_PREFIX}${getAddress(address).toLowerCase()}`;
}

export function buildDeskSiweMessage(params: {
  address: string;
  nonce: string;
  issuedAt?: Date;
  expirationTime?: Date;
}): string {
  const issuedAt = params.issuedAt ?? new Date();
  const expirationTime =
    params.expirationTime ?? new Date(issuedAt.getTime() + SIWE_TTL_MS);

  return createSiweMessage({
    address: getAddress(params.address),
    chainId: CONTRACTS_CHAIN_ID,
    domain: siweDomain(),
    nonce: params.nonce,
    uri: siweUri(),
    version: "1",
    statement: MCP_ISSUE_STATEMENT,
    issuedAt,
    expirationTime,
  });
}

/**
 * Issue a one-time SIWE challenge for MCP key creation. The agent signs this
 * with Base MCP `sign` (personal_sign / EIP-191) and submits it to POST /api/mcp/keys.
 */
export async function issueDeskSiweChallenge(address: string): Promise<{
  message: string;
  nonce: string;
  expiresInSeconds: number;
}> {
  const normalized = getAddress(address);
  const issuedAt = new Date();
  const expirationTime = new Date(issuedAt.getTime() + SIWE_TTL_MS);

  for (let attempt = 0; attempt < NONCE_ISSUE_RETRIES; attempt++) {
    const nonce = generateSiweNonce();
    const issued = await nonceStore.issue(nonce, SIWE_TTL_MS);
    if (!issued) continue;

    const message = buildDeskSiweMessage({
      address: normalized,
      nonce,
      issuedAt,
      expirationTime,
    });

    return {
      message,
      nonce,
      expiresInSeconds: Math.floor(SIWE_TTL_MS / 1000),
    };
  }

  throw new Error("Failed to issue SIWE nonce after retries");
}

export type VerifyDeskSiweResult =
  | { valid: true; address: `0x${string}` }
  | { valid: false; error: string };

/**
 * Verify a SIWE message + signature from a Base Account (EIP-1271 / ERC-6492).
 * Consumes the nonce on success.
 */
export async function verifyDeskSiwe(params: {
  message: string;
  signature: string;
}): Promise<VerifyDeskSiweResult> {
  try {
    const parsed = parseSiweMessage(params.message);
    if (!parsed.address) {
      return { valid: false, error: "Missing address in SIWE message" };
    }

    if (parsed.chainId !== CONTRACTS_CHAIN_ID) {
      return { valid: false, error: "Chain ID mismatch" };
    }

    if (parsed.domain !== siweDomain()) {
      return { valid: false, error: "Domain mismatch" };
    }

    if (parsed.statement !== MCP_ISSUE_STATEMENT) {
      return { valid: false, error: "Statement mismatch" };
    }

    const nonce = parsed.nonce;
    if (!nonce) {
      return { valid: false, error: "Missing nonce" };
    }

    const now = new Date();
    if (parsed.expirationTime && now > new Date(parsed.expirationTime)) {
      return { valid: false, error: "Message expired" };
    }
    if (parsed.notBefore && now < new Date(parsed.notBefore)) {
      return { valid: false, error: "Message not yet valid" };
    }

    const address = getAddress(parsed.address);
    const client = makePublicClient();

    const verified = await verifySiweMessage(client, {
      address,
      domain: siweDomain(),
      message: params.message,
      nonce,
      signature: params.signature as `0x${string}`,
      time: now,
    });

    if (!verified) {
      return { valid: false, error: "Invalid signature" };
    }

    const nonceOk = await nonceStore.consume(nonce);
    if (!nonceOk) {
      return { valid: false, error: "Invalid or already consumed nonce" };
    }

    return { valid: true, address };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SIWE verification failed";
    return { valid: false, error: msg };
  }
}
