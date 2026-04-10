"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useTrader, useTraderHistory } from "@/hooks/use-traders";
import type { TraderHistoryEvent } from "@/hooks/use-traders";
import { useSepoliaUsdcBalance } from "@/hooks/use-escrow";
import {
  useTraderOutcomes,
  useTraderAssets,
  usePauseTrader,
  useResumeTrader,
  useReviveTrader,
} from "@/hooks/use-agent";
import type { DealOutcomeWithNarrative } from "@/hooks/use-agent";
import { NarrativeRenderer } from "@/components/narrative-renderer";
import {
  ESCROW_ADDRESS,
  escrowAbi,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";
import { useConfigureMandate } from "@/hooks/use-approvals";
import { useTraderRealtime } from "@/hooks/use-realtime";
import { Nav } from "@/components/nav";
import { TraderActivityPanel } from "@/components/trader-activity-panel";
import { WalletDialog } from "@/components/wire/wallet-dialog";
import { authFetch } from "@/lib/api";
import { shortAssetLabel } from "@/lib/format-asset-label";

const ZERO = BigInt(0);
const TRADER_SECTION_CLASS =
  "mt-6 border-t border-[var(--t-border)]/80 pt-6 first:mt-0 first:border-t-0 first:pt-0";
const TRADER_SECTION_TITLE_CLASS =
  "text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]";

function CollapsibleSection({
  title,
  children,
  action,
  defaultOpen = false,
  canCollapse = true,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  canCollapse?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={TRADER_SECTION_CLASS}>
      <div className="flex items-center gap-3">
        {canCollapse ? (
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
          >
            <h2 className={TRADER_SECTION_TITLE_CLASS}>{title}</h2>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]">
              {isOpen ? "Hide" : "Show"}
            </span>
          </button>
        ) : (
          <div className="flex-1">
            <h2 className={TRADER_SECTION_TITLE_CLASS}>{title}</h2>
          </div>
        )}
        {action}
      </div>
      {isOpen && <div className="mt-3">{children}</div>}
    </section>
  );
}

