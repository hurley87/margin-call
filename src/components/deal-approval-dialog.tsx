"use client";

import { type ReactNode, useMemo } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { PendingApproval } from "@/hooks/use-approvals";
import { usePendingApprovals } from "@/hooks/use-approvals";
import { PendingApprovalCard } from "@/components/pending-approval-card";
import { DIALOG_BACKDROP_CLASS } from "@/lib/utils";

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
      <div className="border border-[var(--t-divider)] bg-[#070b09] px-4 py-5 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--t-muted)]">
          Pulling approval queue
          <span className="cursor-blink ml-1 text-[var(--t-accent)]">█</span>
        </p>
      </div>
    );
  } else if (isError) {
    body = (
      <div className="border border-[var(--t-red)]/35 bg-[var(--t-red)]/[0.06] px-4 py-3">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--t-red)]">
          Approval queue failed to load. Return to the desk and try again.
        </p>
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div className="border border-[var(--t-divider)] bg-[#070b09] px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--t-amber)]">
          No call pending
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--t-muted)]">
          This deal may have been approved, denied, or expired. Check the live
          feed for the latest tape.
        </p>
      </div>
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
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
                Desk call
              </p>
              <h2 className="font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-wide text-[var(--t-amber)]">
                Pending approval
              </h2>
            </div>
            <Dialog.Close className="min-h-10 shrink-0 px-2 text-xs uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none">
              Close
            </Dialog.Close>
          </div>
          <div className="px-4 py-4">{body}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
