import "server-only";

import type { SIWANonceStore } from "@buildersgarden/siwa/nonce-store";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { internal } from "../../../convex/_generated/api";

/**
 * Convex-backed SIWA nonce store.
 * Works across serverless invocations (no in-memory state).
 */
export function createConvexNonceStore(): SIWANonceStore {
  return {
    async issue(nonce: string, ttlMs: number): Promise<boolean> {
      const convex = createConvexAdminClient();
      const expiresAt = Date.now() + ttlMs;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await convex.mutation((internal as any).siwaNonces.issue, {
          nonce,
          expiresAt,
        })) as boolean;
      } catch (err) {
        console.error("[SIWA nonce] issue error:", err);
        return false;
      }
    },

    async consume(nonce: string): Promise<boolean> {
      const convex = createConvexAdminClient();
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await convex.mutation((internal as any).siwaNonces.consume, {
          nonce,
        })) as boolean;
      } catch (err) {
        console.error("[SIWA nonce] consume error:", err);
        return false;
      }
    },
  };
}
