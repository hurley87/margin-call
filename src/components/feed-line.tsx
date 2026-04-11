import type { AgentActivity } from "@/hooks/use-agent";
import type { PendingApproval } from "@/hooks/use-approvals";
import { useApproveReject } from "@/hooks/use-approvals";
import { pendingDealReviewKey } from "@/lib/pending-deal-key";

export function getFeedGridClass(showTrader: boolean) {
  return showTrader
    ? "grid grid-cols-[5.5rem_5.5rem_4rem_minmax(0,1fr)_8.5rem] items-start gap-2"
    : "grid grid-cols-[5.5rem_5.5rem_minmax(0,1fr)_8.5rem] items-start gap-2";
}

export const FEED_DISPLAY: Record<string, { label: string; color: string }> = {
  cycle_start: { label: "CYCLE", color: "text-[var(--t-muted)]" },
  scan: { label: "SCAN", color: "text-[var(--t-muted)]" },
  evaluate: { label: "EVAL", color: "text-[var(--t-accent)]" },
  skip: { label: "SKIP", color: "text-[var(--t-muted)]" },
  enter: { label: "ENTER", color: "text-[var(--t-accent)]" },
  win: { label: "WIN", color: "text-[var(--t-green)]" },
  loss: { label: "LOSS", color: "text-[var(--t-red)]" },
  wipeout: { label: "WIPEOUT", color: "text-[var(--t-red)]" },
  pause: { label: "PAUSE", color: "text-[var(--t-amber)]" },
  resume: { label: "RESUME", color: "text-[var(--t-green)]" },
  revive: { label: "REVIVE", color: "text-[var(--t-accent)]" },
  approval_required: { label: "APPROVAL", color: "text-[var(--t-amber)]" },
  approved: { label: "OK", color: "text-[var(--t-green)]" },
  rejected: { label: "DENIED", color: "text-[var(--t-red)]" },
  error: { label: "ERR", color: "text-[var(--t-red)]" },
  cycle_end: { label: "DONE", color: "text-[var(--t-muted)]" },
};

export function feedLinePendingReviewKey(entry: AgentActivity) {
  if (entry.activity_type !== "approval_required") {
    return null;
  }
  if (entry.deal_id) {
    return pendingDealReviewKey(entry.trader_id, entry.deal_id);
  }
  return `legacy:${entry.trader_id.toLowerCase()}:${entry.message.toLowerCase()}`;
}

/** Feed is newest-first; attach the CTA to the first approval row per deal/history item. */
export function buildReviewCtaEntryIds(activity: AgentActivity[]): Set<string> {
  const ids = new Set<string>();
  const usedKeys = new Set<string>();
  for (const entry of activity) {
    const k = feedLinePendingReviewKey(entry);
    if (!k || usedKeys.has(k)) continue;
    usedKeys.add(k);
    ids.add(entry.id);
  }
  return ids;
}

export function buildApprovalIdByEntryId(
  activity: AgentActivity[],
  approvals: PendingApproval[],
  traderId?: string
): Map<string, string> {
  const filteredApprovals = traderId
    ? approvals.filter(
        (approval) =>
          approval.trader_id.toLowerCase() === traderId.toLowerCase()
      )
    : approvals;

  const pendingByKey = new Map(
    filteredApprovals
      .filter((approval) => approval.trader_id && approval.deal_id)
      .map(
        (approval) =>
          [
            pendingDealReviewKey(approval.trader_id, approval.deal_id),
            approval.id,
          ] as const
      )
  );

  const next = new Map<string, string>();
  const usedKeys = new Set<string>();

  for (const entry of activity) {
    if (entry.activity_type !== "approval_required" || !entry.deal_id) {
      continue;
    }

    const key = pendingDealReviewKey(entry.trader_id, entry.deal_id);
    if (usedKeys.has(key)) continue;

    const approvalId = pendingByKey.get(key);
    if (!approvalId) continue;

    usedKeys.add(key);
    next.set(entry.id, approvalId);
  }

  return next;
}

