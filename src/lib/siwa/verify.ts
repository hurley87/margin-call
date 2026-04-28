import "server-only";

import { createSIWANonce, parseSIWAMessage } from "@buildersgarden/siwa/siwa";
import { recoverMessageAddress, getAddress } from "viem";
import { makePublicClient } from "@/lib/contracts/client";
import {
  IDENTITY_REGISTRY_ADDRESS,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";
import { createConvexNonceStore } from "@/lib/siwa/nonce-store";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { internal } from "../../../convex/_generated/api";

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
 * 2. The recovered EOA is the authorized key for this agent (cdpOwnerAddress in Convex)
 * 3. The smart account (SIWA address) matches cdpWalletAddress in Convex
 */
export async function verifySIWARequest(
  message: string,
  signature: string
): Promise<{ valid: boolean; agentId?: number; address?: string }> {
  try {
    const fields = parseSIWAMessage(message);

    // 1. Freshness check
    const issuedAtMs = Date.parse(fields.issuedAt);
    if (Number.isNaN(issuedAtMs) || Date.now() - issuedAtMs > MAX_SIWA_AGE_MS) {
      console.error("[SIWA verify] Message too old or invalid issuedAt");
      return { valid: false };
    }

    // 2. Expiration / notBefore checks
    if (
      fields.expirationTime &&
      Date.now() > Date.parse(fields.expirationTime)
    ) {
      console.error("[SIWA verify] Message expired");
      return { valid: false };
    }
    if (fields.notBefore && Date.now() < Date.parse(fields.notBefore)) {
      console.error("[SIWA verify] Message not yet valid");
      return { valid: false };
    }

    // 3. Domain binding
    if (fields.domain !== domain) {
      console.error(
        "[SIWA verify] Domain mismatch:",
        fields.domain,
        "!==",
        domain
      );
      return { valid: false };
    }

    // 4. Recover the actual EOA signer from the EIP-191 signature
    let recoveredAddress: string;
    try {
      recoveredAddress = await recoverMessageAddress({
        message,
        signature: signature as `0x${string}`,
      });
    } catch (err) {
      console.error("[SIWA verify] Failed to recover signer:", err);
      return { valid: false };
    }

    // 5. Nonce consumption + Convex trader lookup in parallel (independent I/O)
    const convex = createConvexAdminClient();
    const [nonceOk, trader] = await Promise.all([
      nonceStore.consume(fields.nonce),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      convex.query(internal.siwaNonces.findTraderByTokenId as any, {
        tokenId: fields.agentId,
      }) as Promise<{
        _id: string;
        cdpOwnerAddress?: string;
        cdpWalletAddress?: string;
      } | null>,
    ]);

    if (!nonceOk) {
      console.error("[SIWA verify] Invalid or already consumed nonce");
      return { valid: false };
    }

    if (!trader) {
      console.error(
        "[SIWA verify] Trader not found for agentId:",
        fields.agentId
      );
      return { valid: false };
    }

    // Check: recovered EOA must be the trader's CDP owner
    if (
      !trader.cdpOwnerAddress ||
      getAddress(recoveredAddress) !== getAddress(trader.cdpOwnerAddress)
    ) {
      console.error("[SIWA verify] Signer is not the agent's authorized key");
      return { valid: false };
    }

    // Check: SIWA address must be the trader's smart account (agent wallet)
    if (
      !trader.cdpWalletAddress ||
      getAddress(fields.address) !== getAddress(trader.cdpWalletAddress)
    ) {
      console.error("[SIWA verify] SIWA address does not match agent wallet");
      return { valid: false };
    }

    return {
      valid: true,
      agentId: fields.agentId,
      address: fields.address,
    };
  } catch (err) {
    console.error("[SIWA verify] failed:", err);
    return { valid: false };
  }
}
