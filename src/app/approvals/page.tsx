"use client";

import { useState } from "react";
import Link from "next/link";
import {
  usePendingApprovals,
  useApproveReject,
  type PendingApproval,
} from "@/hooks/use-approvals";
import { useApprovalsRealtime } from "@/hooks/use-realtime";

export default function ApprovalsPage() {
  useApprovalsRealtime();
  const { data: approvals, isLoading } = usePendingApprovals();

  return (
    <div className="flex min-h-screen flex-col items-center bg-black px-4 py-12">
      <div className="w-full max-w-2xl">
        <Link
          href="/traders"
          className="mb-6 inline-block text-sm text-zinc-400 transition-colors hover:text-zinc-300"
        >
          &larr; Back to Traders
        </Link>

        <h1 className="mb-6 text-xl font-semibold text-zinc-50">
          Pending Approvals
        </h1>

        {isLoading ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : !approvals || approvals.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-500">
              No pending approvals. Approvals appear here when a trader finds a
              deal that exceeds your configured approval threshold.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-3 flex items-center justify-between">
        <Link
          href={`/traders/${approval.trader_id}`}
          className="text-sm font-medium text-zinc-50 hover:text-green-400"
        >
          {approval.trader_name}
        </Link>
        {isExpired ? (
          <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
            Expired
          </span>
        ) : (
          <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-400">
            {timeLeft}m left
          </span>
        )}
      </div>

      <p className="mb-2 text-sm text-zinc-300">
        {approval.deal_prompt.slice(0, 200)}
        {approval.deal_prompt.length > 200 ? "..." : ""}
      </p>

      <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-zinc-500">Entry Cost</p>
          <p className="text-zinc-50">${approval.entry_cost_usdc} USDC</p>
        </div>
        <div>
          <p className="text-zinc-500">Pot</p>
          <p className="text-zinc-50">${approval.deal_pot_usdc} USDC</p>
        </div>
        <div>
          <p className="text-zinc-500">Ratio</p>
          <p className="text-zinc-50">
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
            className="mb-3 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
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
              className="rounded bg-green-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-green-400 disabled:opacity-50"
            >
              {approveReject.isPending ? "..." : "Approve"}
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
              className="rounded bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              {approveReject.isPending ? "..." : "Reject"}
            </button>
          </div>
        </>
      )}

      {approveReject.isError && (
        <p className="mt-2 text-xs text-red-400">
          {approveReject.error.message}
        </p>
      )}
    </div>
  );
}
