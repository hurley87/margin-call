import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { authFetch } from "@/lib/api";

export interface Trader {
  id: string;
  token_id: number;
  name: string;
  owner_address: string;
  tba_address: string | null;
  status: string;
  mandate: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useTraders() {
  const { user, authenticated } = usePrivy();
  const walletAddress = user?.wallet?.address;

  return useQuery({
    queryKey: ["traders", walletAddress],
    queryFn: async () => {
      const res = await authFetch(`/api/trader/list?owner=${walletAddress}`);
      if (!res.ok) throw new Error("Failed to load traders");
      const data = await res.json();
      return (data.traders ?? []) as Trader[];
    },
    enabled: authenticated && !!walletAddress,
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
