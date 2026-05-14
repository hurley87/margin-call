"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { useReadContract } from "wagmi";
import { parseUnits } from "viem";

import {
  useConvexCreateTrader,
  useConvexTraders,
} from "@/hooks/use-convex-traders";
import { useTrader } from "@/hooks/use-traders";
import { useDepositFlow } from "@/hooks/use-escrow";
import { useResumeTrader } from "@/hooks/use-agent";
import { authFetch } from "@/lib/api";
import {
  ESCROW_ADDRESS,
  escrowAbi,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";
import type { Mandate } from "@/lib/agent/evaluator";

type Option<T> = { label: string; sub: string; value: T };

const STEPS = {
  NAME: 0,
  RISK: 1,
  DEAL_SIZE: 2,
  POT_SIZE: 3,
  OVERSIGHT: 4,
} as const;

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

const STEP_TITLES = [
  "WHAT DO THEY CALL THIS TRADER ON THE FLOOR?",
  "HOW DOES THIS TRADER HANDLE RISK?",
  "WHAT'S THE BIGGEST BUY-IN THIS TRADER WILL STOMACH?",
  "WHAT KIND OF POTS ARE WORTH CHASING?",
  "WHEN SHOULD THIS TRADER CHECK WITH YOU?",
] as const;

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
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/75" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[86vh] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-[var(--t-bronze)] bg-[linear-gradient(rgba(101,160,94,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(101,160,94,0.03)_1px,transparent_1px),radial-gradient(circle_at_top,rgba(214,166,96,0.08),transparent_34%),#040807] bg-[length:100%_18px,18px_100%,auto,auto] font-mono shadow-2xl shadow-black/45">
          <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[var(--t-divider)] bg-[#0b100d] px-3 py-2">
            <div className="min-w-0">
              <Dialog.Title className="truncate font-[family-name:var(--font-plex-sans)] text-sm font-black uppercase tracking-[0.14em] text-[var(--t-accent)]">
                Hire Trader
              </Dialog.Title>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                Desk hiring
              </p>
            </div>
            <Dialog.Close className="border border-[var(--t-divider)] px-2 py-1 text-[10px] text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]">
              [X]
            </Dialog.Close>
          </div>
          <div className="max-h-[calc(86vh-2.5rem)] overflow-y-auto">
            <TraderCreationFlow
              key={flowKey}
              onCreated={(traderId) => {
                onOpenChange(false);
                setFlowKey((key) => key + 1);
                router.push(`/?trader=${encodeURIComponent(traderId)}`);
              }}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TraderCreationFlow({
  onCreated,
}: {
  onCreated?: (traderId: string) => void;
}) {
  const traders = useConvexTraders();
  const createTrader = useConvexCreateTrader();

  const [step, setStep] = useState<number>(STEPS.NAME);
  const [name, setName] = useState("");
  const [mandate, setMandate] = useState<Mandate>({});
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createdTraderId, setCreatedTraderId] = useState<string | null>(null);

  const trimmedName = name.trim();
  const nameTaken =
    trimmedName.length > 0 &&
    (traders ?? []).some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
    );
  const canAdvanceName = trimmedName.length > 0 && !nameTaken;

  function setMandateField(
    key: Exclude<keyof Mandate, "keywords" | "max_pot_usdc">,
    value: number | null,
    nextStep: number
  ) {
    setMandate((m) => {
      const next = { ...m };
      if (value !== null) {
        (next[key] as number) = value;
      } else {
        delete next[key];
      }
      return next;
    });
    setStep(nextStep);
  }

  async function submitTrader(value: number | null) {
    const finalMandate: Mandate = { ...mandate };
    if (value !== null) finalMandate.approval_threshold_usdc = value;
    else delete finalMandate.approval_threshold_usdc;

    setIsCreating(true);
    setCreateError(undefined);
    try {
      const traderId = await createTrader({
        name: trimmedName,
        mandate: finalMandate,
      });
      setIsCreating(false);
      setCreatedTraderId(traderId);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create trader"
      );
      setIsCreating(false);
    }
  }

  if (createdTraderId) {
    return (
      <FundAndActivateStep
        convexTraderId={createdTraderId}
        traderName={trimmedName}
        onDone={() => onCreated?.(createdTraderId)}
      />
    );
  }

  return (
    <>
      <div className="border-b border-[var(--t-divider)] bg-[#0b100d]/70">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-3 py-1.5 text-xs">
          <span className="text-[var(--t-muted)]">DESK HIRING</span>
          <span className="text-[var(--t-text)]">NEW TRADER</span>
          <span className="text-[var(--t-muted)]">STEP {step + 1} / 5</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-3 pt-4">
        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 transition-colors ${
                i <= step ? "bg-[var(--t-accent)]" : "bg-[var(--t-border)]"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-3 py-4">
        <div className="border border-[var(--t-divider)] bg-[#070b09] p-4 sm:p-5">
          <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.08em] text-[var(--t-accent)]">
            {STEP_TITLES[step]}
          </h2>

          {step === STEPS.NAME && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canAdvanceName) setStep(STEPS.RISK);
              }}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gecko"
                maxLength={50}
                autoFocus
                className="mb-4 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
              />
              {nameTaken && (
                <p className="mb-4 text-sm text-[var(--t-amber)]">
                  NAME TAKEN — CHOOSE A UNIQUE NAME
                </p>
              )}
              <button
                type="submit"
                disabled={!canAdvanceName}
                className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-6 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50"
              >
                NEXT &rarr;
              </button>
            </form>
          )}

          {step === STEPS.RISK && (
            <OptionGrid
              options={RISK_OPTIONS}
              onSelect={(v) =>
                setMandateField("bankroll_pct", v, STEPS.DEAL_SIZE)
              }
            />
          )}

          {step === STEPS.DEAL_SIZE && (
            <OptionGrid
              options={DEAL_SIZE_OPTIONS}
              onSelect={(v) =>
                setMandateField("max_entry_cost_usdc", v, STEPS.POT_SIZE)
              }
            />
          )}

          {step === STEPS.POT_SIZE && (
            <OptionGrid
              options={POT_SIZE_OPTIONS}
              onSelect={(v) =>
                setMandateField("min_pot_usdc", v, STEPS.OVERSIGHT)
              }
            />
          )}

          {step === STEPS.OVERSIGHT && (
            <div>
              <OptionGrid
                options={OVERSIGHT_OPTIONS}
                onSelect={submitTrader}
                disabled={isCreating}
              />
              {isCreating && (
                <p className="mt-4 text-sm text-[var(--t-muted)]">
                  Creating trader... wallet provisioning will complete shortly.
                </p>
              )}
              {createError && (
                <p className="mt-4 text-sm text-[var(--t-red)]">
                  {createError}
                </p>
              )}
            </div>
          )}
        </div>

        {step > STEPS.NAME && !isCreating && (
          <button
            onClick={() => {
              if (step === STEPS.RISK) setMandate({});
              setStep(step - 1);
            }}
            className="mt-4 text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
          >
            &larr; BACK A STEP
          </button>
        )}
      </div>
    </>
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

  const { data: escrowBalance, refetch: refetchBalance } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getBalance",
    args: tokenId ? [BigInt(tokenId)] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: { enabled: !!tokenId, refetchInterval: 5_000 },
  });
  const balanceUsdc =
    escrowBalance !== undefined ? Number(escrowBalance) / 1_000_000 : null;
  const funded = !!escrowBalance && escrowBalance > BigInt(0);

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
      const res = await fetch(
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

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-6">
      <div className="border border-[var(--t-divider)] bg-[#070b09] p-5">
        <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Trader hired
        </p>
        <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.08em] text-[var(--t-amber)]">
          Fund {traderName} to activate
        </h2>

        {/* Wallet + balance status */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="border border-[var(--t-divider)] p-3">
            <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
              Wallet
            </p>
            {walletReady ? (
              <p className="text-sm font-bold uppercase text-[var(--t-green)]">
                Ready
              </p>
            ) : (
              <p className="text-sm font-bold uppercase text-[var(--t-amber)]">
                Setting up...
              </p>
            )}
          </div>
          <div className="border border-[var(--t-divider)] p-3">
            <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
              Escrow
            </p>
            <p
              className={`text-sm font-bold uppercase ${funded ? "text-[var(--t-green)]" : "text-[var(--t-amber)]"}`}
            >
              {balanceUsdc !== null ? `$${balanceUsdc.toFixed(2)}` : "..."}
            </p>
          </div>
        </div>

        {/* Deposit form */}
        <form onSubmit={handleDeposit} className="mb-5 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
            Deposit USDC
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.000001"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00 USDC"
              disabled={isDepositBusy || !tokenId}
              className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!canDeposit}
            className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {depositStep === "approving"
              ? "Approving USDC..."
              : depositStep === "depositing"
                ? "Depositing..."
                : "Fund Escrow"}
          </button>
          {depositStep === "done" && !funded && (
            <p className="text-xs text-[var(--t-green)]">
              Deposit confirmed. Balance syncing...
            </p>
          )}
          {depositStep === "done" && funded && (
            <p className="text-xs text-[var(--t-green)]">Escrow funded ✓</p>
          )}
          {depositDisplayError && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-[var(--t-red)]">
                {depositDisplayError.slice(0, 120)}
              </p>
              {depositError && !ensureError && (
                <button
                  type="button"
                  onClick={resetDeposit}
                  className="text-xs text-[var(--t-muted)] underline hover:text-[var(--t-text)]"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </form>

        {/* Activate */}
        <div className="flex flex-col gap-3 border-t border-[var(--t-divider)] pt-5">
          <button
            onClick={handleActivate}
            disabled={!canActivate}
            className="border border-[var(--t-accent)] px-4 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resume.isPending ? "Activating..." : "Activate Trading"}
          </button>
          {!canActivate && (
            <p className="text-[10px] text-[var(--t-muted)]">
              {!walletReady
                ? "Waiting for wallet setup to complete..."
                : "Fund escrow above to enable activation"}
            </p>
          )}
          {resume.isError && (
            <p className="text-xs text-[var(--t-red)]">
              {resume.error?.message}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onDone}
        className="mt-4 text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
      >
        Skip for now &rarr;
      </button>
    </div>
  );
}

function OptionGrid<T>({
  options,
  onSelect,
  disabled,
}: {
  options: Option<T>[];
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onSelect(opt.value)}
          disabled={disabled}
          className="border border-[var(--t-border)] bg-[var(--t-bg)] p-4 text-left transition-colors hover:border-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-50"
        >
          <span className="block text-sm font-bold text-[var(--t-text)]">
            {opt.label}
          </span>
          <span className="mt-1 block text-xs text-[var(--t-muted)]">
            {opt.sub}
          </span>
        </button>
      ))}
    </div>
  );
}