export default function TraderDetailPage() {
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  useTraderRealtime(id);
  const { data: trader, isLoading, error } = useTrader(id);
  const syncInFlightRef = useRef(false);

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
  const [walletOpen, setWalletOpen] = useState(false);
  const hasAutoOpened = useRef(false);
  const balanceUsdc =
    escrowBalance !== undefined ? Number(escrowBalance) / 1_000_000 : null;
  const cachedEscrowUsdc =
    typeof trader?.escrow_balance_usdc === "number"
      ? trader.escrow_balance_usdc
      : null;

  useEffect(() => {
    if (!trader) return;
    if (balanceUsdc === null || cachedEscrowUsdc === null) return;
    if (Math.abs(balanceUsdc - cachedEscrowUsdc) < 0.000001) return;
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;

    void authFetch(`/api/trader/${id}/balance`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("Balance sync failed");
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: ["trader", id] }),
          queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
        ]);
      })
      .catch((err) => console.error("Balance sync error:", err))
      .finally(() => {
        syncInFlightRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, balanceUsdc, cachedEscrowUsdc, queryClient]);

  const unfunded = escrowBalance === undefined || escrowBalance === ZERO;
  const isNewTrader = !!trader && trader.status === "paused" && unfunded;

  // Auto-open wallet dialog for new unfunded traders with no wallet balance
  useEffect(() => {
    if (hasAutoOpened.current) return;
    if (!isNewTrader) return;
    if (walletUsdc === undefined || walletUsdc > 0) return;
    hasAutoOpened.current = true;
    setWalletOpen(true);
  }, [isNewTrader, walletUsdc]);

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

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav containerClassName="max-w-[1600px]" />

      {/* Trader Header Strip */}
      <div className="sticky top-[37px] z-20 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
            >
              &larr;
            </Link>
            <h1 className="truncate text-base font-semibold text-[var(--t-text)] font-[family-name:var(--font-plex-sans)]">
              {trader.name}
            </h1>
            <StatusBadge status={trader.status} />
          </div>
          <div className="flex shrink-0 items-center gap-4 text-xs">
            <button
              onClick={() => setWalletOpen(true)}
              className={`flex items-center gap-1 text-right transition-colors hover:text-[var(--t-accent)] ${
                unfunded ? "text-[var(--t-amber)]" : "text-[var(--t-text)]"
              }`}
            >
              <span className="text-[var(--t-muted)]">[$$]</span>
              <span>
                {balanceUsdc !== null ? `$${balanceUsdc.toFixed(2)}` : "..."}
              </span>
            </button>
            <span className="text-[var(--t-muted)]">#{trader.token_id}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-6">
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-10 xl:gap-12">
          <div className="min-w-0">
            <AgentControls
              traderId={id}
              status={trader.status}
              unfunded={unfunded}
              onOpenWallet={() => setWalletOpen(true)}
            />
            <ReputationSection traderId={id} />

            <MandateConfig
              traderId={id}
              mandate={trader.mandate}
              personality={trader.personality ?? null}
            />
            <AssetInventory traderId={id} />
            <DealOutcomes traderId={id} />
            <ActivityHistory id={id} />
          </div>

          <aside className="min-w-0 lg:sticky lg:top-[89px] lg:self-start lg:border-l lg:border-[var(--t-border)]/80 lg:pl-8 xl:pl-10">
            <TraderActivityPanel traderId={id} />
          </aside>
        </div>
      </div>

      {walletOpen && (
        <WalletDialog
          open
          onOpenChange={setWalletOpen}
          traderId={trader.token_id}
          supabaseId={id}
          walletUsdc={walletUsdc}
          escrowUsdc={balanceUsdc}
          tbaAddress={trader.tba_address}
          ownerAddress={trader.owner_address}
          isNewTrader={isNewTrader}
          onSuccess={() => {
            refetchBalance();
            authFetch(`/api/trader/${id}/balance`, { method: "POST" });
          }}
        />
      )}
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
  unfunded,
  onOpenWallet,
}: {
  traderId: string;
  status: string;
  unfunded: boolean;
  onOpenWallet: () => void;
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
    <div className="flex flex-wrap items-center gap-3">
      {status === "active" ? (
        <>
          <span className="flex items-center gap-1.5 text-xs text-[var(--t-green)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--t-green)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--t-green)]" />
            </span>
            Trading autonomously
          </span>
          <button
            onClick={() => pause.mutate(traderId)}
            disabled={pause.isPending}
            className="ml-auto border border-[var(--t-border)] px-3 py-1.5 text-xs text-[var(--t-amber)] transition-colors hover:border-[var(--t-amber)] disabled:opacity-50"
          >
            {pause.isPending ? "PAUSING..." : "PAUSE"}
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => resume.mutate(traderId)}
            disabled={resume.isPending || unfunded}
            className="border border-[var(--t-accent)] px-4 py-1.5 text-xs font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resume.isPending ? "ACTIVATING..." : "ACTIVATE TRADING"}
          </button>
          {unfunded ? (
            <button
              onClick={onOpenWallet}
              className="text-xs text-[var(--t-amber)] transition-colors hover:text-[var(--t-accent)]"
            >
              Deposit USDC to enable &rarr;
            </button>
          ) : (
            <span className="text-xs text-[var(--t-muted)]">
              Ready to trade
            </span>
          )}
        </>
      )}

      {pause.isError && (
        <p className="ml-auto text-xs text-[var(--t-red)]">
          {pause.error.message}
        </p>
      )}
      {resume.isError && (
        <p className="ml-auto text-xs text-[var(--t-red)]">
          {resume.error.message}
        </p>
      )}
    </div>
  );
}

/* ── Asset Inventory ── */

