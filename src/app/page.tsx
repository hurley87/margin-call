"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useDeskManager } from "@/hooks/use-desk";
import { usePortfolio, type PnlPoint } from "@/hooks/use-portfolio";
import { useTraders } from "@/hooks/use-traders";
import { usePendingApprovals } from "@/hooks/use-approvals";
import { useDeals } from "@/hooks/use-deals";
import { useDashboardRealtime } from "@/hooks/use-realtime";

export default function Home() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { data: deskManager, isLoading: deskLoading } = useDeskManager();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Margin Call
        </h1>
        <p className="text-zinc-400">Wall Street Agent Trading Game</p>
        <button
          onClick={login}
          className="rounded-full bg-green-500 px-8 py-3 font-medium text-black transition-colors hover:bg-green-400"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (deskLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-zinc-400">Registering...</p>
      </div>
    );
  }

  if (!deskManager) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="text-zinc-400">No wallet connected</p>
        <button
          onClick={logout}
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return <Dashboard displayName={deskManager.display_name} onLogout={logout} />;
}

function Dashboard({
  displayName,
  onLogout,
}: {
  displayName: string;
  onLogout: () => void;
}) {
  useDashboardRealtime();

  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: traders } = useTraders();
  const { data: approvals } = usePendingApprovals();
  const { data: deals } = useDeals();

  return (
    <div className="flex min-h-screen flex-col items-center bg-black px-4 py-8">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">
              {displayName}
            </h1>
            <p className="text-sm text-zinc-500">Desk Manager Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            {approvals && approvals.length > 0 && (
              <Link
                href="/approvals"
                className="flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400 transition-colors hover:bg-orange-500/20"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-black">
                  {approvals.length}
                </span>
                Approvals
              </Link>
            )}
            <button
              onClick={onLogout}
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Portfolio Overview */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Portfolio Value"
            value={
              portfolioLoading
                ? "..."
                : `$${(portfolio?.total_value_usdc ?? 0).toFixed(2)}`
            }
            highlight
          />
          <StatCard
            label="Total P&L"
            value={
              portfolioLoading
                ? "..."
                : `${(portfolio?.stats.total_pnl ?? 0) >= 0 ? "+" : ""}$${(portfolio?.stats.total_pnl ?? 0).toFixed(2)}`
            }
            positive={(portfolio?.stats.total_pnl ?? 0) >= 0}
          />
          <StatCard
            label="Win / Loss"
            value={
              portfolioLoading
                ? "..."
                : `${portfolio?.stats.total_wins ?? 0}W / ${portfolio?.stats.total_losses ?? 0}L`
            }
          />
          <StatCard
            label="Wipeouts"
            value={
              portfolioLoading
                ? "..."
                : String(portfolio?.stats.total_wipeouts ?? 0)
            }
          />
        </div>

        {/* P&L Chart */}
        {portfolio && portfolio.pnl_history.length > 1 && (
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-4 text-sm font-medium text-zinc-400">
              P&L Over Time
            </h2>
            <PnlChart data={portfolio.pnl_history} />
          </div>
        )}

        {/* Quick Nav */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Link
            href="/traders"
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center transition-colors hover:border-zinc-700"
          >
            <p className="text-lg font-semibold text-zinc-50">
              {traders?.length ?? 0}
            </p>
            <p className="text-xs text-zinc-500">Traders</p>
          </Link>
          <Link
            href="/deals"
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center transition-colors hover:border-zinc-700"
          >
            <p className="text-lg font-semibold text-zinc-50">
              {deals?.length ?? 0}
            </p>
            <p className="text-xs text-zinc-500">Open Deals</p>
          </Link>
          <Link
            href="/deals/create"
            className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm font-medium text-green-400 transition-colors hover:border-zinc-700"
          >
            + New Deal
          </Link>
        </div>

        {/* Per-Trader Breakdown */}
        {portfolio && portfolio.traders.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-4 text-sm font-medium text-zinc-400">
              Trader Breakdown
            </h2>
            <div className="flex flex-col gap-3">
              {portfolio.traders.map((t) => (
                <Link
                  key={t.id}
                  href={`/traders/${t.id}`}
                  className="flex items-center justify-between rounded border border-zinc-700/50 bg-zinc-800/50 px-4 py-3 transition-colors hover:border-zinc-600"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-50">
                      {t.name}
                    </span>
                    <TraderStatusDot status={t.status} />
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-zinc-400">
                      Escrow: ${t.escrow_usdc.toFixed(2)}
                    </span>
                    {t.asset_value_usdc > 0 && (
                      <span className="text-zinc-400">
                        Assets: ${t.asset_value_usdc.toFixed(2)}
                      </span>
                    )}
                    <span className="font-medium text-zinc-50">
                      ${t.total_value_usdc.toFixed(2)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!portfolioLoading && portfolio && portfolio.traders.length === 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="mb-2 text-zinc-400">No traders yet</p>
            <Link
              href="/traders"
              className="text-sm text-green-400 hover:text-green-300"
            >
              Create your first trader to start trading
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Stat Card ── */

function StatCard({
  label,
  value,
  highlight,
  positive,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  positive?: boolean;
}) {
  const valueColor = highlight
    ? "text-green-400"
    : positive !== undefined
      ? positive
        ? "text-green-400"
        : "text-red-400"
      : "text-zinc-50";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="mb-1 text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

/* ── Trader Status Dot ── */

function TraderStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-400",
    paused: "bg-yellow-400",
    wiped_out: "bg-red-400",
  };

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[status] ?? "bg-zinc-500"}`}
      title={status}
    />
  );
}

/* ── P&L Chart (SVG area chart) ── */

function PnlChart({ data }: { data: PnlPoint[] }) {
  const width = 600;
  const height = 160;
  const padding = { top: 10, right: 10, bottom: 20, left: 50 };

  const values = data.map((d) => d.cumulative_pnl);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const range = maxVal - minVal || 1;

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y =
      padding.top + chartH - ((d.cumulative_pnl - minVal) / range) * chartH;
    return { x, y };
  });

  const zeroY = padding.top + chartH - ((0 - minVal) / range) * chartH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${zeroY} L${points[0].x},${zeroY} Z`;

  const lastVal = values[values.length - 1];
  const isPositive = lastVal >= 0;
  const strokeColor = isPositive ? "#4ade80" : "#f87171";
  const fillColor = isPositive
    ? "rgba(74, 222, 128, 0.1)"
    : "rgba(248, 113, 113, 0.1)";

  // Y-axis labels
  const yLabels = [minVal, minVal + range / 2, maxVal];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Zero line */}
      <line
        x1={padding.left}
        y1={zeroY}
        x2={width - padding.right}
        y2={zeroY}
        stroke="#3f3f46"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* Y-axis labels */}
      {yLabels.map((val, i) => {
        const y = padding.top + chartH - ((val - minVal) / range) * chartH;
        return (
          <text
            key={i}
            x={padding.left - 8}
            y={y + 4}
            textAnchor="end"
            className="fill-zinc-600"
            fontSize={10}
          >
            {val >= 0 ? "+" : ""}
            {val.toFixed(1)}
          </text>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill={fillColor} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={2} />

      {/* End dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={3}
        fill={strokeColor}
      />
    </svg>
  );
}
