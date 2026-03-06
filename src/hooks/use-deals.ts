import { useQuery, useMutation } from "@tanstack/react-query";
import { authFetch } from "@/lib/api";

export interface Deal {
  id: string;
  prompt: string;
  pot_usdc: number;
  entry_cost_usdc: number;
  max_extraction_percentage: number;
  entry_count: number;
  wipeout_count: number;
  status: string;
  created_at: string;
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

interface CreateDealInput {
  prompt: string;
  pot_amount: number;
  entry_cost: number;
}

export function useCreateDeal() {
  return useMutation({
    mutationFn: async (input: CreateDealInput) => {
      const res = await authFetch("/api/deal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create deal");
      return data.deal as Deal;
    },
  });
}
