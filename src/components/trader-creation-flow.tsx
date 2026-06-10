"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { parseUnits } from "viem";

import {
  useConvexCreateTrader,
  useConvexTraders,
} from "@/hooks/use-convex-traders";
import { useTrader } from "@/hooks/use-traders";
import { useDepositFlow, useTraderEscrowBalance } from "@/hooks/use-escrow";
import { useResumeTrader } from "@/hooks/use-agent";
import { authFetch, syncDeskWalletBalance } from "@/lib/api";
import { DIALOG_BACKDROP_CLASS, cn } from "@/lib/utils";
import { DatumCell } from "@/components/datum-cell";
import { MarketClosedButton } from "@/components/market-closed-button";
import { useMarketHours } from "@/hooks/use-market-hours";
import { WalletProvisioningError } from "@/components/wallet-provisioning-error";
import type { Mandate } from "@/lib/agent/evaluator";
import type { Id } from "../../convex/_generated/dataModel";
import { TRADER_NAME_MAX, validateTraderName } from "@/lib/trader-name";
import { DEFAULT_CYCLE_INTERVAL_MS } from "@/lib/constants";

const DEFAULT_CYCLE_MINUTES = Math.round(DEFAULT_CYCLE_INTERVAL_MS / 60_000);

type Option<T> = { label: string; sub: string; value: T };

type Stage = "profile" | "mandate" | "fund";
const STAGE_ORDER: Stage[] = ["profile", "mandate", "fund"];
const STAGE_LABELS: Record<Stage, string> = {
  profile: "Profile",
  mandate: "Mandate",
  fund: "Fund",
};

type MandateKey =
  | "bankroll_pct"
  | "max_entry_cost_usdc"
  | "min_pot_usdc"
  | "approval_threshold_usdc";

const RISK_OPTIONS: Option<number>[] = [
  { label: "PLAYS IT SAFE", sub: "Small bets, steady gains", value: 10 },
  { label: "CALCULATED RISKS", sub: "Nothing too crazy", value: 25 },
  { label: "GO BIG OR GO HOME", sub: "Swing for the fences", value: 50 },
  { label: "FULL SEND", sub: "Bet the whole desk", value: 75 },
];

const DEAL_SIZE_OPTIONS: Option<number | null>[] = [
  { label: "PENNY ANTE", sub: "$0.50 max", value: 0.5 },
  { label: "MID-STAKES", sub: "$2 max", value: 2 },
  { label: "HIGH ROLLER", sub: "$5 max", value: 5 },
  { label: "NO LIMIT", sub: "Let them cook", value: null },
];

const POT_SIZE_OPTIONS: Option<number | null>[] = [
  { label: "SCRAPPY", sub: "Any pot will do", value: null },
  { label: "WORTH MY TIME", sub: "$1 or more", value: 1 },
  { label: "BIG GAME ONLY", sub: "$5 or more", value: 5 },
  { label: "WHALE TERRITORY", sub: "$10 or more", value: 10 },
];

const OVERSIGHT_OPTIONS: Option<number | null>[] = [
  { label: "NEVER", sub: "I trust them completely", value: null },
  { label: "BIG MOVES ONLY", sub: "Over $3", value: 3 },
  { label: "ANYTHING OVER A BUCK", sub: "$1+", value: 1 },
  { label: "EVERY. SINGLE. DEAL.", sub: "$0.01 threshold", value: 0.01 },
];