function AssetInventory({ traderId }: { traderId: string }) {
  const { data: assets, isLoading } = useTraderAssets(traderId);

  return (
    <CollapsibleSection title="Asset Inventory">
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
              <span className="text-sm text-[var(--t-text)]">
                {shortAssetLabel(asset.name)}
              </span>
              <span className="text-sm text-[var(--t-green)]">
                ${Number(asset.value_usdc).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

/* ── Deal Outcomes with Narratives ── */

function DealOutcomes({ traderId }: { traderId: string }) {
  const { data: outcomes, isLoading } = useTraderOutcomes(traderId);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <CollapsibleSection title="Deal Outcomes">
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
    </CollapsibleSection>
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
          <div className="text-sm leading-relaxed text-[var(--t-text)]">
            <NarrativeRenderer narrative={outcome.narrative} />
          </div>
          {outcome.assets_gained && outcome.assets_gained.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {outcome.assets_gained.map(
                (asset: { name: string; value_usdc: number }, i: number) => (
                  <span
                    key={i}
                    className="border border-[var(--t-green)]/30 px-2 py-1 text-xs text-[var(--t-green)]"
                  >
                    +{shortAssetLabel(asset.name)} (${asset.value_usdc})
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
                  -{shortAssetLabel(name)}
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
    <CollapsibleSection title="On-Chain History">
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
    </CollapsibleSection>
  );
}

/* ── Mandate Configuration ── */

function mandateFormDefaults(
  mandate: Record<string, unknown>,
  personality: string | null
) {
  return {
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
    personality: personality ?? "",
    llm_deal_selection: mandate.llm_deal_selection !== false,
  };
}

function MandateConfig({
  traderId,
  mandate,
  personality,
}: {
  traderId: string;
  mandate: Record<string, unknown>;
  personality: string | null;
}) {
  const configure = useConfigureMandate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() =>
    mandateFormDefaults(mandate, personality)
  );

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

    cleaned.llm_deal_selection = form.llm_deal_selection;

    configure.mutate(
      {
        traderId,
        mandate: cleaned,
        personality:
          form.personality.trim() === "" ? null : form.personality.trim(),
      },
      {
        onSuccess: () => setEditing(false),
      }
    );
  }

  function openEdit() {
    setForm(mandateFormDefaults(mandate, personality));
    setEditing(true);
  }

  if (!editing) {
    return (
      <CollapsibleSection
        key="mandate-view"
        title="Mandate"
        action={
          <button
            type="button"
            onClick={openEdit}
            className="text-xs text-[var(--t-muted)] hover:text-[var(--t-text)]"
          >
            Configure
          </button>
        }
      >
        {(personality?.trim() || mandate.llm_deal_selection === false) && (
          <div className="mb-4 space-y-2 text-sm">
            {personality?.trim() && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Personality</p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Injected into AI deal selection
                </p>
                <p className="whitespace-pre-wrap text-[var(--t-text)]">
                  {personality}
                </p>
              </div>
            )}
            {mandate.llm_deal_selection === false && (
              <p className="text-xs text-[var(--t-amber)]">
                LLM deal selection is off — using pot/entry ratio only.
              </p>
            )}
          </div>
        )}
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
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Maximum USDC to pay for a single deal
                </p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.max_entry_cost_usdc)} USDC
                </p>
              </div>
            )}
            {mandate.min_pot_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Min Pot</p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Only enter deals with at least this pot
                </p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.min_pot_usdc)} USDC
                </p>
              </div>
            )}
            {mandate.max_pot_usdc !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Max Pot</p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Skip deals where the pot exceeds this
                </p>
                <p className="text-[var(--t-text)]">
                  ${String(mandate.max_pot_usdc)} USDC
                </p>
              </div>
            )}
            {mandate.bankroll_pct !== undefined && (
              <div>
                <p className="text-xs text-[var(--t-muted)]">Bankroll %</p>
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  % of escrow balance to risk per deal
                </p>
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
                <p className="text-[10px] text-[var(--t-muted)]/60">
                  Deals above this cost need your approval
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
                  <p className="text-[10px] text-[var(--t-muted)]/60">
                    Only enter deals matching these keywords
                  </p>
                  <p className="text-[var(--t-text)]">
                    {(mandate.keywords as string[]).join(", ")}
                  </p>
                </div>
              )}
          </div>
        )}
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection
      key="mandate-edit"
      title="Configure Mandate"
      defaultOpen
      canCollapse={false}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Max Entry Cost (USDC)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Maximum USDC your trader will pay to enter a single deal
          </p>
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
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Min Pot (USDC)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Only enter deals where the pot is at least this amount
          </p>
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
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Max Pot (USDC)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Skip deals where the pot exceeds this amount
          </p>
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
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Bankroll % (1-100)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Percentage of escrow balance to risk per deal
          </p>
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
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Approval Threshold (USDC)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Deals above this cost require your manual approval
          </p>
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
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Keywords (comma-separated)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Only enter deals matching these keywords (leave empty for all)
          </p>
          <input
            type="text"
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
            placeholder="e.g. oil, gold, tech"
            className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 flex items-center gap-2 text-xs text-[var(--t-muted)]">
            <input
              type="checkbox"
              checked={form.llm_deal_selection}
              onChange={(e) =>
                setForm({ ...form, llm_deal_selection: e.target.checked })
              }
              className="border-[var(--t-border)]"
            />
            Use GPT for deal selection (vs. pot/entry ratio only)
          </label>
          <p className="mt-1 text-[10px] text-[var(--t-muted)]/60">
            When enabled, the model ranks eligible deals using prompts, creator
            history, and outcome stats. Requires OPENAI_API_KEY on the server.
          </p>
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 block text-xs text-[var(--t-muted)]">
            Personality / strategy (optional)
          </label>
          <p className="mb-1 text-[10px] text-[var(--t-muted)]/60">
            Short instructions for how this trader judges deals (risk posture,
            skepticism of trap deals, etc.). Max 2000 characters.
          </p>
          <textarea
            value={form.personality}
            onChange={(e) => setForm({ ...form, personality: e.target.value })}
            rows={4}
            maxLength={2000}
            placeholder="e.g. Cautious: avoid large pots from unknown creators…"
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
    </CollapsibleSection>
  );
}

/* ── Reputation Section ── */

function ReputationSection({ traderId }: { traderId: string }) {
  const { data: outcomes, isLoading } = useTraderOutcomes(traderId);

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
    <section className={TRADER_SECTION_CLASS}>
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
    </section>
  );
}
