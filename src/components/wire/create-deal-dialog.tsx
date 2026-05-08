"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Dialog } from "@base-ui/react/dialog";
import { useSuggestPrompts } from "@/hooks/use-deals";
import { useCreateDeal } from "@/hooks/use-create-deal";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import {
  DEAL_CREATION_FEE_PERCENTAGE,
  MIN_POT_AMOUNT,
  MIN_ENTRY_COST,
} from "@/lib/constants";
import type { Id } from "../../../convex/_generated/dataModel";

const STEP_LABELS: Record<string, string> = {
  approving: "APPROVING USDC SPEND...",
  creating: "CREATING DEAL ON-CHAIN...",
  syncing: "SYNCING DEAL TO DATABASE...",
  done: "DEAL CREATED SUCCESSFULLY",
};

type DialogState = "suggestions" | "configure" | "creating";

const STATE_META: Record<DialogState, string> = {
  suggestions: "IDEAS",
  configure: "TERMS",
  creating: "SENDING",
};

function createDealProgressWidth(step: string): "33%" | "66%" | "90%" | "100%" {
  if (step === "approving") return "33%";
  if (step === "creating") return "66%";
  if (step === "syncing") return "90%";
  return "100%";
}

type SuggestPromptsQuery = ReturnType<typeof useSuggestPrompts>;

