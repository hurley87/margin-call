import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useCreateTrader() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await authFetch("/api/trader/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create trader");
      return data.trader as Trader;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traders"] });
    },
  });
}
