import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api";

export interface AgentActivity {
  id: string;
  trader_id: string;
  activity_type: string;
  message: string;
  deal_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DealOutcomeWithNarrative {
  id: string;
  deal_id: string;
  trader_id: string;
  narrative: string | { event: string; description: string }[];
  trader_pnl_usdc: number;
  pot_change_usdc: number;
  rake_usdc: number;
  assets_gained: { name: string; value_usdc: number }[];
  assets_lost: string[];
  trader_wiped_out: boolean;
  wipeout_reason: string | null;
  created_at: string;
}

export interface TraderAsset {
  id: string;
  trader_id: string;
  name: string;
  value_usdc: number;
  source_deal_id: string | null;
  source_outcome_id: string | null;
  acquired_at: string;
}

export function useTraderAssets(traderId: string) {
  return useQuery({
    queryKey: ["trader-assets", traderId],
    queryFn: async () => {
      const res = await authFetch(`/api/trader/${traderId}/assets`);
      if (!res.ok) throw new Error("Failed to load assets");
      const data = await res.json();
      return (data.assets ?? []) as TraderAsset[];
    },
    enabled: !!traderId,
    // Realtime subscriptions handle live updates — no polling needed
  });
}

export function useAgentActivity(traderId: string) {
  return useQuery({
    queryKey: ["agent-activity", traderId],
    queryFn: async () => {
      const res = await fetch(`/api/trader/${traderId}/activity`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load activity");
      const data = await res.json();
      return (data.activity ?? []) as AgentActivity[];
    },
    enabled: !!traderId,
    // Realtime subscriptions handle live updates — no polling needed
  });
}

export function useTraderOutcomes(traderId: string) {
  return useQuery({
    queryKey: ["trader-outcomes", traderId],
    queryFn: async () => {
      const res = await fetch(`/api/trader/${traderId}/outcomes`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load outcomes");
      const data = await res.json();
      return (data.outcomes ?? []) as DealOutcomeWithNarrative[];
    },
    enabled: !!traderId,
    // Realtime subscriptions handle live updates — no polling needed
  });
}

function useTraderStatusMutation(action: "pause" | "resume" | "revive") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (traderId: string) => {
      const res = await authFetch(`/api/trader/${traderId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Failed to ${action}`);
      }
      return res.json();
    },
    onSuccess: (_data, traderId) => {
      queryClient.invalidateQueries({ queryKey: ["trader", traderId] });
      queryClient.invalidateQueries({
        queryKey: ["agent-activity", traderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["trader-outcomes", traderId],
      });
    },
  });
}

export function usePauseTrader() {
  return useTraderStatusMutation("pause");
}

export function useResumeTrader() {
  return useTraderStatusMutation("resume");
}

export function useReviveTrader() {
  return useTraderStatusMutation("revive");
}
