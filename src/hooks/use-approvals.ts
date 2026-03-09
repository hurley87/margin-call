import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api";

export interface PendingApproval {
  id: string;
  trader_id: string;
  deal_id: string;
  status: string;
  entry_cost_usdc: number;
  reason: string | null;
  expires_at: string;
  created_at: string;
  trader_name: string;
  deal_prompt: string;
  deal_pot_usdc: number;
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const res = await authFetch("/api/desk/approvals");
      if (!res.ok) throw new Error("Failed to load approvals");
      const data = await res.json();
      return (data.approvals ?? []) as PendingApproval[];
    },
    refetchInterval: 30_000,
  });
}

export function useApproveReject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      approvalId,
      action,
      reason,
    }: {
      approvalId: string;
      action: "approve" | "reject";
      reason?: string;
    }) => {
      const res = await authFetch("/api/desk/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approval_id: approvalId,
          action,
          reason,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Failed to ${action}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
    },
  });
}

export function useConfigureMandate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      traderId,
      mandate,
    }: {
      traderId: string;
      mandate: Record<string, unknown>;
    }) => {
      const res = await authFetch("/api/desk/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trader_id: traderId,
          mandate,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update mandate");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["trader", variables.traderId],
      });
    },
  });
}
