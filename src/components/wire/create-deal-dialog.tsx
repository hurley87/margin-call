"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Dialog } from "@base-ui/react/dialog";
import { useSuggestPrompts } from "@/hooks/use-deals";
import { useCreateDeal } from "@/hooks/use-create-deal";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { useMarketHours } from "@/hooks/use-market-hours";
import {
  DEAL_CREATION_FEE_PERCENTAGE,
  MIN_POT_AMOUNT,
  MIN_ENTRY_COST,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DatumCell } from "@/components/datum-cell";
import { MarketClosedButton } from "@/components/market-closed-button";
import type { Id } from "../../../convex/_generated/dataModel";

const STEP_LABELS: Record<string, string> = {
  approving: "APPROVING USDC SPEND...",
  creating: "CREATING DEAL ON-CHAIN...",
  syncing: "SYNCING DEAL TO DATABASE...",
  done: "DEAL CREATED SUCCESSFULLY",
};

type DialogState = "suggestions" | "configure" | "creating";

const STAGE_ORDER_FULL: DialogState[] = [
  "suggestions",
  "configure",
  "creating",
];
const STAGE_ORDER_DIRECT: DialogState[] = ["configure", "creating"];
const STAGE_LABELS: Record<DialogState, string> = {
  suggestions: "Pick",
  configure: "Terms",
  creating: "Send",
};

function createDealProgressWidth(step: string): "33%" | "66%" | "90%" | "100%" {
  if (step === "approving") return "33%";
  if (step === "creating") return "66%";
  if (step === "syncing") return "90%";
  return "100%";
}

