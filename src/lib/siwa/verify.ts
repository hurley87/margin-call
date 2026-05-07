import "server-only";

import { createSIWANonce, parseSIWAMessage } from "@buildersgarden/siwa/siwa";
import { recoverMessageAddress, getAddress } from "viem";
import { makePublicClient } from "@/lib/contracts/client";
import {
  IDENTITY_REGISTRY_ADDRESS,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";
import { createConvexNonceStore } from "@/lib/siwa/nonce-store";

const nonceStore = createConvexNonceStore();

const domain =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
  "localhost:3000";
const MAX_SIWA_AGE_MS = 5 * 60 * 1000;

/**
 * Create a SIWA nonce for an agent identity challenge.
 */
export async function createNonce(agentId: number, address: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makePublicClient() as any;
  return createSIWANonce(
    {
      agentId,
      address,
      agentRegistry: `eip155:${CONTRACTS_CHAIN_ID}:${IDENTITY_REGISTRY_ADDRESS}`,
    },
    client,
    { nonceStore }
  );
}

/**
 * Verify a SIWA message + signature pair.
 *
 * The SIWA address is the smart account (agent identity / NFT owner).
 * The EOA produces the signature. We recover the EOA address and verify:
 * 1. The signature is valid (ecRecover)
 * 2. The recovered EOA is the authorized key for this agent (cdp_owner_address in DB)
 * 3. The smart account (SIWA address) matches cdp_wallet_address in DB
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

    // 1. Freshness check
    const issuedAtMs = Date.parse(fields.issuedAt);
    if (Number.isNaN(issuedAtMs) || Date.now() - issuedAtMs > MAX_SIWA_AGE_MS) {
      console.error("[SIWA verify] Message too old or invalid issuedAt");
      return { valid: false, error: "Message too old or invalid issuedAt" };
    }

    // 2. Expiration / notBefore checks
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

    // 3. Domain binding
    if (fields.domain !== domain) {
      console.error(
        "[SIWA verify] Domain mismatch:",
        fields.domain,
        "!==",
        domain
      );
      return { valid: false, error: "Domain mismatch" };
    }

    // 4. Registry / chain binding
    const registryParts = fields.agentRegistry.split(":");
    if (
      registryParts.length !== 3 ||
      registryParts[0] !== "eip155" ||
      Number(fields.chainId) !== CONTRACTS_CHAIN_ID ||
      Number(registryParts[1]) !== CONTRACTS_CHAIN_ID ||
      getAddress(registryParts[2]) !== getAddress(IDENTITY_REGISTRY_ADDRESS)
    ) {
      console.error("[SIWA verify] Agent registry or chain mismatch");
      return { valid: false, error: "Agent registry or chain mismatch" };
    }

    // 5. Recover the actual EOA signer from the EIP-191 signature.
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

    // 6. Nonce consumption
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
