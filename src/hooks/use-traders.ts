import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { authFetch } from "@/lib/api";

export interface Trader {
  id: string;
  token_id: number;
  name: string;
  owner_address: string;
  tba_address: string | null;
  cdp_wallet_address: string | null;
  cdp_owner_address: string | null;
  cdp_account_name: string | null;
  status: "active" | "paused" | "wiped_out";
  mandate: Record<string, unknown>;
  personality: string | null;
  escrow_balance_usdc: number;
  last_cycle_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useTraders() {
  const { user, authenticated } = usePrivy();
  const walletAddress = user?.wallet?.address;

  return useQuery({
    queryKey: ["traders", walletAddress],
    queryFn: async () => {
      const res = await authFetch("/api/trader/list");
      if (!res.ok) throw new Error("Failed to load traders");
      const data = await res.json();
      return (data.traders ?? []) as Trader[];
    },
    enabled: authenticated && !!walletAddress,
    staleTime: 30_000,
  });
}

export function useTrader(id: string) {
  return useQuery({
    queryKey: ["trader", id],
    queryFn: async () => {
      const res = await authFetch(`/api/trader/${id}`);
      if (!res.ok) throw new Error("Trader not found");
      const data = await res.json();
      return data.trader as Trader;
    },
  });
}

export interface TraderHistoryEvent {
  type: "deposit" | "withdrawal" | "enter" | "resolve";
  block: number;
  txHash: string;
  amount?: number;
  dealId?: number;
  pnl?: number;
  rake?: number;
}

export function useTraderHistory(id: string) {
  return useQuery({
    queryKey: ["trader-history", id],
    queryFn: async () => {
      const res = await authFetch(`/api/trader/${id}/history`);
      if (!res.ok) throw new Error("Failed to load history");
      const data = await res.json();
      return (data.events ?? []) as TraderHistoryEvent[];
    },
  });
}
