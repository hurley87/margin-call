"use client";

/**
 * Desk manager hook — migrated to Convex.
 */

import {
  useQuery as useConvexQuery,
  useMutation as useConvexMutation,
} from "convex/react";
import { api } from "../../convex/_generated/api";

// ── Types (kept snake_case for UI compatibility) ──────────────────────────────

export interface DeskManager {
  id: string;
  wallet_address: string;
  display_name: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type RawDeskManager = {
  _id: string;
  walletAddress?: string;
  displayName?: string;
  settings?: unknown;
  createdAt: number;
  updatedAt: number;
};

function toDeskManager(doc: RawDeskManager): DeskManager {
  return {
    id: doc._id,
    wallet_address: doc.walletAddress ?? "",
    display_name: doc.displayName ?? "Desk Manager",
    settings: (doc.settings as Record<string, unknown>) ?? {},
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
  };
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Get the current user's desk manager row from Convex.
 * Triggers an upsert if the row does not yet exist.
 */
export function useDeskManager() {
  const upsert = useConvexMutation(api.deskManagers.upsertMe);
  const result = useConvexQuery(api.deskManagers.getMe);

  // Trigger upsert so the row is created on first login.
  // useMutation returns a stable function reference; calling it here is safe
  // but only fire when result is explicitly null (not undefined/loading).
  if (result === null) {
    void upsert({});
  }

  if (result === undefined || result === null) {
    return { data: undefined, isLoading: true };
  }

  return { data: toDeskManager(result as RawDeskManager), isLoading: false };
}
