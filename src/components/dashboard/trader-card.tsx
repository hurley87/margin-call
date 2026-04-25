"use client";

import Link from "next/link";

import type { TraderSummary } from "@/hooks/use-portfolio";
import type { Trader } from "@/hooks/use-traders";
import { fmtMoney } from "@/lib/format";

interface TraderCardProps {
  summary: TraderSummary;
  trader?: Trader;
}

function initials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "??";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusMeta(status: string) {
  switch (status) {
    case "active":
      return {
        label: "ACTIVE",
        color: "text-[var(--t-green)]",
        dot: "bg-[var(--t-green)]",
      };
    case "paused":
      return {
        label: "PAUSED",
        color: "text-[var(--t-amber)]",
        dot: "bg-[var(--t-amber)]",
      };
    case "wiped_out":
      return {
        label: "WIPED",
        color: "text-[var(--t-red)]",
        dot: "bg-[var(--t-red)]",
      };
    default:
      return {
        label: status.toUpperCase(),
        color: "text-[var(--t-muted)]",
        dot: "bg-[var(--t-muted)]",
      };
  }
}

export function TraderCard({ summary, trader }: TraderCardProps) {
  const meta = statusMeta(summary.status);
  const personality =
    typeof trader?.personality === "string" &&
    trader.personality.trim().length > 0
      ? trader.personality.trim()
      : null;

  return (
    <Link
      href={`/traders/${summary.id}`}
      className="group flex w-[200px] shrink-0 flex-col border border-[var(--t-border)] bg-[var(--t-panel-strong)] transition-colors hover:border-[var(--t-accent)]"
    >
      {/* Monogram tile */}
      <div className="relative flex h-[110px] items-center justify-center border-b border-[var(--t-border)] bg-[var(--t-surface)]">
        <span className="font-[family-name:var(--font-plex-sans)] text-4xl font-bold tracking-[0.18em] text-[var(--t-accent)] [text-shadow:0_0_8px_rgba(214,166,96,0.35)]">
          {initials(summary.name)}
        </span>
        <span
          className={`absolute right-2 top-2 inline-flex items-center gap-1 border border-[var(--t-border)] bg-[var(--t-bg)]/80 px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${meta.color}`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`}
          />
          {meta.label}
        </span>
      </div>

      {/* Identity */}
      <div className="flex flex-col gap-0.5 border-b border-[var(--t-border)] px-2 py-1.5">
        <span className="truncate text-[12px] font-bold tracking-wider text-[var(--t-text)] group-hover:text-[var(--t-accent)]">
          {summary.name.toUpperCase()}
        </span>
        <span className="text-[9px] tracking-[0.2em] text-[var(--t-muted)]">
          TRADER
        </span>
      </div>

      {/* Numbers */}
      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-2 py-1.5 text-[10px]">
        <Row label="ESCROW" value={fmtMoney(summary.escrow_usdc)} />
        <Row label="ASSETS" value={fmtMoney(summary.asset_value_usdc)} />
        <Row
          label="TOTAL"
          value={fmtMoney(summary.total_value_usdc)}
          tone="accent"
        />
      </dl>

      {personality && (
        <div className="border-t border-[var(--t-border)] px-2 py-1.5">
          <p className="text-[9px] tracking-[0.18em] text-[var(--t-muted)]">
            STYLE
          </p>
          <p className="line-clamp-2 text-[10px] leading-snug text-[var(--t-text)]">
            {personality}
          </p>
        </div>
      )}
    </Link>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <>
      <dt className="text-[9px] tracking-[0.18em] text-[var(--t-muted)]">
        {label}
      </dt>
      <dd
        className={`text-right tabular-nums ${
          tone === "accent"
            ? "text-[var(--t-accent)] font-bold"
            : "text-[var(--t-text)]"
        }`}
      >
        {value}
      </dd>
    </>
  );
}
