"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { parseUnits } from "viem";
import { useTrader, useTraderHistory } from "@/hooks/use-traders";
import type { TraderHistoryEvent } from "@/hooks/use-traders";
import {
  useSepoliaUsdcBalance,
  useDepositFlow,
  useWithdrawFlow,
} from "@/hooks/use-escrow";
import {
  useTraderOutcomes,
  useTraderAssets,
  usePauseTrader,
  useResumeTrader,
  useReviveTrader,
} from "@/hooks/use-agent";
import type { DealOutcomeWithNarrative, TraderAsset } from "@/hooks/use-agent";
import {
  ESCROW_ADDRESS,
  escrowAbi,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";
import { useConfigureMandate } from "@/hooks/use-approvals";
import { useTraderRealtime } from "@/hooks/use-realtime";
import { Nav } from "@/components/nav";

export default function TraderDetailPage() {
  const { id } = useParams<{ id: string }>();
  useTraderRealtime(id);
  const { data: trader, isLoading, error } = useTrader(id);

  const { data: escrowBalance, refetch: refetchBalance } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getBalance",
    args: trader ? [BigInt(trader.token_id)] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: {
      enabled: !!trader,
      refetchInterval: 15_000,
    },
  });

  const { balance: walletUsdc } = useSepoliaUsdcBalance();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg)]">
        <p className="text-[var(--t-muted)]">Loading...</p>
      </div>
    );
  }

  if (error || !trader) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--t-bg)]">
        <p className="text-[var(--t-red)]">
          {error?.message ?? "Trader not found"}
        </p>
        <Link
          href="/traders"
          className="text-sm text-[var(--t-muted)] hover:text-[var(--t-text)]"
        >
          Back to traders
        </Link>
      </div>
    );
  }

  const balanceUsdc =
    escrowBalance !== undefined ? Number(escrowBalance) / 1_000_000 : null;

  return (
    <div className="min-h-screen bg-[var(--t-bg)]">
      <Nav />
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-[var(--t-text)] font-[family-name:var(--font-plex-sans)]">
              {trader.name}
            </h1>
            <StatusBadge status={trader.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-[var(--t-muted)]">Token ID</p>
              <p className="text-[var(--t-text)]">#{trader.token_id}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--t-muted)]">Escrow Balance</p>
              <p className="text-[var(--t-text)]">
                {balanceUsdc !== null ? `${balanceUsdc} USDC` : "..."}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-[var(--t-muted)]">Trader Wallet</p>
              <p className="font-mono text-xs text-[var(--t-text)]">
                {trader.tba_address ?? "Not derived"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-[var(--t-muted)]">Owner</p>
              <p className="font-mono text-xs text-[var(--t-text)]">
                {trader.owner_address}
              </p>
            </div>
          </div>

          <AgentControls traderId={id} status={trader.status} />
        </div>

        <ReputationSection traderId={id} traderStatus={trader.status} />

        <FundingSection
          traderId={trader.token_id}
          walletUsdc={walletUsdc}
          onSuccess={() => {
            refetchBalance();
            fetch(`/api/trader/${id}/balance`, { method: "POST" });
          }}
        />

        <MandateConfig traderId={id} mandate={trader.mandate} />

        <AssetInventory traderId={id} traderStatus={trader.status} />
        <DealOutcomes traderId={id} traderStatus={trader.status} />
        <ActivityHistory id={id} />
      </div>
    </div>
  );
}

/* ── Status Badge ── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "text-[var(--t-green)]",
    paused: "text-[var(--t-amber)]",
    wiped_out: "text-[var(--t-red)]",
  };

  const labels: Record<string, string> = {
    active: "[ACTIVE]",
    paused: "[PAUSED]",
    wiped_out: "[WIPED]",
  };

  return (
    <span
      className={`text-[10px] font-bold uppercase ${styles[status] ?? "text-[var(--t-muted)]"}`}
    >
      {labels[status] ?? `[${status.toUpperCase()}]`}
    </span>
  );
}

/* ── Agent Controls (Pause/Resume) ── */

function AgentControls({
  traderId,
  status,
}: {
  traderId: string;
  status: string;
}) {
  const pause = usePauseTrader();
  const resume = useResumeTrader();
  const revive = useReviveTrader();

  if (status === "wiped_out") {
    return (
      <div className="mt-4 border border-[var(--t-red)]/20 bg-[var(--t-red)]/5 px-4 py-3">
        <p className="text-sm text-[var(--t-red)]">
          This trader has been wiped out and can no longer trade.
        </p>
        <button
          onClick={() => revive.mutate(traderId)}
          disabled={revive.isPending}
          className="mt-3 border border-[var(--t-border)] px-4 py-2 text-sm text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] disabled:opacity-50"
        >
          {revive.isPending ? "Reviving..." : "Revive Trader"}
        </button>
        {revive.isError && (
          <p className="mt-2 text-xs text-[var(--t-red)]">
            {revive.error.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-3">
      {status === "active" ? (
        <button
          onClick={() => pause.mutate(traderId)}
          disabled={pause.isPending}
          className="border border-[var(--t-border)] px-4 py-2 text-sm text-[var(--t-amber)] transition-colors hover:border-[var(--t-amber)] disabled:opacity-50"
        >
          {pause.isPending ? "Pausing..." : "Pause Trading"}
        </button>
      ) : (
        <button
          onClick={() => resume.mutate(traderId)}
          disabled={resume.isPending}
          className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 py-2 text-sm text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50"
        >
          {resume.isPending ? "Resuming..." : "Start Trading"}
        </button>
      )}

      {status === "active" && (
        <span className="flex items-center gap-1.5 text-xs text-[var(--t-green)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--t-green)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--t-green)]" />
          </span>
          Trading autonomously
        </span>
      )}

      {pause.isError && (
        <p className="text-xs text-[var(--t-red)]">{pause.error.message}</p>
      )}
      {resume.isError && (
        <p className="text-xs text-[var(--t-red)]">{resume.error.message}</p>
      )}
    </div>
  );
}

/* ── Asset Inventory ── */

function AssetInventory({
  traderId,
  traderStatus,
}: {
  traderId: string;
  traderStatus: string;
}) {
  const { data: assets, isLoading } = useTraderAssets(traderId, traderStatus);

  return (
    <div className="mt-6 border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
      <h2 className="mb-3 text-sm font-medium text-[var(--t-muted)]">
        Asset Inventory
      </h2>
      {isLoading ? (
        <p className="text-sm text-[var(--t-muted)]">Loading...</p>
      ) : !assets || assets.length === 0 ? (
        <p className="text-sm text-[var(--t-muted)]">No assets acquired yet.</p>
      ) : (
        <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between bg-[var(--t-bg)] px-3 py-2"
            >
              <span className="text-sm text-[var(--t-text)]">{asset.name}</span>
              <span className="text-sm text-[var(--t-green)]">
                ${Number(asset.value_usdc).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Deal Outcomes with Narratives ── */

function DealOutcomes({
  traderId,
  traderStatus,
}: {
  traderId: string;
  traderStatus: string;
}) {
  const { data: outcomes, isLoading } = useTraderOutcomes(
    traderId,
    traderStatus
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="mt-6 border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
      <h2 className="mb-3 text-sm font-medium text-[var(--t-muted)]">
        Deal Outcomes
      </h2>
      {isLoading ? (
        <p className="text-sm text-[var(--t-muted)]">Loading...</p>
      ) : !outcomes || outcomes.length === 0 ? (
        <p className="text-sm text-[var(--t-muted)]">No deals entered yet.</p>
      ) : (
        <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
          {outcomes.map((outcome) => (
            <OutcomeCard
              key={outcome.id}
              outcome={outcome}
              isExpanded={expanded === outcome.id}
              onToggle={() =>
                setExpanded(expanded === outcome.id ? null : outcome.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OutcomeCard({
  outcome,
  isExpanded,
  onToggle,
}: {
  outcome: DealOutcomeWithNarrative;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const pnl = Number(outcome.trader_pnl_usdc);
  const isWin = pnl > 0;
  const isWipeout = outcome.trader_wiped_out;
  const pnlColor = isWin ? "text-[var(--t-green)]" : "text-[var(--t-red)]";
  const pnlLabel = isWipeout ? "WIPEOUT" : isWin ? "WIN" : "LOSS";

  return (
    <div
      className={`bg-[var(--t-bg)] ${
        isWipeout
          ? "border-l-2 border-l-[var(--t-red)]"
          : isWin
            ? "border-l-2 border-l-[var(--t-green)]"
            : ""
      }`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--t-surface)]"
      >
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${pnlColor}`}>{pnlLabel}</span>
          <span className={`text-sm ${pnlColor}`}>
            {pnl >= 0 ? "+" : ""}
            {pnl.toFixed(2)} USDC
          </span>
          {isWipeout && outcome.wipeout_reason && (
            <span className="text-[10px] text-[var(--t-red)]">
              ({outcome.wipeout_reason.replace("_", " ")})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--t-muted)]">
            {new Date(outcome.created_at).toLocaleString()}
          </span>
          <span className="text-xs text-[var(--t-muted)]">
            {isExpanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {isExpanded && outcome.narrative && (
        <div className="border-t border-[var(--t-border)] px-4 py-3">
          <div className="flex flex-col gap-3">
            {outcome.narrative.map((beat, i) => (
              <div key={i}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--t-muted)]">
                  {beat.event}
                </p>
                <p className="text-sm leading-relaxed text-[var(--t-text)]">
                  {beat.description}
                </p>
              </div>
            ))}
          </div>
          {outcome.assets_gained && outcome.assets_gained.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {outcome.assets_gained.map(
                (asset: { name: string; value_usdc: number }, i: number) => (
                  <span
                    key={i}
                    className="border border-[var(--t-green)]/30 px-2 py-1 text-xs text-[var(--t-green)]"
                  >
                    +{asset.name} (${asset.value_usdc})
                  </span>
                )
              )}
            </div>
          )}
          {outcome.assets_lost && outcome.assets_lost.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {outcome.assets_lost.map((name: string, i: number) => (
                <span
                  key={i}
                  className="border border-[var(--t-red)]/30 px-2 py-1 text-xs text-[var(--t-red)]"
                >
                  -{name}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-4 border-t border-[var(--t-border)] pt-3 text-xs text-[var(--t-muted)]">
            <span>Rake: ${Number(outcome.rake_usdc).toFixed(2)}</span>
            <span>
              Pot change: ${Number(outcome.pot_change_usdc).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── On-Chain Activity History ── */

function formatEvent(event: TraderHistoryEvent) {
  switch (event.type) {
    case "deposit":
      return {
        label: "Deposit",
        detail: `+${event.amount} USDC`,
        color: "text-[var(--t-green)]",
      };
    case "withdrawal":
      return {
        label: "Withdrawal",
        detail: `-${event.amount} USDC`,
        color: "text-[var(--t-red)]",
      };
    case "enter":
      return {
        label: "Entered Deal",
        detail: `Deal #${event.dealId}`,
        color: "text-[var(--t-text)]",
      };
    case "resolve": {
      const pnl = event.pnl ?? 0;
      const net = pnl > 0 ? pnl - (event.rake ?? 0) : pnl;
      const sign = net >= 0 ? "+" : "";
      return {
        label: pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Break-even",
        detail: `${sign}${net.toFixed(6)} USDC (Deal #${event.dealId})`,
        color:
          pnl > 0
            ? "text-[var(--t-green)]"
            : pnl < 0
              ? "text-[var(--t-red)]"
              : "text-[var(--t-text)]",
      };
    }
  }
}

function ActivityHistory({ id }: { id: string }) {
  const { data: events, isLoading } = useTraderHistory(id);

  return (
    <div className="mt-6 border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
      <h2 className="mb-3 text-sm font-medium text-[var(--t-muted)]">
        On-Chain History
      </h2>
      {isLoading ? (
        <p className="text-sm text-[var(--t-muted)]">Loading...</p>
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-[var(--t-muted)]">
          No on-chain activity yet.
        </p>
      ) : (
        <div className="flex flex-col gap-[1px] bg-[var(--t-border)]">
          {events.map((event, i) => {
            const { label, detail, color } = formatEvent(event);
            return (
              <div
                key={`${event.txHash}-${i}`}
                className="flex items-center justify-between bg-[var(--t-bg)] px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs font-medium text-[var(--t-muted)]">
                    {label}
                  </span>
                  <span className={`text-sm ${color}`}>{detail}</span>
                </div>
                <a
                  href={`https://sepolia.basescan.org/tx/${event.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--t-muted)] hover:text-[var(--t-accent)]"
                >
                  tx
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Mandate Configuration ── */

function MandateConfig({
  traderId,
  mandate,
}: {
  traderId: string;
  mandate: Record<string, unknown>;
}) {
  const configure = useConfigureMandate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    max_entry_cost_usdc:
      mandate.max_entry_cost_usdc != null
        ? String(mandate.max_entry_cost_usdc)
        : "",
    min_pot_usdc:
      mandate.min_pot_usdc != null ? String(mandate.min_pot_usdc) : "",
    max_pot_usdc:
      mandate.max_pot_usdc != null ? String(mandate.max_pot_usdc) : "",
    bankroll_pct:
      mandate.bankroll_pct != null ? String(mandate.bankroll_pct) : "25",
    approval_threshold_usdc:
      mandate.approval_threshold_usdc != null
        ? String(mandate.approval_threshold_usdc)
        : "",
    keywords: ((mandate.keywords as string[]) ?? []).join(", "),
  });

  function handleSave() {
    const cleaned: Record<string, unknown> = {};
    if (form.max_entry_cost_usdc !== "")
      cleaned.max_entry_cost_usdc = Number(form.max_entry_cost_usdc);
    if (form.min_pot_usdc !== "")
      cleaned.min_pot_usdc = Number(form.min_pot_usdc);
    if (form.max_pot_usdc !== "")
      cleaned.max_pot_usdc = Number(form.max_pot_usdc);
    if (form.bankroll_pct !== "")
      cleaned.bankroll_pct = Number(form.bankroll_pct);
    if (form.approval_threshold_usdc !== "")
      cleaned.approval_threshold_usdc = Number(form.approval_threshold_usdc);
    if (form.keywords.trim())
      cleaned.keywords = form.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

    configure.mutate(
      { traderId, mandate: cleaned },
      {
        onSuccess: () => setEditing(false),
      }
    );
  }

  if (!editing) {
    return (
      <div className="mt-6 border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--t-muted)]">Mandate</h2>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-[var(--t-muted)] hover:text-[var(--t-text)]"
          >
            Configure
          </button>
        </div>
        {Object.keys(mandate).length === 0 ? (
          <p className="text-sm text-[var(--t-muted)]">
            No mandate configured yet. Configure risk tolerance and deal filters
            to control how this trader enters deals.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {mandate.max_entry_cost_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Max Entry Cost</p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.max_entry_cost_usdc)} USDC
                </p>
              </div>
            )}
            {mandate.min_pot_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Min Pot</p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.min_pot_usdc)} USDC
                </p>
              </div>
            )}
            {mandate.max_pot_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Max Pot</p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.max_pot_usdc)} USDC
                </p>
              </div>
            )}
            {mandate.bankroll_pct !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Bankroll %</p>
                <p className="text-[var(--t-text)]">
                  {String(mandate.bankroll_pct)}%
                </p>
              </div>
            )}
            {mandate.approval_threshold_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">
                  Approval Threshold
                </p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.approval_threshold_usdc)} USDC
                </p>
              </div>
            )}
            {Array.isArray(mandate.keywords) &&
              (mandate.keywords as string[]).length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-[var(--t-muted)]">Keywords</p>
                  <p className="text-[var(--t-text)]">
                    {(mandate.keywords as string[]).join(", ")}
                  </p>
                </div>
              )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
      <h2 className="mb-3 text-sm font-medium text-[var(--t-muted)]">
        Configure Mandate
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs text-[var(--t-muted)]">
            Max Entry Cost (USDC)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.max_entry_cost_usdc}
            onChange={(e) =>
              setForm({ ...form, max_entry_cost_usdc: e.target.value })
            }
            placeholder="No limit"
            className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--t-muted)]">
            Min Pot (USDC)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.min_pot_usdc}
            onChange={(e) => setForm({ ...form, min_pot_usdc: e.target.value })}
            placeholder="No limit"
            className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--t-muted)]">
            Max Pot (USDC)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.max_pot_usdc}
            onChange={(e) => setForm({ ...form, max_pot_usdc: e.target.value })}
            placeholder="No limit"
            className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--t-muted)]">
            Bankroll % (1-100)
          </label>
          <input
            type="number"
            step="1"
            min="1"
            max="100"
            value={form.bankroll_pct}
            onChange={(e) => setForm({ ...form, bankroll_pct: e.target.value })}
            placeholder="25"
            className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--t-muted)]">
            Approval Threshold (USDC)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.approval_threshold_usdc}
            onChange={(e) =>
              setForm({ ...form, approval_threshold_usdc: e.target.value })
            }
            placeholder="No approval required"
            className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--t-muted)]">
            Keywords (comma-separated)
          </label>
          <input
            type="text"
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
            placeholder="e.g. oil, gold, tech"
            className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={configure.isPending}
          className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50"
        >
          {configure.isPending ? "Saving..." : "Save Mandate"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-sm text-[var(--t-muted)] hover:text-[var(--t-text)]"
        >
          Cancel
        </button>
      </div>
      {configure.isError && (
        <p className="mt-2 text-xs text-[var(--t-red)]">
          {configure.error.message}
        </p>
      )}
    </div>
  );
}

/* ── Reputation Section ── */

function ReputationSection({
  traderId,
  traderStatus,
}: {
  traderId: string;
  traderStatus: string;
}) {
  const { data: outcomes, isLoading } = useTraderOutcomes(
    traderId,
    traderStatus
  );

  if (isLoading || !outcomes) return null;

  const wins = outcomes.filter((o) => Number(o.trader_pnl_usdc) > 0).length;
  const losses = outcomes.filter((o) => Number(o.trader_pnl_usdc) < 0).length;
  const wipeouts = outcomes.filter((o) => o.trader_wiped_out).length;
  const totalPnl = outcomes.reduce(
    (acc, o) => acc + Number(o.trader_pnl_usdc),
    0
  );
  const totalDeals = outcomes.length;
  const winRate = totalDeals > 0 ? ((wins / totalDeals) * 100).toFixed(0) : "0";

  const reputationScore = Math.max(0, wins * 3 - losses - wipeouts * 5);

  if (totalDeals === 0) return null;

  return (
    <div className="mt-6 border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
      <h2 className="mb-3 text-sm font-medium text-[var(--t-muted)]">
        Reputation
      </h2>
      <div className="grid grid-cols-3 gap-4 text-center sm:grid-cols-6">
        <div>
          <p className="text-lg font-semibold text-[var(--t-text)]">
            {reputationScore}
          </p>
          <p className="text-xs text-[var(--t-muted)]">Score</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-[var(--t-green)]">{wins}</p>
          <p className="text-xs text-[var(--t-muted)]">Wins</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-[var(--t-red)]">{losses}</p>
          <p className="text-xs text-[var(--t-muted)]">Losses</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-[var(--t-text)]">
            {winRate}%
          </p>
          <p className="text-xs text-[var(--t-muted)]">Win Rate</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-[var(--t-red)]">
            {wipeouts}
          </p>
          <p className="text-xs text-[var(--t-muted)]">Wipeouts</p>
        </div>
        <div>
          <p
            className={`text-lg font-semibold ${totalPnl >= 0 ? "text-[var(--t-green)]" : "text-[var(--t-red)]"}`}
          >
            {totalPnl >= 0 ? "+" : ""}
            {totalPnl.toFixed(2)}
          </p>
          <p className="text-xs text-[var(--t-muted)]">Total P&L</p>
        </div>
      </div>
    </div>
  );
}

/* ── Funding Section ── */

function FundingSection({
  traderId,
  walletUsdc,
  onSuccess,
}: {
  traderId: number;
  walletUsdc: number | undefined;
  onSuccess: () => void;
}) {
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const {
    deposit,
    reset: resetDeposit,
    step: depositStep,
    error: depositError,
    isLoading: isDepositBusy,
  } = useDepositFlow();
  const {
    withdraw,
    reset: resetWithdraw,
    busy: withdrawBusy,
    done: withdrawDone,
    error: withdrawError,
  } = useWithdrawFlow();

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseUnits(depositAmount, 6);
    if (parsed === BigInt(0)) return;

    try {
      await deposit(BigInt(traderId), parsed);
      setDepositAmount("");
      onSuccess();
    } catch {
      // error surfaced via hook state
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseUnits(withdrawAmount, 6);
    if (parsed === BigInt(0)) return;

    try {
      await withdraw(BigInt(traderId), parsed);
      setWithdrawAmount("");
      onSuccess();
    } catch {
      // error surfaced via hook state
    }
  }

  return (
    <div className="mt-6 border border-[var(--t-border)] bg-[var(--t-surface)] p-6">
      <h2 className="mb-1 text-sm font-medium text-[var(--t-muted)]">
        Fund Trader
      </h2>
      {walletUsdc !== undefined && (
        <p className="mb-4 text-xs text-[var(--t-muted)]">
          Wallet balance: {walletUsdc} USDC (Base Sepolia)
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Deposit */}
        <form onSubmit={handleDeposit} className="flex flex-col gap-3">
          <label
            htmlFor="depositAmount"
            className="text-sm text-[var(--t-text)]"
          >
            Deposit USDC
          </label>
          <input
            id="depositAmount"
            type="number"
            step="0.01"
            min="0"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="0.00"
            disabled={isDepositBusy}
            className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isDepositBusy || !depositAmount}
            className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50"
          >
            {depositStep === "approving"
              ? "Approving USDC..."
              : depositStep === "depositing"
                ? "Depositing..."
                : "Deposit"}
          </button>
          {depositStep === "done" && (
            <p className="text-xs text-[var(--t-green)]">Deposit confirmed.</p>
          )}
          {depositError && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-[var(--t-red)]">
                {depositError.slice(0, 120)}
              </p>
              <button
                type="button"
                onClick={resetDeposit}
                className="text-xs text-[var(--t-muted)] underline hover:text-[var(--t-text)]"
              >
                Retry
              </button>
            </div>
          )}
        </form>

        {/* Withdraw */}
        <form onSubmit={handleWithdraw} className="flex flex-col gap-3">
          <label
            htmlFor="withdrawAmount"
            className="text-sm text-[var(--t-text)]"
          >
            Withdraw USDC
          </label>
          <input
            id="withdrawAmount"
            type="number"
            step="0.01"
            min="0"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="0.00"
            disabled={withdrawBusy}
            className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={withdrawBusy || !withdrawAmount}
            className="border border-[var(--t-border)] px-4 py-2 text-sm font-medium text-[var(--t-text)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-50"
          >
            {withdrawBusy ? "Withdrawing..." : "Withdraw"}
          </button>
          {withdrawDone && (
            <p className="text-xs text-[var(--t-green)]">
              Withdrawal confirmed.
            </p>
          )}
          {withdrawError && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-[var(--t-red)]">
                {withdrawError.slice(0, 120)}
              </p>
              <button
                type="button"
                onClick={resetWithdraw}
                className="text-xs text-[var(--t-muted)] underline hover:text-[var(--t-text)]"
              >
                Retry
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
