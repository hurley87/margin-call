"use client";

import { useState } from "react";
import Link from "next/link";
import {
  usePendingApprovals,
  useApproveReject,
  type PendingApproval,
} from "@/hooks/use-approvals";
import { useApprovalsRealtime } from "@/hooks/use-realtime";
import { Nav } from "@/components/nav";

export default function ApprovalsPage() {
  useApprovalsRealtime();
  const { data: approvals, isLoading } = usePendingApprovals();

  return (
    <div className="min-h-screen bg-[var(--t-bg)]">
      <Nav />
      <div className="border-b border-[var(--t-border)] bg-[var(--t-bg)]">
        <div className="mx-auto flex max-w-2xl items-center px-4 py-1.5 text-xs">
          <span className="text-[var(--t-text)]">PENDING APPROVALS</span>
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        {isLoading ? (
          <p className="text-sm text-[var(--t-muted)]">Loading...</p>
        ) : !approvals || approvals.length === 0 ? (
          <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
            <p className="text-sm text-[var(--t-muted)]">
              No pending approvals. Approvals appear here when a trader finds a
              deal that exceeds your configured approval threshold.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
            {approvals.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const [reason, setReason] = useState("");
  const approveReject = useApproveReject();
  const expiresAt = new Date(approval.expires_at);
  const isExpired = expiresAt < new Date();
  const timeLeft = Math.max(
    0,
    Math.round((expiresAt.getTime() - Date.now()) / 1000 / 60)
  );

  return (
    <div className="bg-[var(--t-bg)] p-6">
      <div className="mb-3 flex items-center justify-between">
        <Link
          href={`/traders/${approval.trader_id}`}
          className="text-sm font-medium text-[var(--t-text)] hover:text-[var(--t-accent)]"
        >
          {approval.trader_name}
        </Link>
        {isExpired ? (
          <span className="text-[10px] font-bold text-[var(--t-red)]">
            [EXPIRED]
          </span>
        ) : (
          <span className="text-[10px] font-bold text-[var(--t-amber)]">
            [{timeLeft}m LEFT]
          </span>
        )}
      </div>

      <p className="mb-2 text-sm text-[var(--t-muted)]">
        {approval.deal_prompt.slice(0, 200)}
        {approval.deal_prompt.length > 200 ? "..." : ""}
      </p>

      <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-[var(--t-muted)] text-xs">Entry Cost</p>
          <p className="text-[var(--t-text)]">
            ${approval.entry_cost_usdc} USDC
          </p>
        </div>
        <div>
          <p className="text-[var(--t-muted)] text-xs">Pot</p>
          <p className="text-[var(--t-text)]">${approval.deal_pot_usdc} USDC</p>
        </div>
        <div>
          <p className="text-[var(--t-muted)] text-xs">Ratio</p>
          <p className="text-[var(--t-accent)]">
            {(approval.deal_pot_usdc / approval.entry_cost_usdc).toFixed(1)}x
          </p>
        </div>
      </div>

      {!isExpired && (
        <>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mb-3 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                approveReject.mutate({
                  approvalId: approval.id,
                  action: "approve",
                  reason: reason || undefined,
                })
              }
              disabled={approveReject.isPending}
              className="border border-[var(--t-border)] px-4 py-2 text-sm text-[var(--t-green)] transition-colors hover:border-[var(--t-green)] disabled:opacity-50"
            >
              {approveReject.isPending ? "..." : "APPROVE"}
            </button>
            <button
              onClick={() =>
                approveReject.mutate({
                  approvalId: approval.id,
                  action: "reject",
                  reason: reason || undefined,
                })
              }
              disabled={approveReject.isPending}
              className="border border-[var(--t-border)] px-4 py-2 text-sm text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] disabled:opacity-50"
            >
              {approveReject.isPending ? "..." : "DENY"}
            </button>
          </div>
        </>
      )}

      {approveReject.isError && (
        <p className="mt-2 text-xs text-[var(--t-red)]">
          {approveReject.error.message}
        </p>
      )}
    </div>
  );
}
