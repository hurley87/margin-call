import "server-only";

import type { SIWANonceStore } from "@buildersgarden/siwa/nonce-store";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { internal } from "../../../convex/_generated/api";

/**
 * Convex-backed SIWA nonce store.
 *
 * Retention policy:
 *   - Nonces are inserted with the TTL supplied by the SIWA library (default 5 min).
 *   - `consume` deletes the row immediately on first use; subsequent calls return false.
 *   - An hourly Convex cron (convex/crons.ts) purges any rows that were issued but
 *     never consumed (e.g. abandoned auth flows).
 */
export function createConvexNonceStore(): SIWANonceStore {
  return {
    async issue(nonce: string, ttlMs: number): Promise<boolean> {
      const convex = createConvexAdminClient();
      const expiresAt = Date.now() + ttlMs;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inserted = await (convex as any).mutation(
        internal.siwaNonces.issue,
        { nonce, expiresAt }
      );

      return inserted as boolean;
    },

    async consume(nonce: string): Promise<boolean> {
      const convex = createConvexAdminClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (convex as any).mutation(
        internal.siwaNonces.consume,
        { nonce }
      );

      // "ok" → nonce was valid and has been consumed
      // "expired" | "notFound" → treat as invalid
      return (result as string) === "ok";
    },
  };
}
