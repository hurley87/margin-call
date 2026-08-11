"use client";

import type { RoundHistoryDetail } from "@/lib/margin-call-crash";
import { formatDeskDollars, TUSD_DECIMALS } from "@/lib/desk-dollars";

type RoundVerificationRecordProps = {
  detail: RoundHistoryDetail;
};

/**
 * Public verification record: timestamps, aggregates, handle, attestation,
 * and BaseScan links for every reconstructable lifecycle/settlement tx.
 */
export function RoundVerificationRecord({
  detail,
}: RoundVerificationRecordProps) {
  const { round } = detail;
  const links = [
    detail.openingTransactionUrl
      ? {
          href: detail.openingTransactionUrl,
          label: "View opening transaction",
        }
      : null,
    detail.revealTransactionUrl
      ? { href: detail.revealTransactionUrl, label: "View reveal transaction" }
      : null,
    detail.finalizeTransactionUrl
      ? {
          href: detail.finalizeTransactionUrl,
          label: "View finalization transaction",
        }
      : null,
    detail.expireTransactionUrl
      ? { href: detail.expireTransactionUrl, label: "View expiry transaction" }
      : null,
    ...detail.ticketEnteredTransactionUrls.map((href, index) => ({
      href,
      label:
        detail.ticketEnteredTransactionUrls.length === 1
          ? "View entry transaction"
          : `View entry transaction ${index + 1}`,
    })),
    ...detail.ticketClaimedTransactionUrls.map((href, index) => ({
      href,
      label:
        detail.ticketClaimedTransactionUrls.length === 1
          ? "View claim transaction"
          : `View claim transaction ${index + 1}`,
    })),
    ...detail.ticketRefundedTransactionUrls.map((href, index) => ({
      href,
      label:
        detail.ticketRefundedTransactionUrls.length === 1
          ? "View refund transaction"
          : `View refund transaction ${index + 1}`,
    })),
    { href: detail.gameContractUrl, label: "Verified game contract" },
    { href: detail.incoContractUrl, label: "Verified Inco Lightning" },
  ].filter((link): link is { href: string; label: string } => link !== null);

  return (
    <div
      aria-labelledby={`round-detail-${round.id.toString()}`}
      className="mt-4 border border-[var(--t-border)] bg-[var(--t-bg)]/40 p-4 text-left"
    >
      <p
        id={`round-detail-${round.id.toString()}`}
        className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.18em] text-[var(--t-muted)]"
      >
        Verification record · Round {round.id.toString()}
      </p>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--t-muted)]">Opened</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {formatUnix(round.openAt)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Locked</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {formatUnix(round.lockAt)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Expires</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {formatUnix(round.expiresAt)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">History state</dt>
          <dd className="text-[var(--t-text)]">{historyStateLabel(detail)}</dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Aggregate margin</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {formatDeskDollars(round.totalMargin, TUSD_DECIMALS)} tUSD
          </dd>
        </div>
        <div>
          <dt className="text-[var(--t-muted)]">Reserved payouts</dt>
          <dd className="tabular-nums text-[var(--t-text)]">
            {formatDeskDollars(round.reservedPayout, TUSD_DECIMALS)} tUSD
          </dd>
        </div>
        {detail.displayCrashPoint ? (
          <div>
            <dt className="text-[var(--t-muted)]">Attested Crash Point</dt>
            <dd className="tabular-nums text-[var(--t-green-hot)]">
              {detail.displayCrashPoint}
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-[var(--t-muted)]">Attested Crash Point</dt>
            <dd className="text-[var(--t-muted)]">
              Not available — round is not finalized
            </dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-[var(--t-muted)]">Encrypted handle</dt>
          <dd className="break-all font-mono text-xs text-[var(--t-text)]">
            {round.crashRandom}
          </dd>
        </div>
      </dl>

      <ul className="mt-4 space-y-2">
        {links.map((link) => (
          <li key={`${link.label}:${link.href}`}>
            <a
              className="group inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--t-accent)] underline decoration-[var(--t-border)] underline-offset-4 hover:text-[var(--t-text)]"
              href={link.href}
              rel="noreferrer"
              target="_blank"
            >
              {link.label}
              <span aria-hidden="true" className="wire-cta-bounce">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function historyStateLabel(detail: RoundHistoryDetail) {
  switch (detail.historyState) {
    case "finalized":
      return "Finalized";
    case "expired":
      return "Expired — no invented multiplier";
    case "delayed":
      return "Delayed — awaiting attestation";
    case "open":
      return "Open";
    default: {
      const _exhaustive: never = detail.historyState;
      return _exhaustive;
    }
  }
}

function formatUnix(seconds: bigint) {
  return new Date(Number(seconds) * 1_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}
