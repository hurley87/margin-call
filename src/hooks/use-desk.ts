"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import type { Doc } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";

export interface DeskManager {
  id: string;
  wallet_address: string;
  display_name: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function mapDeskManager(desk: Doc<"deskManagers">): DeskManager {
  return {
    id: desk._id,
    wallet_address: desk.walletAddress ?? "",
    display_name: desk.displayName ?? "",
    settings: (desk.settings as Record<string, unknown>) ?? {},
    created_at: new Date(desk.createdAt).toISOString(),
    updated_at: new Date(desk.updatedAt).toISOString(),
  };
}

/**
 * Upserts desk manager wallet metadata in Convex and returns the reactive record.
 */
export function useDeskManager() {
  const { authenticated, ready, user } = usePrivy();
  const upsert = useMutation(api.deskManagers.upsertMe);
  const desk = useQuery(
    api.deskManagers.getMe,
    authenticated && ready ? {} : "skip"
  );

  const didUpsertWalletRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated || !user) return;

    const walletAccount = user.linkedAccounts?.find((a) => a.type === "wallet");
    const walletAddress =
      user.wallet?.address ??
      (walletAccount && "address" in walletAccount
        ? (walletAccount as { address: string }).address
        : undefined);

    if (!walletAddress) return;
    if (didUpsertWalletRef.current === walletAddress) return;
    didUpsertWalletRef.current = walletAddress;

    void upsert({
      walletAddress,
      displayName: walletAddress.slice(0, 6) + "..." + walletAddress.slice(-4),
    }).catch(() => {
      didUpsertWalletRef.current = null;
    });
  }, [authenticated, ready, upsert, user]);

  useEffect(() => {
    if (!authenticated) didUpsertWalletRef.current = null;
  }, [authenticated]);

  const isSkipped = !authenticated || !ready;

  let data: DeskManager | null | undefined;
  if (isSkipped) data = undefined;
  else if (desk === undefined) data = undefined;
  else if (desk === null) data = null;
  else data = mapDeskManager(desk);

  return {
    data,
    isLoading: !isSkipped && desk === undefined,
    isError: false as const,
  };
}
