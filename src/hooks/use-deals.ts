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
  creator_address?: string;
  source_headline?: string;
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
  on_chain_tx_hash?: string;
}

export function useDeals() {
  return useQuery(dealsQueryOptions);
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

const dealsQueryOptions = {
  queryKey: ["deals"] as const,
  queryFn: async () => {
    const res = await fetch("/api/deal/list");
    if (!res.ok) throw new Error("Failed to load deals");
    const data = await res.json();
    return (data.deals ?? []) as Deal[];
  },
};

/** Returns a map of headline text → deals created from that headline.
 *  Shares the same ["deals"] query cache as useDeals — no duplicate fetch. */
export function useHeadlineDeals() {
  return useQuery({
    ...dealsQueryOptions,
    select: (deals) => {
      const map: Record<string, Deal[]> = {};
      for (const d of deals) {
        if (!d.source_headline) continue;
        if (!map[d.source_headline]) map[d.source_headline] = [];
        map[d.source_headline].push(d);
      }
      return map;
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
