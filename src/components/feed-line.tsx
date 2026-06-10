import type { AgentActivity } from "@/hooks/use-agent";
import { useApproveReject, type PendingApproval } from "@/hooks/use-approvals";
import type { TraderProfile } from "@/hooks/use-activity-feed";
import { pendingDealReviewKey } from "@/lib/pending-deal-key";
import { staggerDelay } from "@/lib/motion-tokens";

export function getFeedGridClass(showTrader: boolean) {
  return showTrader
    ? "grid grid-cols-[5.5rem_5.5rem_7rem_minmax(0,1fr)_8.5rem] items-start gap-2"
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
  cycle_error: { label: "ERR", color: "text-[var(--t-red)]" },
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
  traderProfile,
  showTrader,
  wrapMessage = false,
  onOpenDeal,
  onShowDetail,
  onReviewApproval,
  /**
   * Activity row ids that may show a CTA — parent builds this so only one row
   * per approval event/deal (newest-first feed: first matching line wins).
   */
  reviewCtaEntryIds,
  /** Matching pending approval ids keyed by activity row id. */
  approvalIdByEntryId,
  isNew = false,
  burstIndex = 0,
}: {
  entry: AgentActivity;
  traderName: string;
  traderProfile?: TraderProfile;
  showTrader: boolean;
  wrapMessage?: boolean;
  onOpenDeal?: (dealId: string) => void;
  /** Open full message + metadata for rows without a linked deal */
  onShowDetail?: (entry: AgentActivity) => void;
  /** Desk manager CTA: open approval dialog for this log line when applicable */
  onReviewApproval?: (ctx: { traderId: string; dealId: string | null }) => void;
  reviewCtaEntryIds?: ReadonlySet<string>;
  approvalIdByEntryId?: ReadonlyMap<string, string>;
  /** Play the arrival animation (row appeared after initial load). */
  isNew?: boolean;
  /** Position within an arrival burst; staggers the animation delay. */
  burstIndex?: number;
}) {
  const { mutate } = useApproveReject();
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
  const canOpenDeal = Boolean(entry.deal_id && onOpenDeal);
  const canShowDetail = Boolean(onShowDetail) && !canOpenDeal;
  const isRowInteractive = canOpenDeal || canShowDetail;
  const displayTraderName = traderProfile?.name ?? traderName;

  const handleRowActivate = () => {
    if (canOpenDeal && entry.deal_id) {
      onOpenDeal?.(entry.deal_id);
    } else if (canShowDetail) {
      onShowDetail?.(entry);
    }
  };

  const subjectSuffix = displayTraderName ? ` for ${displayTraderName}` : "";
  const rowAriaLabel = canOpenDeal
    ? `Open deal${subjectSuffix}`
    : canShowDetail
      ? `View activity detail${subjectSuffix}`
      : undefined;

  return (
    <div
      role={isRowInteractive ? "button" : undefined}
      tabIndex={isRowInteractive ? 0 : undefined}
      aria-label={rowAriaLabel}
      onClick={(event) => {
        if (!isRowInteractive) return;
        // Let inner buttons (approve/reject/review) handle their own clicks.
        if ((event.target as HTMLElement).closest("button")) return;
        handleRowActivate();
      }}
      onKeyDown={(event) => {
        if (!isRowInteractive) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        // Let inner buttons handle Enter/Space themselves.
        if ((event.target as HTMLElement).closest("button")) return;
        event.preventDefault();
        handleRowActivate();
      }}
      className={`${getFeedGridClass(showTrader)} group border-b border-[var(--t-border)] last:border-b-0 px-3 py-1.5 text-xs transition-colors hover:bg-[var(--t-surface)] ${
        isRowInteractive
          ? "cursor-pointer focus:bg-[var(--t-surface)] focus:outline-none"
          : ""
      } ${
        entry.activity_type === "wipeout"
          ? "bg-[#D48787]/5"
          : "bg-[var(--t-bg)]"
      } ${isNew ? "mc-feed-enter" : ""} ${
        isNew && isHighEvent ? "mc-feed-enter-high" : ""
      }`}
      style={
        isNew
          ? ({
              animationDelay: staggerDelay(burstIndex),
              "--mc-feed-edge":
                entry.activity_type === "win"
                  ? "var(--t-green-hot)"
                  : "var(--t-red-hot)",
            } as React.CSSProperties)
          : undefined
      }
    >
      <span className="truncate tabular-nums text-[var(--t-muted)]">
        {time}
      </span>
      <span className={`truncate font-bold ${display.color}`}>
        {display.label}
      </span>
      {showTrader && (
        <span className="min-w-0 text-[var(--t-accent)]">
          <span className="truncate">{traderProfile?.name ?? traderName}</span>
        </span>
      )}
      <span
        className={`min-w-0 ${
          wrapMessage ? "break-words whitespace-normal" : "truncate"
        } ${isHighEvent ? "text-[var(--t-text)]" : "text-[var(--t-muted)]"}`}
      >
        {entry.message}
      </span>
      {isRowInteractive && actionState === "hidden" && (
        <span
          aria-hidden="true"
          className="justify-self-end border border-[var(--t-border)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--t-accent)] opacity-0 transition group-hover:border-[var(--t-accent)] group-hover:bg-[var(--t-accent-soft)] group-hover:opacity-100 group-focus:border-[var(--t-accent)] group-focus:bg-[var(--t-accent-soft)] group-focus:opacity-100 group-focus-within:opacity-100"
        >
          {canOpenDeal ? "Deal" : "Why"}
        </span>
      )}
      {actionState === "pending" && approvalId && (
        <div className="flex justify-self-end items-center justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => mutate({ approvalId, action: "approve" })}
            className="min-h-8 border border-[var(--t-green)]/60 px-2 py-1 font-bold uppercase tracking-wide text-[var(--t-green)] transition-colors hover:border-[var(--t-green)] hover:bg-[var(--t-green)]/10 focus:border-[var(--t-green)] focus:outline-none"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => mutate({ approvalId, action: "reject" })}
            className="min-h-8 border border-[var(--t-red)]/60 px-2 py-1 font-bold uppercase tracking-wide text-[var(--t-red)] transition-colors hover:border-[var(--t-red)] hover:bg-[var(--t-red)]/10 focus:border-[var(--t-red)] focus:outline-none"
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
          className="min-h-8 justify-self-end border border-[var(--t-amber)]/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--t-amber)] transition-colors hover:border-[var(--t-amber)] hover:bg-[var(--t-amber)]/10 focus:border-[var(--t-amber)] focus:outline-none"
        >
          Review
        </button>
      )}
    </div>
  );
}
