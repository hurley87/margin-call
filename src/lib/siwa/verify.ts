import "server-only";

import { createSIWANonce, parseSIWAMessage } from "@buildersgarden/siwa/siwa";
import { recoverMessageAddress, getAddress } from "viem";
import { createConvexNonceStore } from "@/lib/siwa/nonce-store";

const nonceStore = createConvexNonceStore();

const domain =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
  "localhost:3000";
const MAX_SIWA_AGE_MS = 5 * 60 * 1000;

/** Placeholder registry used until on-chain identity checks return. */
const PLACEHOLDER_AGENT_REGISTRY =
  "eip155:0:0x0000000000000000000000000000000000000000";

/**
 * Create a SIWA nonce for an agent identity challenge.
 * Simplified: no public-client / identity-registry check.
 */
export async function createNonce(agentId: number, address: string) {
  return createSIWANonce(
    {
      agentId,
      address,
      agentRegistry: PLACEHOLDER_AGENT_REGISTRY,
    },
    // createSIWANonce expects a client; stub with a no-op shape when registry
    // checks are disabled.
    {} as never,
    { nonceStore }
  );
}

/**
 * Verify a SIWA message + signature pair (message/signature only).
 * Identity-registry and chain binding checks removed with the contracts teardown.
 */
export async function verifySIWARequest(
  message: string,
  signature: string
): Promise<{
  valid: boolean;
  error?: string;
  agentId?: number;
  address?: string;
  signerAddress?: string;
}> {
  try {
    const fields = parseSIWAMessage(message);

    const issuedAtMs = Date.parse(fields.issuedAt);
    if (Number.isNaN(issuedAtMs) || Date.now() - issuedAtMs > MAX_SIWA_AGE_MS) {
      console.error("[SIWA verify] Message too old or invalid issuedAt");
      return { valid: false, error: "Message too old or invalid issuedAt" };
    }

    if (
      fields.expirationTime &&
      Date.now() > Date.parse(fields.expirationTime)
    ) {
      console.error("[SIWA verify] Message expired");
      return { valid: false, error: "Message expired" };
    }
    if (fields.notBefore && Date.now() < Date.parse(fields.notBefore)) {
      console.error("[SIWA verify] Message not yet valid");
      return { valid: false, error: "Message not yet valid" };
    }

    if (fields.domain !== domain) {
      console.error(
        "[SIWA verify] Domain mismatch:",
        fields.domain,
        "!==",
        domain
      );
      return { valid: false, error: "Domain mismatch" };
    }

    let recoveredAddress: string;
    try {
      recoveredAddress = await recoverMessageAddress({
        message,
        signature: signature as `0x${string}`,
      });
    } catch (err) {
      console.error("[SIWA verify] Failed to recover signer:", err);
      return { valid: false, error: "Failed to recover signer" };
    }

    const nonceOk = await nonceStore.consume(fields.nonce);

    if (!nonceOk) {
      console.error("[SIWA verify] Invalid or already consumed nonce");
      return { valid: false, error: "Invalid or already consumed nonce" };
    }

    return {
      valid: true,
      agentId: fields.agentId,
      address: getAddress(fields.address),
      signerAddress: getAddress(recoveredAddress),
    };
  } catch (err) {
    console.error("[SIWA verify] failed:", err);
    return { valid: false, error: "Malformed SIWA message" };
  }
}
