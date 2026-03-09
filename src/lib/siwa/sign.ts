import "server-only";

import { signSIWAMessage } from "@buildersgarden/siwa/siwa";
// Define Signer interface locally to avoid pulling in @buildersgarden/siwa/signer
// which transitively imports @openfort/openfort-node (optional dep).
interface Signer {
  getAddress(): Promise<`0x${string}`>;
  signMessage(message: string): Promise<`0x${string}`>;
}
import {
  IDENTITY_REGISTRY_ADDRESS,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";
import type {
  TraderOwnerAccount,
  TraderSmartAccount,
} from "@/lib/cdp/trader-wallet";

/**
 * Sign a SIWA message for agent authentication.
 *
 * The SIWA address is the smart account (the agent identity / NFT owner).
 * The EOA produces the signature. The verifier recovers the EOA address
 * and confirms it is the authorized key for this agent via the DB.
 */
export async function signAgentRequest(
  traderOwnerAccount: TraderOwnerAccount,
  tokenId: number,
  nonce: string,
  smartAccount: TraderSmartAccount
): Promise<{ message: string; signature: string }> {
  const domain =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
    "localhost:3000";

  // SIWA address = smart account (agent identity).
  // EOA signs the message directly (ecRecover on verify side).
  const signer: Signer = {
    getAddress: async () => smartAccount.address as `0x${string}`,
    signMessage: async (message: string) => {
      return traderOwnerAccount.signMessage({ message });
    },
  };

  const uri = process.env.NEXT_PUBLIC_APP_URL ?? `http://${domain}`;

  return signSIWAMessage(
    {
      domain,
      uri,
      agentId: tokenId,
      agentRegistry: `eip155:${CONTRACTS_CHAIN_ID}:${IDENTITY_REGISTRY_ADDRESS}`,
      chainId: CONTRACTS_CHAIN_ID,
      nonce,
      issuedAt: new Date().toISOString(),
    },
    signer
  );
}