function getFeedActionState(params: {
  showApprovalCta: boolean;
  approvalId: string | null;
  hasApprovalLookup: boolean;
}) {
  if (!params.showApprovalCta) return "hidden" as const;
  if (params.approvalId) return "pending" as const;
  if (params.hasApprovalLookup) return "expired" as const;
  return "review" as const;
}

export function FeedLine({
  entry,
  traderName,
  showTrader,
  wrapMessage = false,
  onReviewApproval,
  /**
   * Activity row ids that may show a CTA — parent builds this so only one row
   * per approval event/deal (newest-first feed: first matching line wins).
   */
  reviewCtaEntryIds,
  /** Matching pending approval ids keyed by activity row id. */
  approvalIdByEntryId,
}: {
  entry: AgentActivity;
  traderName: string;
  showTrader: boolean;
  wrapMessage?: boolean;
  /** Desk manager CTA: open approval dialog for this log line when applicable */
  onReviewApproval?: (ctx: { traderId: string; dealId: string | null }) => void;
  reviewCtaEntryIds?: ReadonlySet<string>;
  approvalIdByEntryId?: ReadonlyMap<string, string>;
}) {
  const { mutate, isPending } = useApproveReject();
  const display = FEED_DISPLAY[entry.activity_type] ?? {
    label: entry.activity_type.toUpperCase(),
    color: "text-[var(--t-muted)]",
  };
  const time = new Date(entry.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const isHighEvent =
    entry.activity_type === "win" ||
    entry.activity_type === "loss" ||
    entry.activity_type === "wipeout";

  const approvalId = approvalIdByEntryId?.get(entry.id) ?? null;
  const showApprovalCta =
    onReviewApproval && reviewCtaEntryIds?.has(entry.id) === true;
  const actionState = getFeedActionState({
    showApprovalCta: Boolean(showApprovalCta),
    approvalId,
    hasApprovalLookup: approvalIdByEntryId !== undefined,
  });

  return (
    <div
      className={`${getFeedGridClass(showTrader)} border-b border-[var(--t-border)] last:border-b-0 px-3 py-1.5 text-xs transition-colors hover:bg-[var(--t-surface)] ${
        entry.activity_type === "wipeout"
          ? "bg-[#D48787]/5"
          : "bg-[var(--t-bg)]"
      }`}
    >
      <span className="truncate tabular-nums text-[var(--t-muted)]">
        {time}
      </span>
      <span className={`truncate font-bold ${display.color}`}>
        {display.label}
      </span>
      {showTrader && (
        <span className="truncate text-[var(--t-accent)]">{traderName}</span>
      )}
      <span
        className={`min-w-0 ${
          wrapMessage ? "break-words whitespace-normal" : "truncate"
        } ${isHighEvent ? "text-[var(--t-text)]" : "text-[var(--t-muted)]"}`}
      >
        {entry.message}
      </span>
      {actionState === "pending" && approvalId && (
        <div className="flex justify-self-end items-center justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => mutate({ approvalId, action: "approve" })}
            disabled={isPending}
            className="border border-[var(--t-green)]/60 px-2 py-0.5 font-bold uppercase tracking-wide text-[var(--t-green)] transition-colors hover:border-[var(--t-green)] hover:bg-[var(--t-green)]/10 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => mutate({ approvalId, action: "reject" })}
            disabled={isPending}
            className="border border-[var(--t-red)]/60 px-2 py-0.5 font-bold uppercase tracking-wide text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] hover:bg-[var(--t-red)]/10 disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      )}
      {actionState === "expired" && (
        <span className="justify-self-end text-right text-[10px] font-bold uppercase tracking-wide text-[var(--t-red)]">
          Expired
        </span>
      )}
      {actionState === "review" && (
        <button
          type="button"
          onClick={() =>
            onReviewApproval?.({
              traderId: entry.trader_id,
              dealId: entry.deal_id,
            })
          }
          className="justify-self-end border border-[var(--t-amber)]/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--t-amber)] transition-colors hover:border-[var(--t-amber)] hover:bg-[var(--t-amber)]/10"
        >
          Review
        </button>
      )}
    </div>
  );
}