function StageIndicator({ current }: { current: Stage }) {
  const currentIdx = STAGE_ORDER.indexOf(current);
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
      {STAGE_ORDER.map((stage, idx) => {
        const isActive = idx === currentIdx;
        const isDone = idx < currentIdx;
        return (
          <div key={stage} className="flex items-center gap-2">
            <span
              className={cn(
                "transition-colors",
                isActive && "text-[var(--t-accent)]",
                isDone && "text-[var(--t-green)]",
                !isActive && !isDone && "text-[var(--t-muted)]"
              )}
            >
              {String(idx + 1).padStart(2, "0")} {STAGE_LABELS[stage]}
            </span>
            {idx < STAGE_ORDER.length - 1 && (
              <span className="text-[var(--t-muted)]/40">/</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TraderCreationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [flowKey, setFlowKey] = useState(0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60">
          <Dialog.Title className="sr-only">Hire trader</Dialog.Title>
          <div className="max-h-[88vh] overflow-y-auto">
            <div className="bg-[var(--t-bg)]">
              <TraderCreationFlow
                key={flowKey}
                onCreated={(traderId) => {
                  onOpenChange(false);
                  setFlowKey((key) => key + 1);
                  router.push(`/?trader=${encodeURIComponent(traderId)}`);
                }}
              />
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogHeader({ stage }: { stage: Stage }) {
  return (
    <>
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
            Desk hiring
          </p>
          <h2 className="truncate font-[family-name:var(--font-plex-sans)] text-xl font-black uppercase tracking-wide text-[var(--t-amber)]">
            Hire Trader
          </h2>
        </div>
        <Dialog.Close className="min-h-10 shrink-0 px-2 text-xs uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none">
          Close
        </Dialog.Close>
      </div>
      <div className="border-b border-[var(--t-divider)] bg-[#070b09]/60 px-4 py-2">
        <StageIndicator current={stage} />
      </div>
    </>
  );
}

function TraderCreationFlow({
  onCreated,
}: {
  onCreated?: (traderId: string) => void;
}) {
  const traders = useConvexTraders();
  const createTrader = useConvexCreateTrader();

  const [stage, setStage] = useState<Stage>("profile");
  const [name, setName] = useState("");
  const [mandate, setMandate] = useState<Mandate>({});
  const [touched, setTouched] = useState<Set<MandateKey>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createdTraderId, setCreatedTraderId] = useState<string | null>(null);

  const trimmedName = name.trim();
  const formatError = validateTraderName(name);
  const nameTaken =
    trimmedName.length > 0 &&
    (traders ?? []).some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
    );
  const canAdvanceName = !formatError && !nameTaken;
  const allMandateTouched = touched.size === 4;

  function setMandateField(key: MandateKey, value: number | null) {
    setMandate((m) => {
      const next = { ...m };
      if (value !== null) {
        (next[key] as number) = value;
      } else {
        delete next[key];
      }
      return next;
    });
    setTouched((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  async function submitTrader() {
    setIsCreating(true);
    setCreateError(undefined);
    try {
      await syncDeskWalletBalance("Fund your wallet before hiring a trader");
      const traderId = await createTrader({
        name: trimmedName,
        mandate,
      });
      setIsCreating(false);
      setCreatedTraderId(traderId);
      setStage("fund");
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create trader"
      );
      setIsCreating(false);
    }
  }

  if (createdTraderId) {
    return (
      <>
        <DialogHeader stage="fund" />
        <FundAndActivateStep
          convexTraderId={createdTraderId}
          traderName={trimmedName}
          onDone={() => onCreated?.(createdTraderId)}
        />
      </>
    );
  }

  return (
    <>
      <DialogHeader stage={stage} />
      <div className="grid gap-4 p-4">
        {stage === "profile" && (
          <ProfileStage
            name={name}
            setName={setName}
            nameTaken={nameTaken}
            formatError={formatError}
            canAdvance={canAdvanceName}
            onNext={() => setStage("mandate")}
          />
        )}

        {stage === "mandate" && (
          <MandateStage
            mandate={mandate}
            touched={touched}
            setMandateField={setMandateField}
            allTouched={allMandateTouched}
            isCreating={isCreating}
            createError={createError}
            onBack={() => setStage("profile")}
            onSubmit={submitTrader}
          />
        )}
      </div>
    </>
  );
}

function ProfileStage({
  name,
  setName,
  nameTaken,
  formatError,
  canAdvance,
  onNext,
}: {
  name: string;
  setName: (v: string) => void;
  nameTaken: boolean;
  formatError: string | null;
  canAdvance: boolean;
  onNext: () => void;
}) {
  const nameMessage = nameTaken
    ? "Name taken — choose a unique name"
    : name.length > 0
      ? formatError
      : null;
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdvance) onNext();
        }}
        className="border border-[var(--t-divider)] bg-[#070b09] p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--t-divider)] pb-3">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
            Trader name
          </h3>
          <span className="hidden text-right text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]/70 sm:inline">
            What do they call this trader on the floor?
          </span>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Gecko"
          maxLength={TRADER_NAME_MAX}
          autoFocus
          className="min-h-11 w-full border border-[var(--t-divider)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none sm:text-sm"
        />
        {nameMessage && (
          <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-[var(--t-amber)]">
            {nameMessage}
          </p>
        )}
      </form>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--t-border)]/80 pt-4">
        <Dialog.Close className="min-h-10 px-2 text-xs uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none">
          Cancel
        </Dialog.Close>
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          className="min-h-11 border border-[var(--t-accent)] bg-[var(--t-accent-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next &rarr;
        </button>
      </div>
    </>
  );
}

function MandateStage({
  mandate,
  touched,
  setMandateField,
  allTouched,
  isCreating,
  createError,
  onBack,
  onSubmit,
}: {
  mandate: Mandate;
  touched: Set<MandateKey>;
  setMandateField: (key: MandateKey, value: number | null) => void;
  allTouched: boolean;
  isCreating: boolean;
  createError: string | undefined;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <div className="border border-[var(--t-divider)] bg-[#070b09] p-4">
        <MandateSection
          label="Risk tolerance"
          subtitle="How does this trader handle risk?"
          options={RISK_OPTIONS}
          selectedValue={
            touched.has("bankroll_pct")
              ? (mandate.bankroll_pct ?? null)
              : undefined
          }
          onSelect={(v) => setMandateField("bankroll_pct", v)}
          isFirst
        />
        <MandateSection
          label="Max buy-in"
          subtitle="Biggest buy-in they'll stomach"
          options={DEAL_SIZE_OPTIONS}
          selectedValue={
            touched.has("max_entry_cost_usdc")
              ? (mandate.max_entry_cost_usdc ?? null)
              : undefined
          }
          onSelect={(v) => setMandateField("max_entry_cost_usdc", v)}
        />
        <MandateSection
          label="Min pot"
          subtitle="What pots are worth chasing?"
          options={POT_SIZE_OPTIONS}
          selectedValue={
            touched.has("min_pot_usdc")
              ? (mandate.min_pot_usdc ?? null)
              : undefined
          }
          onSelect={(v) => setMandateField("min_pot_usdc", v)}
        />
        <MandateSection
          label="Oversight"
          subtitle="When should they check with you?"
          options={OVERSIGHT_OPTIONS}
          selectedValue={
            touched.has("approval_threshold_usdc")
              ? (mandate.approval_threshold_usdc ?? null)
              : undefined
          }
          onSelect={(v) => setMandateField("approval_threshold_usdc", v)}
        />
      </div>

      {createError && (
        <div className="border border-[var(--t-red)]/30 bg-[var(--t-red)]/[0.06] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--t-red)]">
          {createError}
        </div>
      )}

      {isCreating && (
        <div className="border border-[var(--t-green)]/40 bg-[var(--t-green)]/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--t-green)]">
              Hiring trader... provisioning wallet
            </span>
            <span className="cursor-blink text-[var(--t-green)]">█</span>
          </div>
        </div>
      )}

      {!isCreating && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--t-border)]/80 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="text-xs uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
          >
            &larr; Back
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!allTouched}
            className="border border-[var(--t-accent)] bg-[var(--t-accent-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hire trader &rarr;
          </button>
        </div>
      )}
    </>
  );
}

