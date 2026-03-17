"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useSuggestPrompts } from "@/hooks/use-deals";
import { useCreateDeal } from "@/hooks/use-create-deal";
import {
  DEAL_CREATION_FEE_PERCENTAGE,
  MIN_POT_AMOUNT,
  MIN_ENTRY_COST,
} from "@/lib/constants";
import type { FeedHeadline } from "@/hooks/use-narrative";

const STEP_LABELS: Record<string, string> = {
  approving: "APPROVING USDC SPEND...",
  creating: "CREATING DEAL ON-CHAIN...",
  syncing: "SYNCING DEAL TO DATABASE...",
  done: "DEAL CREATED SUCCESSFULLY",
};

type DialogState = "suggestions" | "configure" | "creating";

interface CreateDealDialogProps {
  headline: FeedHeadline;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authenticated: boolean;
  balance: number | undefined;
}

export function CreateDealDialog({
  headline,
  open,
  onOpenChange,
  authenticated,
  balance,
}: CreateDealDialogProps) {
  const [state, setState] = useState<DialogState>("suggestions");
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [potAmount, setPotAmount] = useState(MIN_POT_AMOUNT.toString());
  const [entryCost, setEntryCost] = useState(MIN_ENTRY_COST.toString());

  const suggestMutation = useSuggestPrompts();
  const queryClient = useQueryClient();
  const {
    createDeal,
    reset: resetCreateDeal,
    step,
    isLoading: isCreating,
    error: createError,
  } = useCreateDeal();

  // Auto-suggest on mount (dialog is lazy-mounted, so open is always true on first render)
  useEffect(() => {
    if (!suggestMutation.isPending) {
      suggestMutation.mutate(headline.headline, {
        onSuccess: (data) => setSuggestions(data),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePickSuggestion = (prompt: string) => {
    setSelectedPrompt(prompt);
    setState("configure");
  };

  const handleRegenerate = () => {
    suggestMutation.mutate(headline.headline, {
      onSuccess: (data) => setSuggestions(data),
    });
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
      await createDeal(
        selectedPrompt.trim(),
        potNum,
        entryNum,
        headline.headline
      );
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["my-deals"] });
      onOpenChange(false);
    } catch {
      setState("configure");
    }
  };

  const handleBack = () => {
    setState("suggestions");
    resetCreateDeal();
    setPotAmount(MIN_POT_AMOUNT.toString());
    setEntryCost(MIN_ENTRY_COST.toString());
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 border border-[var(--t-border)] bg-[var(--t-bg)] font-mono">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              CREATE DEAL
            </span>
            <Dialog.Close className="text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]">
              [X]
            </Dialog.Close>
          </div>

          {/* Source headline context */}
          <div className="border-b border-[var(--t-border)] px-4 py-2">
            <p className="text-[10px] text-[var(--t-muted)]">FROM HEADLINE:</p>
            <p className="mt-0.5 text-xs font-bold text-[var(--t-text)]">
              {headline.headline}
            </p>
          </div>

          {/* Suggestions state */}
          {state === "suggestions" && (
            <>
              {suggestMutation.isPending && !suggestions ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-[var(--t-muted)]">
                    GENERATING DEAL IDEAS...
                    <span className="cursor-blink">{"\u2588"}</span>
                  </p>
                </div>
              ) : suggestions ? (
                <>
                  <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                    DEAL IDEAS
                  </div>
                  <div className="flex flex-col">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => handlePickSuggestion(s)}
                        className="border-b border-[var(--t-border)] px-4 py-2.5 text-left text-xs text-[var(--t-text)] transition-colors last:border-b-0 hover:bg-[var(--t-surface)] hover:text-[var(--t-accent)]"
                      >
                        <span className="text-[var(--t-accent)]">{">"}</span>{" "}
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 border-t border-[var(--t-border)] px-4 py-2">
                    <button
                      onClick={handleRegenerate}
                      disabled={suggestMutation.isPending}
                      className="text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-accent)] disabled:opacity-50"
                    >
                      {suggestMutation.isPending
                        ? "GENERATING..."
                        : "REGENERATE"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-[var(--t-muted)]">
                    Failed to load suggestions.
                  </p>
                  <button
                    onClick={handleRegenerate}
                    className="mt-2 text-[10px] text-[var(--t-accent)] hover:text-[var(--t-text)]"
                  >
                    RETRY
                  </button>
                </div>
              )}
            </>
          )}

          {/* Configure state */}
          {(state === "configure" || state === "creating") && (
            <div className="px-4 py-3">
              <textarea
                value={selectedPrompt}
                onChange={(e) => setSelectedPrompt(e.target.value)}
                rows={3}
                disabled={isCreating}
                className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-2 py-2 text-xs leading-relaxed text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
              />

              {/* Pot + Entry inputs */}
              <div className="mt-2 flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--t-muted)]">
                    POT (USDC)
                  </span>
                  <input
                    type="number"
                    value={potAmount}
                    onChange={(e) => setPotAmount(e.target.value)}
                    min={MIN_POT_AMOUNT}
                    step="0.01"
                    disabled={isCreating}
                    className="w-20 border border-[var(--t-border)] bg-transparent px-2 py-1 text-xs text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--t-muted)]">
                    ENTRY
                  </span>
                  <input
                    type="number"
                    value={entryCost}
                    onChange={(e) => setEntryCost(e.target.value)}
                    min={MIN_ENTRY_COST}
                    step="0.01"
                    disabled={isCreating}
                    className="w-20 border border-[var(--t-border)] bg-transparent px-2 py-1 text-xs text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Fee + Balance info */}
              <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--t-muted)]">
                {potNum > 0 && (
                  <span>
                    {DEAL_CREATION_FEE_PERCENTAGE}% fee — net:{" "}
                    <span className="text-[var(--t-green)]">
                      ${netPot.toFixed(2)}
                    </span>
                  </span>
                )}
                {balance !== undefined && (
                  <span>
                    BAL:{" "}
                    <span className="text-[var(--t-green)]">
                      ${balance.toFixed(2)}
                    </span>
                  </span>
                )}
              </div>

              {insufficientBalance && (
                <p className="mt-1.5 text-[10px] font-bold text-[var(--t-amber)]">
                  INSUFFICIENT BALANCE
                </p>
              )}

              {!authenticated && (
                <p className="mt-1.5 text-[10px] text-[var(--t-amber)]">
                  CONNECT WALLET TO CREATE DEALS
                </p>
              )}

              {createError && (
                <div className="mt-1.5 text-[10px] text-[var(--t-red)]">
                  {createError}
                </div>
              )}

              {/* Progress */}
              {isCreating && (
                <div className="mt-2 border border-[var(--t-green)]/40 bg-[var(--t-green)]/5 px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--t-green)]">
                      {STEP_LABELS[step] ?? "PROCESSING..."}
                    </span>
                    <span className="cursor-blink text-[var(--t-green)]">
                      {"\u2588"}
                    </span>
                  </div>
                  <div className="mt-1 h-0.5 overflow-hidden bg-[var(--t-border)]">
                    <div
                      className="h-full bg-[var(--t-green)] transition-all duration-500"
                      style={{
                        width:
                          step === "approving"
                            ? "33%"
                            : step === "creating"
                              ? "66%"
                              : step === "syncing"
                                ? "90%"
                                : "100%",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
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
                    className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] font-bold text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40"
                  >
                    CREATE DEAL
                  </button>
                  <button
                    onClick={handleBack}
                    className="px-3 py-1.5 text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
                  >
                    BACK
                  </button>
                </div>
              )}
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
