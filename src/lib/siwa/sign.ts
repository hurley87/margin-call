import "server-only";

import { signSIWAMessage } from "@buildersgarden/siwa/siwa";

// Define Signer interface locally to avoid pulling in @buildersgarden/siwa/signer
// which transitively imports @openfort/openfort-node (optional dep).
interface Signer {
  getAddress(): Promise<`0x${string}`>;
  signMessage(message: string): Promise<`0x${string}`>;
}

/** Minimal account shape for SIWA signing (message/signature only). */
export type SiwaSignerAccount = {
  address: string;
  signMessage: (args: { message: string }) => Promise<`0x${string}`>;
};

/**
 * Sign a SIWA message for agent authentication.
 *
 * Simplified post-teardown: message/signature only — no identity-registry
 * or CDP trader-wallet binding. Chain/registry fields are placeholders.
 */
export async function signAgentRequest(
  traderOwnerAccount: SiwaSignerAccount,
  tokenId: number,
  nonce: string,
  smartAccount: { address: string }
): Promise<{ message: string; signature: string }> {
  const domain =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
    "localhost:3000";

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
      agentRegistry: `eip155:0:0x0000000000000000000000000000000000000000`,
      chainId: 0,
      nonce,
      issuedAt: new Date().toISOString(),
    },
    signer
  );
}
