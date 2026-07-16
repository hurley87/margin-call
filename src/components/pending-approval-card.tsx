"use client";

import type { PendingApproval } from "@/hooks/use-approvals";
import { useApproveReject } from "@/hooks/use-approvals";
import { TraderAvatar } from "@/components/trader-avatar";

function getPendingApprovalState(expiresAtIso: string) {
  const expiresAt = new Date(expiresAtIso);
  const minutesLeft = Math.max(
    0,
    Math.round((expiresAt.getTime() - Date.now()) / 60000)
  );

  if (minutesLeft <= 0) {
    return {
      isExpired: true,
      isUrgent: false,
      label: "EXPIRED",
      color: "text-[var(--t-red)]",
    };
  }

  const isUrgent = minutesLeft < 5;
  return {
    isExpired: false,
    isUrgent,
    label: `${minutesLeft}m left`,
    color: isUrgent ? "text-[var(--t-red-hot)]" : "text-[var(--t-amber)]",
  };
}

export function PendingApprovalCard({
  approval,
}: {
  approval: PendingApproval;
}) {
  const { mutate } = useApproveReject();
  const expiry = getPendingApprovalState(approval.expires_at);

  return (
    <div
      className={
        expiry.isUrgent
          ? "border border-[var(--t-red)]/45 bg-[var(--t-red)]/[0.07] px-3 py-3 shadow-[inset_3px_0_0_0_var(--t-red-hot)]"
          : "border border-[var(--t-amber)]/30 bg-[var(--t-amber)]/[0.05] px-3 py-3 shadow-[inset_3px_0_0_0_var(--t-amber)]"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <TraderAvatar
            name={approval.trader_name}
            src={approval.trader_profile_image_url}
            imageStatus={approval.trader_image_status}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-[var(--t-accent)]">
                Needs call
              </span>
              <span className="text-[var(--t-accent)]">
                {approval.trader_name}
              </span>
              <span className="text-[var(--t-muted)]">
                ${approval.entry_cost_usdc.toFixed(2)} into $
                {approval.deal_pot_usdc.toFixed(2)} pot
              </span>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${expiry.color}`}
              >
                {expiry.isUrgent ? (
                  <span className="live-pulse mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--t-red-hot)]" />
                ) : null}
                {expiry.label}
              </span>
            </div>
            <p className="mt-1 text-xs break-words text-[var(--t-muted)]">
              {approval.deal_prompt}
            </p>
          </div>
        </div>
        {!expiry.isExpired && (
          <div className="flex shrink-0 items-center gap-2 text-[10px]">
            <button
              type="button"
              onClick={() =>
                mutate({ approvalId: approval.id, action: "approve" })
              }
              className="min-h-10 border border-[var(--t-border)] px-3 py-1 text-[var(--t-green)] transition-colors hover:border-[var(--t-green)] focus-visible:border-[var(--t-green)] focus-visible:outline-none"
            >
              APPROVE
            </button>
            <button
              type="button"
              onClick={() =>
                mutate({ approvalId: approval.id, action: "reject" })
              }
              className="min-h-10 border border-[var(--t-border)] px-3 py-1 text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] focus-visible:border-[var(--t-red)] focus-visible:outline-none"
            >
              DENY
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
