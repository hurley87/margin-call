import { useQuery, useMutation } from "@tanstack/react-query";

export interface Deal {
  id: string;
  on_chain_deal_id?: number;
  prompt: string;
  pot_usdc: number;
  entry_cost_usdc: number;
  fee_usdc?: number;
  max_extraction_percentage: number;
  entry_count: number;
  wipeout_count: number;
  status: string;
  created_at: string;
  on_chain_tx_hash?: string;
}

interface StoryEvent {
  event: string;
  description: string;
}

export interface DealOutcome {
  id: string;
  trader_pnl_usdc: number;
  rake_usdc: number;
  narrative: StoryEvent[];
  trader_wiped_out: boolean;
  wipeout_reason?: string;
  assets_gained: { name: string; value_usdc: number }[];
  assets_lost: string[];
  created_at: string;
}

export function useDeals() {
  return useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const res = await fetch("/api/deal/list");
      if (!res.ok) throw new Error("Failed to load deals");
      const data = await res.json();
      return (data.deals ?? []) as Deal[];
    },
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: ["deal", id],
    queryFn: async () => {
      const res = await fetch(`/api/deal/${id}`);
      if (!res.ok) throw new Error("Deal not found");
      const data = await res.json();
      return {
        deal: data.deal as Deal,
        outcomes: (data.outcomes ?? []) as DealOutcome[],
      };
    },
  });
}

export function useSuggestPrompts() {
  return useMutation({
    mutationFn: async (theme: string) => {
      const res = await fetch("/api/prompt/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to suggest prompts");
      return data.suggestions as string[];
    },
  });
}
