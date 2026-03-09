import "server-only";

import {
  verifySIWA,
  createSIWANonce,
  parseSIWAMessage,
} from "@buildersgarden/siwa/siwa";
import { createMemorySIWANonceStore } from "@buildersgarden/siwa/nonce-store";
import { recoverMessageAddress, getAddress } from "viem";
import { makePublicClient } from "@/lib/contracts/client";
import {
  IDENTITY_REGISTRY_ADDRESS,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";

const nonceStore = createMemorySIWANonceStore();

const domain =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
  "localhost:3000";

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
 * 3. The smart account (SIWA address) owns the NFT on-chain
 */
export async function verifySIWARequest(
  message: string,
  signature: string
): Promise<{ valid: boolean; agentId?: number; address?: string }> {
  try {
    const fields = parseSIWAMessage(message);

    if (fields.domain !== domain) {
      console.error(
        "[SIWA verify] Domain mismatch:",
        fields.domain,
        "vs",
        domain
      );
      return { valid: false };
    }

    // Recover the actual signer (EOA) from the signature
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

    // The SIWA address is the smart account (agent).
    // The recovered address is the EOA that signed.
    // Verify the EOA is authorized to act for this agent via the DB.
    if (fields.agentId !== undefined) {
      const { createServerClient } = await import("@/lib/supabase/client");
      const supabase = createServerClient();
      const { data: trader } = await supabase
        .from("traders")
        .select("cdp_owner_address, cdp_wallet_address")
        .eq("token_id", fields.agentId)
        .single();

      if (!trader) {
        console.error(
          "[SIWA verify] Trader not found for agentId:",
          fields.agentId
        );
        return { valid: false };
      }

      // Check: recovered EOA must be the trader's CDP owner
      if (
        !trader.cdp_owner_address ||
        getAddress(recoveredAddress) !== getAddress(trader.cdp_owner_address)
      ) {
        console.error("[SIWA verify] Signer is not the agent's authorized key");
        return { valid: false };
      }

      // Check: SIWA address must be the trader's smart account (agent wallet)
      if (
        !trader.cdp_wallet_address ||
        getAddress(fields.address) !== getAddress(trader.cdp_wallet_address)
      ) {
        console.error("[SIWA verify] SIWA address does not match agent wallet");
        return { valid: false };
      }
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
