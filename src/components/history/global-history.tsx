"use client";

import { useGlobalHistory } from "@/hooks/use-global-history";
import type {
  RoundHistoryDetail,
  RoundHistoryItem,
  RoundHistoryState,
} from "@/lib/margin-call-crash";
import { ReplayCurveThumb } from "@/components/round-theater/replay-curve";
import { historyStateCopy } from "./history-state-copy";
import { RoundVerificationRecord } from "./round-verification-record";

const historyStateColors: Record<RoundHistoryState, string> = {
  open: "text-[var(--t-green-hot)] border-[var(--t-green)]/50",
  delayed: "text-[var(--t-amber-hot)] border-[var(--t-amber)]/50",
  empty: "text-[var(--t-muted)] border-[var(--t-muted)]/40",
  finalized: "text-[var(--t-green)] border-[var(--t-green)]/40",
  expired: "text-[var(--t-muted)] border-[var(--t-muted)]/40",
};

/**
 * Public global history: ≥20 lookback rounds with honest delayed/expired
 * states and expandable verification records. Page chrome (heading, eyebrow)
 * lives on /history.
 */
export function GlobalHistory() {
  const history = useGlobalHistory();

  if (history.status === "loading") {
    return (
      <section
        aria-busy="true"
        aria-labelledby="global-history-loading"
        className="text-left"
      >
        <p
          id="global-history-loading"
          className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]"
        >
          Reading round history from Base Sepolia…
        </p>
      </section>
    );
  }

  if (history.status !== "ready") {
    return (
      <section aria-labelledby="global-history-error" className="text-left">
        <p
          id="global-history-error"
          className="text-sm text-[var(--t-red-hot)]"
          role="alert"
        >
          {history.error}
        </p>
        <button
          className="mt-4 rounded-sm border border-[var(--t-muted)] px-4 py-2 text-sm font-bold"
          onClick={() => void history.retry()}
          type="button"
        >
          Retry
        </button>
      </section>
    );
  }

  if (history.rounds.length === 0) {
    return (
      <section aria-label="Recent rounds" className="text-left">
        <p className="text-sm text-[var(--t-muted)]">
          No initialized rounds in the lookback window yet.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Recent rounds" className="text-left">
      <ul className="divide-y divide-[var(--t-divider)] border-y border-[var(--t-divider)]">
        {history.rounds.map((item) => {
          const isSelected = history.selectedRoundId === item.round.id;
          return (
            <HistoryRoundRow
              detail={isSelected ? history.detail : null}
              detailStatus={isSelected ? history.detailStatus : "idle"}
              item={item}
              key={item.round.id.toString()}
              onSelect={() => {
                if (isSelected) {
                  history.clearSelection();
                  return;
                }
                history.selectRound(item.round.id);
              }}
              selected={isSelected}
            />
          );
        })}
      </ul>
    </section>
  );
}

function HistoryRoundRow({
  item,
  selected,
  onSelect,
  detail,
  detailStatus,
}: {
  item: RoundHistoryItem;
  selected: boolean;
  onSelect: () => void;
  detail: RoundHistoryDetail | null;
  detailStatus: "idle" | "loading" | "ready" | "error";
}) {
  const crashLabel =
    item.historyState === "finalized" && item.displayCrashPoint
      ? item.displayCrashPoint
      : item.historyState === "delayed"
        ? "Awaiting attestation"
        : item.historyState === "empty"
          ? "No entries"
          : item.historyState === "expired"
            ? "Expired — no result"
            : "—";
  const showThumb =
    item.historyState === "finalized" && item.round.crashPointBps > 0n;

  return (
    <li className="py-4">
      <button
        aria-expanded={selected}
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
        onClick={onSelect}
        type="button"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {showThumb ? (
            <ReplayCurveThumb crashPointBps={item.round.crashPointBps} />
          ) : null}
          <span className="font-[family-name:var(--font-plex-sans)] text-lg font-bold tabular-nums text-[var(--t-text)]">
            Round {item.round.id.toString()}
          </span>
          <span
            className={`inline-flex border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${historyStateColors[item.historyState]}`}
          >
            {historyStateCopy[item.historyState].badge}
          </span>
        </div>
        <span
          className={
            item.displayCrashPoint
              ? "font-[family-name:var(--font-plex-sans)] text-xl font-bold tabular-nums text-[var(--t-green-hot)]"
              : "text-sm text-[var(--t-muted)]"
          }
        >
          {crashLabel}
        </span>
      </button>

      {selected ? (
        detailStatus === "loading" ? (
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--t-muted)]">
            Loading verification record…
          </p>
        ) : detailStatus === "error" || !detail ? (
          <p className="mt-4 text-sm text-[var(--t-red-hot)]" role="alert">
            Verification record could not be loaded for this round.
          </p>
        ) : (
          <RoundVerificationRecord detail={detail} />
        )
      ) : null}
    </li>
  );
}