function DealSuggestionsPane({
  suggestQuery,
  onPickSuggestion,
}: {
  suggestQuery: SuggestPromptsQuery;
  onPickSuggestion: (prompt: string) => void;
}) {
  if (suggestQuery.isPending || (!suggestQuery.data && !suggestQuery.isError)) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-xs uppercase tracking-wider text-[var(--t-muted)]">
          GENERATING DEAL IDEAS...
          <span className="cursor-blink">{"█"}</span>
        </p>
      </div>
    );
  }
  if (suggestQuery.data) {
    return (
      <>
        <div className="border-b border-[var(--t-divider)] bg-[#0b100d] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
          Choose deal text
        </div>
        <div className="divide-y divide-[var(--t-divider)]/70">
          {suggestQuery.data.map((s, i) => (
            <button
              key={i}
              onClick={() => onPickSuggestion(s)}
              className="group grid w-full grid-cols-[3.25rem_minmax(0,1fr)_4.25rem] items-start gap-3 px-3 py-3 text-left text-xs leading-relaxed transition-colors hover:bg-[var(--t-accent-soft)]"
            >
              <span className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[var(--t-text)] group-hover:text-[var(--t-accent)]">
                {s}
              </span>
              <span className="pt-0.5 text-right text-[10px] uppercase tracking-wider text-[var(--t-muted)] group-hover:text-[var(--t-accent)]">
                Select
              </span>
            </button>
          ))}
        </div>
      </>
    );
  }
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-xs uppercase tracking-wider text-[var(--t-muted)]">
        Suggestions failed.
      </p>
      <button
        type="button"
        onClick={() => suggestQuery.refetch()}
        className="mt-3 border border-[var(--t-divider)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-accent)] hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
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
  const suggestQuery = useSuggestPrompts(headlineBody, !openInConfigure);
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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/75" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[86vh] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-[var(--t-bronze)] bg-[linear-gradient(rgba(101,160,94,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(101,160,94,0.03)_1px,transparent_1px),radial-gradient(circle_at_top,rgba(214,166,96,0.08),transparent_34%),#040807] bg-[length:100%_18px,18px_100%,auto,auto] font-mono shadow-2xl shadow-black/45">
          <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[var(--t-divider)] bg-[#0b100d] px-3 py-2">
            <div className="min-w-0">
              <Dialog.Title className="truncate font-[family-name:var(--font-plex-sans)] text-sm font-black uppercase tracking-[0.14em] text-[var(--t-accent)]">
                Create Deal
              </Dialog.Title>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                {dealSeed ? "Wire seed" : "Newswire premise"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="border border-[var(--t-divider)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                {STATE_META[state]}
              </span>
              <Dialog.Close className="border border-[var(--t-divider)] px-2 py-1 text-[10px] text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]">
                [X]
              </Dialog.Close>
            </div>
          </div>

          <div className="max-h-[calc(86vh-2.5rem)] overflow-y-auto">
            {headline.headline && (
              <div className="border-b border-[var(--t-divider)] px-3 py-2">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                  Source
                </div>
                <p className="text-xs font-bold leading-relaxed text-[var(--t-amber)]">
                  {headline.headline}
                </p>
                {headline.body && (
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--t-green)]">
                    {headline.body}
                  </p>
                )}
              </div>
            )}

            {state === "suggestions" && (
              <DealSuggestionsPane
                suggestQuery={suggestQuery}
                onPickSuggestion={handlePickSuggestion}
              />
            )}

            {(state === "configure" || state === "creating") && (
              <div className="px-3 py-3">
                <label className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                  Deal text
                </label>
                <textarea
                  value={selectedPrompt}
                  onChange={(e) => setSelectedPrompt(e.target.value)}
                  rows={8}
                  disabled={isCreating}
                  className="mt-1 w-full border border-[var(--t-divider)] bg-black/10 px-2 py-2 text-xs leading-relaxed text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
                />

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <label className="border border-[var(--t-divider)] bg-black/10 px-2 py-2">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                      Pot (USDC)
                    </span>
                    <input
                      type="number"
                      value={potAmount}
                      onChange={(e) => setPotAmount(e.target.value)}
                      min={MIN_POT_AMOUNT}
                      step="0.01"
                      disabled={isCreating}
                      className="mt-1 w-full bg-transparent text-sm font-bold text-[var(--t-green)] focus:outline-none disabled:opacity-50"
                    />
                  </label>
                  <label className="border border-[var(--t-divider)] bg-black/10 px-2 py-2">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                      Entry
                    </span>
                    <input
                      type="number"
                      value={entryCost}
                      onChange={(e) => setEntryCost(e.target.value)}
                      min={MIN_ENTRY_COST}
                      step="0.01"
                      disabled={isCreating}
                      className="mt-1 w-full bg-transparent text-sm font-bold text-[var(--t-green)] focus:outline-none disabled:opacity-50"
                    />
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                  {potNum > 0 && (
                    <span>
                      {DEAL_CREATION_FEE_PERCENTAGE}% fee / net{" "}
                      <span className="text-[var(--t-green)]">
                        ${netPot.toFixed(2)}
                      </span>
                    </span>
                  )}
                  {balance !== undefined && (
                    <span>
                      cash{" "}
                      <span className="text-[var(--t-green)]">
                        ${balance.toFixed(2)}
                      </span>
                    </span>
                  )}
                </div>

                {insufficientBalance && (
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--t-amber)]">
                    Insufficient balance
                  </p>
                )}

                {!authenticated && (
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--t-amber)]">
                    Connect wallet to create deals
                  </p>
                )}

                {createError && (
                  <div className="mt-2 text-[10px] text-[var(--t-red)]">
                    {createError}
                  </div>
                )}

                {isCreating && (
                  <div className="mt-3 border border-[var(--t-green)]/40 bg-[var(--t-green)]/5 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--t-green)]">
                        {STEP_LABELS[step] ?? "PROCESSING..."}
                      </span>
                      <span className="cursor-blink text-[var(--t-green)]">
                        {"█"}
                      </span>
                    </div>
                    <div className="mt-1 h-0.5 overflow-hidden bg-[var(--t-border)]">
                      <div
                        className="h-full bg-[var(--t-green)] transition-all duration-500"
                        style={{
                          width: createDealProgressWidth(step),
                        }}
                      />
                    </div>
                  </div>
                )}

                {!isCreating && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={handleSubmitDeal}
                      disabled={
                        !authenticated ||
                        !selectedPrompt.trim() ||
                        isNaN(potNum) ||
                        potNum < MIN_POT_AMOUNT ||
                        isNaN(entryNum) ||
                        entryNum < MIN_ENTRY_COST ||
                        insufficientBalance
                      }
                      className="border border-[var(--t-accent)] bg-[var(--t-accent-soft)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40"
                    >
                      Create Deal
                    </button>
                    <button
                      onClick={handleBack}
                      className="border border-transparent px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-divider)] hover:text-[var(--t-text)]"
                    >
                      Back
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
