"use client";

import type { PendingApproval } from "@/hooks/use-approvals";
import { useApproveReject } from "@/hooks/use-approvals";

function getPendingApprovalState(expiresAtIso: string) {
  const expiresAt = new Date(expiresAtIso);
  const minutesLeft = Math.max(
    0,
    Math.round((expiresAt.getTime() - Date.now()) / 60000)
  );

  if (minutesLeft <= 0) {
    return { isExpired: true, label: "EXPIRED", color: "text-[var(--t-red)]" };
  }

  return {
    isExpired: false,
    label: `${minutesLeft}m`,
    color: minutesLeft < 5 ? "text-[var(--t-red)]" : "text-[var(--t-amber)]",
  };
}

export function PendingApprovalCard({
  approval,
}: {
  approval: PendingApproval;
}) {
  const { mutate, isPending } = useApproveReject();
  const expiry = getPendingApprovalState(approval.expires_at);

  return (
    <div className="bg-[var(--t-bg)] px-3 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--t-accent)]">
              {approval.trader_name}
            </span>
            <span className="text-[var(--t-muted)]">
              ${approval.entry_cost_usdc.toFixed(2)} into $
              {approval.deal_pot_usdc.toFixed(2)} pot
            </span>
            <span className={`text-[10px] ${expiry.color}`}>
              {expiry.label}
            </span>
          </div>
          <p className="mt-1 text-xs break-words text-[var(--t-muted)]">
            {approval.deal_prompt}
          </p>
        </div>
        {!expiry.isExpired && (
          <div className="flex shrink-0 items-center gap-2 text-[10px]">
            <button
              type="button"
              onClick={() =>
                mutate({ approvalId: approval.id, action: "approve" })
              }
              disabled={isPending}
              className="border border-[var(--t-border)] px-2 py-1 text-[var(--t-green)] transition-colors hover:border-[var(--t-green)] disabled:opacity-50"
            >
              APPROVE
            </button>
            <button
              type="button"
              onClick={() =>
                mutate({ approvalId: approval.id, action: "reject" })
              }
              disabled={isPending}
              className="border border-[var(--t-border)] px-2 py-1 text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] disabled:opacity-50"
            >
              DENY
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