function MandateSection<T extends number | null>({
  label,
  subtitle,
  options,
  selectedValue,
  onSelect,
  isFirst,
}: {
  label: string;
  subtitle: string;
  options: Option<T>[];
  selectedValue: T | undefined;
  onSelect: (value: T) => void;
  isFirst?: boolean;
}) {
  return (
    <div
      className={cn(!isFirst && "mt-4 border-t border-[var(--t-divider)] pt-4")}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          {label}
        </h3>
        <span className="hidden text-right text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]/70 sm:inline">
          {subtitle}
        </span>
      </div>
      <OptionGrid
        options={options}
        selectedValue={selectedValue}
        onSelect={onSelect}
      />
    </div>
  );
}

function FundAndActivateStep({
  convexTraderId,
  traderName,
  onDone,
}: {
  convexTraderId: string;
  traderName: string;
  onDone: () => void;
}) {
  const { data: trader } = useTrader(convexTraderId);
  const tokenId = trader?.token_id ?? 0;
  const walletReady = trader?.wallet_status === "ready";
  const walletErrored = trader?.wallet_status === "error";
  const walletErrorMsg = trader?.wallet_error ?? null;

  const {
    balanceUsdc,
    unfunded,
    refetch: refetchBalance,
  } = useTraderEscrowBalance(tokenId, { refetchInterval: 5_000 });
  const funded = !unfunded;

  const [amount, setAmount] = useState("");
  const [ensureError, setEnsureError] = useState<string | undefined>();
  const [syncError, setSyncError] = useState<string | undefined>();
  const {
    deposit,
    reset: resetDeposit,
    step: depositStep,
    error: depositError,
    isLoading: isDepositBusy,
  } = useDepositFlow();

  const resume = useResumeTrader();
  const activating = useRef(false);
  const { isOpen: marketOpen, countdownLabel: marketCountdown } =
    useMarketHours();

  useEffect(() => {
    if (activating.current && !resume.isPending && !resume.isError) {
      activating.current = false;
      onDone();
    }
  }, [resume.isPending, resume.isError, onDone]);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseUnits(amount, 6);
    if (parsed === BigInt(0)) return;
    setEnsureError(undefined);
    setSyncError(undefined);

    try {
      const res = await authFetch(
        `/api/trader/${convexTraderId}/ensure-depositor`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setEnsureError((body as { error?: string }).error ?? "Setup failed");
        return;
      }
    } catch {
      setEnsureError("Network error during depositor setup");
      return;
    }

    try {
      await deposit(BigInt(tokenId), parsed);
      const syncRes = await authFetch(
        `/api/trader/${convexTraderId}/sync-balance`,
        { method: "POST" }
      );
      if (!syncRes.ok) {
        setSyncError("Balance sync failed — check escrow then activate");
      } else {
        setAmount("");
        refetchBalance();
      }
    } catch {
      // depositError surfaced via hook state
    }
  }

  function handleActivate() {
    activating.current = true;
    resume.mutate(convexTraderId);
  }

  const depositDisplayError = ensureError ?? syncError ?? depositError;
  const canDeposit = !!tokenId && !!amount && !isDepositBusy;
  const canActivate = walletReady && funded && !resume.isPending;

  const depositButtonLabel = {
    idle: "Fund escrow",
    approving: "Approving USDC...",
    depositing: "Depositing...",
    done: "Fund escrow",
  }[depositStep];

  return (
    <div className="grid gap-4 p-4">
      <div className="border border-[var(--t-divider)] bg-[#070b09] p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-[var(--t-divider)] pb-3">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
            Fund escrow
          </h3>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]/70">
            Stake {traderName} before they can hit the wire
          </span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <DatumCell
            label="Wallet"
            value={walletReady ? "Ready" : "Setting up..."}
            valueClassName={
              walletReady ? "text-[var(--t-green)]" : "text-[var(--t-amber)]"
            }
          />
          <DatumCell
            label="Escrow"
            value={balanceUsdc !== null ? `$${balanceUsdc.toFixed(2)}` : "..."}
            valueClassName={
              funded ? "text-[var(--t-green)]" : "text-[var(--t-amber)]"
            }
          />
        </div>
        {walletErrored && (
          <WalletProvisioningError
            traderId={convexTraderId as Id<"traders">}
            walletError={walletErrorMsg}
            className="mb-4"
          />
        )}
        {!walletReady && !walletErrored && (
          <p className="mb-4 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
            Wallet provisioning can take a minute on first hire.
          </p>
        )}

        <form onSubmit={handleDeposit} className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
              Deposit USDC
            </span>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00 USDC"
              disabled={isDepositBusy || !tokenId}
              className="w-full border border-[var(--t-divider)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
            />
          </label>
          <button
            type="submit"
            disabled={!canDeposit}
            className="self-start border border-[var(--t-accent)] bg-[var(--t-accent-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {depositButtonLabel}
          </button>
        </form>

        {depositStep === "done" && (
          <div className="mt-3 border border-[var(--t-green)]/40 bg-[var(--t-green)]/[0.06] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--t-green)]">
            {funded ? "Escrow funded" : "Deposit confirmed — balance syncing"}
          </div>
        )}

        {depositDisplayError && (
          <div className="mt-3 flex items-center justify-between gap-3 border border-[var(--t-red)]/30 bg-[var(--t-red)]/[0.06] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--t-red)]">
            <span className="min-w-0 truncate">
              {depositDisplayError.slice(0, 120)}
            </span>
            {depositError && !ensureError && (
              <button
                type="button"
                onClick={resetDeposit}
                className="shrink-0 underline transition-colors hover:text-[var(--t-text)]"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border border-[var(--t-divider)] bg-[#070b09] p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-[var(--t-divider)] pb-3">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
            Activate trading
          </h3>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]/70">
            Send {traderName} to the floor
          </span>
        </div>
        <MarketClosedButton
          // When wallet isn't ready or escrow isn't funded, keep the existing
          // disabled state so the helper text below still applies. Only flip to
          // MARKET CLOSED once the trader is actually ready to be activated.
          isClosed={!marketOpen && walletReady && funded && !resume.isPending}
          countdownLabel={marketCountdown}
          enabledChildren={
            <>{resume.isPending ? "Activating..." : "Activate trading"}</>
          }
          onClick={handleActivate}
          disabled={!canActivate}
          className="border border-[var(--t-accent)] bg-[var(--t-accent-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-40"
        />
        <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
          {`Cycles every ${DEFAULT_CYCLE_MINUTES} min once active`}
        </p>
        {!canActivate && (
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
            {!walletReady
              ? "Waiting for wallet setup to complete..."
              : "Fund escrow above to enable activation"}
          </p>
        )}
        {resume.isError && (
          <div className="mt-3 border border-[var(--t-red)]/30 bg-[var(--t-red)]/[0.06] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--t-red)]">
            {resume.error?.message}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={onDone}
          className="text-xs uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
        >
          Skip for now &rarr;
        </button>
      </div>
    </div>
  );
}

function OptionGrid<T>({
  options,
  selectedValue,
  onSelect,
  disabled,
}: {
  options: Option<T>[];
  selectedValue?: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => {
        const isSelected =
          selectedValue !== undefined && Object.is(selectedValue, opt.value);
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onSelect(opt.value)}
            disabled={disabled}
            className={cn(
              "group flex min-h-[4.75rem] flex-col items-start border p-3 text-left transition-colors disabled:opacity-50",
              isSelected
                ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)]"
                : "border-[var(--t-divider)] bg-[var(--t-bg)] hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)]"
            )}
          >
            <span
              className={cn(
                "text-[11px] font-black uppercase tracking-[0.14em]",
                isSelected
                  ? "text-[var(--t-accent)]"
                  : "text-[var(--t-text)] group-hover:text-[var(--t-accent)]"
              )}
            >
              {opt.label}
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
              {opt.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}
