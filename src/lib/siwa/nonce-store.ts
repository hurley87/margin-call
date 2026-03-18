import "server-only";

import type { SIWANonceStore } from "@buildersgarden/siwa/nonce-store";
import { createServerClient } from "@/lib/supabase/client";

/**
 * Supabase-backed SIWA nonce store.
 * Works across serverless invocations (unlike the in-memory store).
 */
export function createSupabaseNonceStore(): SIWANonceStore {
  return {
    async issue(nonce: string, ttlMs: number): Promise<boolean> {
      const supabase = createServerClient();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();

      const { error } = await supabase
        .from("siwa_nonces")
        .insert({ nonce, expires_at: expiresAt });

      if (error) {
        // Unique constraint violation → nonce already exists
        if (error.code === "23505") return false;
        console.error("[SIWA nonce] issue error:", error.message);
        return false;
      }
      return true;
    },

    async consume(nonce: string): Promise<boolean> {
      const supabase = createServerClient();

      // Atomically delete the nonce if it exists and hasn't expired
      const { data, error } = await supabase
        .from("siwa_nonces")
        .delete()
        .eq("nonce", nonce)
        .gte("expires_at", new Date().toISOString())
        .select("nonce");

      if (error) {
        console.error("[SIWA nonce] consume error:", error.message);
        return false;
      }

      return data !== null && data.length > 0;
    },
  };
}
