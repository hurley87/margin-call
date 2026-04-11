"use client";

import { type ReactNode, useMemo } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { PendingApproval } from "@/hooks/use-approvals";
import { usePendingApprovals } from "@/hooks/use-approvals";
import { PendingApprovalCard } from "@/components/pending-approval-card";

export function filterApprovalsForContext(
  approvals: PendingApproval[] | undefined,
  opts: { traderId?: string | null; dealId?: string | null }
) {
  const list = approvals ?? [];
  let next = list;
  if (opts.traderId) {
    const tid = opts.traderId.toLowerCase();
    next = next.filter((a) => a.trader_id.toLowerCase() === tid);
  }
  if (opts.dealId) {
    const did = opts.dealId.toLowerCase();
    const byDeal = next.filter((a) => a.deal_id.toLowerCase() === did);
    if (byDeal.length > 0) return byDeal;
  }
  return next;
}

export function DealApprovalDialog({
  open,
  onOpenChange,
  traderId,
  dealId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  traderId?: string | null;
  dealId?: string | null;
}) {
  const { data: approvals, isLoading, isError } = usePendingApprovals();
  const filtered = useMemo(
    () => filterApprovalsForContext(approvals, { traderId, dealId }),
    [approvals, traderId, dealId]
  );
  let body: ReactNode;

  if (isLoading) {
    body = (
      <p className="text-sm text-[var(--t-muted)]">
        Loading…<span className="cursor-blink">█</span>
      </p>
    );
  } else if (isError) {
    body = (
      <p className="text-sm text-[var(--t-red)]">
        Could not load approvals. Try again from the desk dashboard.
      </p>
    );
  } else if (filtered.length === 0) {
    body = (
      <p className="text-sm text-[var(--t-muted)]">
        No pending approval for this deal. It may have been approved, denied, or
        expired — check the live feed or refresh the desk.
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
        {filtered.map((approval) => (
          <PendingApprovalCard key={approval.id} approval={approval} />
        ))}
      </div>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--t-amber)]">
              Deal approval
            </span>
            <Dialog.Close className="text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]">
              [X]
            </Dialog.Close>
          </div>
          <div className="px-4 py-3">{body}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
