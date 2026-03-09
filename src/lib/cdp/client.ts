import "server-only";

import { CdpClient } from "@coinbase/cdp-sdk";

let cached: CdpClient | null = null;

/**
 * Get the singleton CDP client.
 * Reads CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET from env.
 */
export function getCdpClient(): CdpClient {
  if (!cached) {
    cached = new CdpClient();
  }
  return cached;
}