function StageIndicator({
  current,
  hideSuggestions,
}: {
  current: DialogState;
  hideSuggestions: boolean;
}) {
  const stages = hideSuggestions ? STAGE_ORDER_DIRECT : STAGE_ORDER_FULL;
  const currentIdx = stages.indexOf(current);
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
      {stages.map((stage, idx) => {
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
            {idx < stages.length - 1 && (
              <span className="text-[var(--t-muted)]/40">/</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

type SuggestPromptsQuery = ReturnType<typeof useSuggestPrompts>;

function DealSuggestionsPane({
  suggestionsRequested,
  suggestQuery,
  onGenerateSuggestions,
  onPickSuggestion,
}: {
  suggestionsRequested: boolean;
  suggestQuery: SuggestPromptsQuery;
  onGenerateSuggestions: () => void;
  onPickSuggestion: (prompt: string) => void;
}) {
  if (!suggestionsRequested) {
    return (
      <div className="border border-[var(--t-divider)] bg-[#070b09] p-6">
        <div className="mb-4 border-b border-[var(--t-divider)] pb-3">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
            Deal angle
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-[var(--t-green)]/90">
            Ask the desk to draft three playable deal angles from the wire item.
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerateSuggestions}
          className="border border-[var(--t-accent)] bg-[var(--t-accent-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
        >
          Generate deal ideas &rarr;
        </button>
      </div>
    );
  }

  if (suggestQuery.isPending || (!suggestQuery.data && !suggestQuery.isError)) {
    return (
      <div className="border border-[var(--t-divider)] bg-[#070b09] p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Generating deal ideas
          <span className="cursor-blink ml-1 text-[var(--t-accent)]">█</span>
        </p>
      </div>
    );
  }
  if (suggestQuery.data) {
    return (
      <div className="border border-[var(--t-divider)] bg-[#070b09] p-4">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--t-divider)] pb-3">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
            Pick a deal angle
          </h3>
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--t-accent)]">
            {suggestQuery.data.length} drafts
          </span>
        </div>
        <div className="grid gap-2">
          {suggestQuery.data.map((s, i) => (
            <button
              key={i}
              onClick={() => onPickSuggestion(s)}
              className="group flex items-start gap-3 border border-[var(--t-divider)] bg-[var(--t-bg)] p-3 text-left transition-colors hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)]"
            >
              <span className="shrink-0 pt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--t-muted)] group-hover:text-[var(--t-accent)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--t-text)]">
                {s}
              </span>
              <span className="shrink-0 self-center text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors group-hover:text-[var(--t-accent)]">
                Select &rarr;
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="border border-[var(--t-divider)] bg-[#070b09] p-8 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-red)]">
        Suggestions failed
      </p>
      <button
        type="button"
        onClick={() => suggestQuery.refetch()}
        className="mt-3 border border-[var(--t-divider)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
      >
        Retry
      </button>
    </div>
  );
}

interface DealSeedPrefill {
  seedId: Id<"wireDealSeeds">;
  prompt: string;
  suggestedPotUsdc: number;
  suggestedEntryCostUsdc: number;
}

interface CreateDealDialogProps {
  headline: { headline: string; body: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog opens straight into "configure" with prefilled values. */
  dealSeed?: DealSeedPrefill;
  /** When true, generate three choices before showing the final create form. */
  startWithSuggestions?: boolean;
}

export function CreateDealDialog({
  headline,
  open,
  onOpenChange,
  dealSeed,
  startWithSuggestions = false,
}: CreateDealDialogProps) {
  const { authenticated } = usePrivy();
  const { balance } = useUsdcBalance();

  // Deal seeds retain their exact prompt by default; normal headlines can request generated choices first.
  const openInConfigure =
    !startWithSuggestions && !!(dealSeed || headline.headline);
  const headlineBody = [headline.headline, headline.body]
    .filter(Boolean)
    .join("\n\n");
  const initialPrompt = dealSeed?.prompt ?? headlineBody;

  const [state, setState] = useState<DialogState>(
    openInConfigure ? "configure" : "suggestions"
  );
  const [suggestionsRequested, setSuggestionsRequested] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(initialPrompt);
  const [potAmount, setPotAmount] = useState(
    dealSeed ? dealSeed.suggestedPotUsdc.toString() : MIN_POT_AMOUNT.toString()
  );
  const [entryCost, setEntryCost] = useState(
    dealSeed
      ? dealSeed.suggestedEntryCostUsdc.toString()
      : MIN_ENTRY_COST.toString()
  );

  const router = useRouter();
  const suggestQuery = useSuggestPrompts(
    headlineBody,
    !openInConfigure && suggestionsRequested
  );
  const {
    createDeal,
    reset: resetCreateDeal,
    step,
    isLoading: isCreating,
    error: createError,
  } = useCreateDeal();

  const handlePickSuggestion = (prompt: string) => {
    setSelectedPrompt(prompt);
    setState("configure");
  };

  const handleGenerateSuggestions = () => {
    setSuggestionsRequested(true);
  };

  const potNum = parseFloat(potAmount);
  const entryNum = parseFloat(entryCost);
  const netPot =
    potNum > 0 ? potNum * (1 - DEAL_CREATION_FEE_PERCENTAGE / 100) : 0;
  const insufficientBalance =
    balance !== undefined && potNum > 0 && balance < potNum;

  const handleSubmitDeal = async () => {
    if (!selectedPrompt.trim() || isNaN(potNum) || isNaN(entryNum)) return;
    setState("creating");
    try {
      const result = await createDeal(
        selectedPrompt.trim(),
        potNum,
        entryNum,
        headline.headline,
        dealSeed?.seedId
      );
      onOpenChange(false);
      router.push(
        result?.convexDealId
          ? `/?deal=${encodeURIComponent(result.convexDealId)}`
          : "/"
      );
    } catch {
      setState("configure");
    }
  };

  const handleBack = () => {
    if (openInConfigure) {
      onOpenChange(false);
      return;
    }
    setState("suggestions");
    resetCreateDeal();
    setPotAmount(MIN_POT_AMOUNT.toString());
    setEntryCost(MIN_ENTRY_COST.toString());
  };

  const headerLabel = dealSeed ? "Wire seed deal" : "New deal";
  const { isOpen: marketOpen, countdownLabel: marketCountdown } =
    useMarketHours();
  const canSubmit =
    authenticated &&
    !!selectedPrompt.trim() &&
    !isNaN(potNum) &&
    potNum >= MIN_POT_AMOUNT &&
    !isNaN(entryNum) &&
    entryNum >= MIN_ENTRY_COST &&
    !insufficientBalance &&
    marketOpen;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60">
          <Dialog.Title className="sr-only">Create deal</Dialog.Title>
          <div className="max-h-[88vh] overflow-y-auto">
            <div className="crt-scanlines bg-[var(--t-bg)]">
              <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
                    {headerLabel}
                  </p>
                  <h2 className="truncate font-[family-name:var(--font-plex-sans)] text-xl font-black uppercase tracking-wide text-[var(--t-amber)]">
                    Create deal
                  </h2>
                </div>
                <Dialog.Close className="shrink-0 text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]">
                  Close
                </Dialog.Close>
              </div>

              <div className="grid gap-4 p-4">
                <StageIndicator
                  current={state}
                  hideSuggestions={openInConfigure}
                />

                {headline.headline && (
                  <div className="border border-[var(--t-divider)] bg-[#070b09] p-4">
                    <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
                      Newswire source
                    </p>
                    <p className="font-[family-name:var(--font-plex-sans)] text-base font-black uppercase leading-snug tracking-wide text-[var(--t-amber)]">
                      {headline.headline}
                    </p>
                    {headline.body && (
                      <p className="mt-2 text-xs leading-relaxed text-[var(--t-green)]">
                        {headline.body}
                      </p>
                    )}
                  </div>
                )}

                {state === "suggestions" && (
                  <DealSuggestionsPane
                    suggestionsRequested={suggestionsRequested}
                    suggestQuery={suggestQuery}
                    onGenerateSuggestions={handleGenerateSuggestions}
                    onPickSuggestion={handlePickSuggestion}
                  />
                )}

                {(state === "configure" || state === "creating") && (
                  <>
                    <div className="border border-[var(--t-divider)] bg-[#070b09] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--t-divider)] pb-3">
                        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
                          Deal text
                        </h3>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
                          What traders will see
                        </span>
                      </div>
                      <textarea
                        value={selectedPrompt}
                        onChange={(e) => setSelectedPrompt(e.target.value)}
                        rows={3}
                        disabled={isCreating}
                        className="w-full border border-[var(--t-divider)] bg-[var(--t-bg)] px-3 py-2 text-sm leading-relaxed text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block border border-[var(--t-divider)] bg-[#070b09]/75 p-3">
                        <span className="block text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
                          Pot (USDC)
                        </span>
                        <input
                          type="number"
                          value={potAmount}
                          onChange={(e) => setPotAmount(e.target.value)}
                          min={MIN_POT_AMOUNT}
                          step="0.01"
                          disabled={isCreating}
                          className="mt-1 w-full bg-transparent text-2xl font-black uppercase tracking-wide text-[var(--t-green)] focus:outline-none disabled:opacity-50"
                        />
                      </label>
                      <label className="block border border-[var(--t-divider)] bg-[#070b09]/75 p-3">
                        <span className="block text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
                          Entry (USDC)
                        </span>
                        <input
                          type="number"
                          value={entryCost}
                          onChange={(e) => setEntryCost(e.target.value)}
                          min={MIN_ENTRY_COST}
                          step="0.01"
                          disabled={isCreating}
                          className="mt-1 w-full bg-transparent text-2xl font-black uppercase tracking-wide text-[var(--t-green)] focus:outline-none disabled:opacity-50"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-px border border-[var(--t-divider)] bg-[var(--t-divider)] text-[10px] uppercase tracking-[0.18em]">
                      <DatumCell
                        className="border-0 bg-[#070b09]/85"
                        label={`${DEAL_CREATION_FEE_PERCENTAGE}% fee`}
                        value={
                          potNum > 0
                            ? `$${((potNum * DEAL_CREATION_FEE_PERCENTAGE) / 100).toFixed(2)}`
                            : "$0.00"
                        }
                      />
                      <DatumCell
                        className="border-0 bg-[#070b09]/85"
                        label="Net pot"
                        value={`$${netPot.toFixed(2)}`}
                        valueClassName="text-[var(--t-green)]"
                      />
                      <DatumCell
                        className="border-0 bg-[#070b09]/85"
                        label="Your cash"
                        value={
                          balance !== undefined
                            ? `$${balance.toFixed(2)}`
                            : "..."
                        }
                        valueClassName={
                          insufficientBalance
                            ? "text-[var(--t-red)]"
                            : "text-[var(--t-green)]"
                        }
                      />
                    </div>

                    {(insufficientBalance || !authenticated || createError) && (
                      <div className="border border-[var(--t-red)]/30 bg-[var(--t-red)]/[0.06] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--t-red)]">
                        {createError ??
                          (!authenticated
                            ? "Connect wallet to create deals"
                            : "Insufficient balance to fund this pot")}
                      </div>
                    )}

                    {isCreating && (
                      <div className="border border-[var(--t-green)]/40 bg-[var(--t-green)]/[0.06] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--t-green)]">
                            {STEP_LABELS[step] ?? "PROCESSING..."}
                          </span>
                          <span className="cursor-blink text-[var(--t-green)]">
                            █
                          </span>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden bg-[var(--t-border)]">
                          <div
                            className="h-full bg-[var(--t-green)] transition-all duration-500"
                            style={{ width: createDealProgressWidth(step) }}
                          />
                        </div>
                      </div>
                    )}

                    {!isCreating && (
                      <div className="flex items-center justify-between gap-3 border-t border-[var(--t-border)]/80 pt-4">
                        <button
                          onClick={handleBack}
                          className="text-xs uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
                        >
                          &larr; Back
                        </button>
                        <MarketClosedButton
                          isClosed={!marketOpen}
                          countdownLabel={marketCountdown}
                          enabledChildren={<>Create deal &rarr;</>}
                          onClick={handleSubmitDeal}
                          disabled={!canSubmit}
                          className="border border-[var(--t-accent)] bg-[var(--t-accent-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
