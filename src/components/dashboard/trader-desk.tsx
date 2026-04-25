"use client";

import Link from "next/link";
import { useMemo } from "react";

import { usePortfolio } from "@/hooks/use-portfolio";
import { useTraders, type Trader } from "@/hooks/use-traders";

import { TraderCard } from "./trader-card";

const ACTION_BUTTONS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/wire", label: "NEW DEAL" },
  { href: "/traders", label: "MANAGE TRADERS" },
  { href: "/traders/new", label: "HIRE TRADER" },
  { href: "/leaderboard", label: "LEADERBOARD" },
];

export function TraderDesk() {
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: traders } = useTraders();

  const traderById = useMemo(() => {
    const map = new Map<string, Trader>();
    for (const t of traders ?? []) map.set(t.id, t);
    return map;
  }, [traders]);

  const summaries = portfolio?.traders ?? [];

  return (
    <section aria-labelledby="desk-heading" className="panel">
      <div className="panel-header">
        <h2 id="desk-heading" className="text-[var(--t-accent)]">
          YOUR TRADING DESK
        </h2>
        <span className="text-[10px] tracking-wider text-[var(--t-muted)]">
          {summaries.length} ON DESK
        </span>
      </div>

      <div className="flex flex-col">
        <div className="flex gap-2 overflow-x-auto p-2">
          {portfolioLoading ? (
            <div className="px-3 py-6 text-xs text-[var(--t-muted)]">
              LOADING DESK...<span className="cursor-blink">█</span>
            </div>
          ) : summaries.length === 0 ? (
            <EmptyDesk />
          ) : (
            summaries.map((s) => (
              <TraderCard
                key={s.id}
                summary={s}
                trader={traderById.get(s.id)}
              />
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-[1px] border-t border-[var(--t-border)] bg-[var(--t-border)] sm:grid-cols-4">
          {ACTION_BUTTONS.map((btn) => (
            <Link
              key={btn.href}
              href={btn.href}
              className="bg-[var(--t-surface)] px-3 py-2 text-center text-[11px] font-bold tracking-[0.2em] text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent-soft)] hover:text-[var(--t-text)]"
            >
              {btn.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyDesk() {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 px-3 py-8 text-center">
      <p className="text-xs text-[var(--t-muted)]">NO TRADERS ON YOUR DESK</p>
      <Link
        href="/traders/new"
        className="border border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-2 text-xs text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
      >
        {">"} HIRE YOUR FIRST TRADER
        <span className="cursor-blink">█</span>
      </Link>
    </div>
  );
}
