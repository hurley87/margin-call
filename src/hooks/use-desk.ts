"use client";

import { useQuery, useMutation } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";

export interface DeskManager {
  id: string;
  wallet_address: string;
  display_name: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch (and auto-register) the current user's desk manager row.
 * Backed by Convex subscription — live updates without polling.
 */
export function useDeskManager(): {
  data: DeskManager | undefined;
  isLoading: boolean;
} {
  const { authenticated, user } = usePrivy();
  const upsertMe = useMutation(api.deskManagers.upsertMe);
  const upsertedRef = useRef(false);

  const result = useQuery(
    authenticated ? api.deskManagers.getMe : "skip" as never
  );

  // Auto-register desk manager on first authenticated load when not yet created
  useEffect(() => {
    if (!authenticated || upsertedRef.current) return;
    if (result === null) {
      // Not found — upsert to create
      upsertedRef.current = true;
      void upsertMe({
        walletAddress: user?.wallet?.address,
        displayName: user?.wallet?.address?.slice(0, 8),
      });
    } else if (result !== undefined) {
      // Found — mark as done so we never re-upsert this session
      upsertedRef.current = true;
    }
  }, [authenticated, result, upsertMe, user?.wallet?.address]);

  if (!authenticated || result === undefined) {
    return { data: undefined, isLoading: !!authenticated };
  }

  if (result === null) {
    // Upsert in flight
    return { data: undefined, isLoading: true };
  }

  const data: DeskManager = {
    id: result._id,
    wallet_address: result.walletAddress ?? "",
    display_name:
      result.displayName ?? result.walletAddress?.slice(0, 8) ?? "",
    settings: (result.settings as Record<string, unknown>) ?? {},
    created_at: new Date(result.createdAt).toISOString(),
    updated_at: new Date(result.updatedAt).toISOString(),
  };

  return { data, isLoading: false };
}
