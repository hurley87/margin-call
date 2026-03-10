"use client";

import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useSuggestPrompts, useHeadlineDeals } from "@/hooks/use-deals";
import type { Deal } from "@/hooks/use-deals";
import { useCreateDeal } from "@/hooks/use-create-deal";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import {
  DEAL_CREATION_FEE_PERCENTAGE,
  MIN_POT_AMOUNT,
  MIN_ENTRY_COST,
} from "@/lib/constants";
import type { FeedHeadline } from "@/hooks/use-narrative";

const CATEGORY_BADGE: Record<
  string,
  { label: string; color: string; border: string }
> = {
  rumor: {
    label: "RUMOR",
    color: "text-[var(--t-amber)]",
    border: "border-l-[var(--t-amber)]",
  },
  breaking: {
    label: "BREAKING",
    color: "text-[var(--t-red)]",
    border: "border-l-[var(--t-red)]",
  },
  investigation: {
    label: "SEC",
    color: "text-[var(--t-red)]",
    border: "border-l-[var(--t-red)]",
  },
  market_move: {
    label: "MARKET",
    color: "text-[var(--t-green)]",
    border: "border-l-[var(--t-green)]",
  },
  corporate_drama: {
    label: "CORP",
    color: "text-[var(--t-accent)]",
    border: "border-l-[var(--t-accent)]",
  },
  politics: {
    label: "DC",
    color: "text-[var(--t-accent)]",
    border: "border-l-[var(--t-accent)]",
  },
};

const STEP_LABELS: Record<string, string> = {
  approving: "APPROVING USDC SPEND...",
  creating: "CREATING DEAL ON-CHAIN...",
  syncing: "SYNCING DEAL TO DATABASE...",
  done: "DEAL CREATED SUCCESSFULLY",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

type WirePostState = "default" | "suggestions" | "configure";

interface WirePostProps {
  item: FeedHeadline;
  headlineDeals?: Deal[];
  authenticated: boolean;
  balance: number | undefined;
}

function WirePost({
  item,
  headlineDeals,
  authenticated,
  balance,
}: WirePostProps) {
  const [state, setState] = useState<WirePostState>("default");
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

  const badge = CATEGORY_BADGE[item.category] ?? {
    label: item.category.toUpperCase(),
    color: "text-[var(--t-muted)]",
    border: "border-l-[var(--t-muted)]",
  };

  const handleCreateDeal = async () => {
    if (suggestions) {
      setState("suggestions");
      return;
    }
    try {
      const result = await suggestMutation.mutateAsync(item.headline);
      setSuggestions(result);
      setState("suggestions");
    } catch {
      // error handled by mutation
    }
  };

  const handlePickSuggestion = (prompt: string) => {
    setSelectedPrompt(prompt);
    setState("configure");
  };

  const handleRegenerate = () => {
    suggestMutation.mutate(item.headline, {
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
    try {
      await createDeal(selectedPrompt.trim(), potNum, entryNum, item.headline);
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      resetCreateDeal();
      setState("default");
    } catch {
      // error in createError state
    }
  };

  const handleCancel = () => {
    setState("suggestions");
    resetCreateDeal();
    setPotAmount(MIN_POT_AMOUNT.toString());
    setEntryCost(MIN_ENTRY_COST.toString());
  };

  return (
    <div className={`border-l-2 ${badge.border} py-2.5 pl-3 pr-3`}>
      {/* Meta line: category + time */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className={`font-bold ${badge.color}`}>{badge.label}</span>
        <span className="text-[var(--t-muted)]">
          {timeAgo(item.created_at)}
        </span>
      </div>

      {/* Headline */}
      <p className="mt-0.5 text-[13px] font-bold leading-snug text-[var(--t-text)]">
        {item.headline}
      </p>

      {/* Body */}
      <p className="mt-1 text-xs leading-relaxed text-[var(--t-muted)]">
        {item.body}
      </p>

      {/* Deals linked to this headline (persistent from DB) */}
      {headlineDeals && headlineDeals.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {headlineDeals.map((d) => (
            <DealBadge key={d.id} deal={d} />
          ))}
        </div>
      )}

      {/* State: Default — show CREATE DEAL button */}
      {state === "default" && (
        <div className="mt-1.5">
          <button
            onClick={handleCreateDeal}
            disabled={suggestMutation.isPending}
            className="text-[10px] font-medium text-[var(--t-accent)] transition-colors hover:text-[var(--t-text)] disabled:opacity-50"
          >
            {suggestMutation.isPending ? "GENERATING..." : "CREATE DEAL \u2192"}
          </button>
        </div>
      )}

      {/* State: Suggestions */}
      {state === "suggestions" && suggestions && (
        <div className="mt-2 border border-[var(--t-border)]">
          <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
            DEAL IDEAS
          </div>
          <div className="flex flex-col">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handlePickSuggestion(s)}
                className="border-b border-[var(--t-border)] last:border-b-0 px-3 py-2 text-left text-xs text-[var(--t-text)] transition-colors hover:bg-[var(--t-surface)] hover:text-[var(--t-accent)]"
              >
                <span className="text-[var(--t-accent)]">{">"}</span> {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-[var(--t-border)] px-3 py-1.5">
            <button
              onClick={handleRegenerate}
              disabled={suggestMutation.isPending}
              className="text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-accent)] disabled:opacity-50"
            >
              {suggestMutation.isPending ? "GENERATING..." : "REGENERATE"}
            </button>
            <button
              onClick={() => setState("default")}
              className="text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* State: Configure deal */}
      {state === "configure" && (
        <div className="mt-2 border border-[var(--t-border)]">
          <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
            NEW DEAL
          </div>
          <div className="px-3 py-3">
            {/* Editable prompt */}
            <textarea
              value={selectedPrompt}
              onChange={(e) => setSelectedPrompt(e.target.value)}
              rows={3}
              disabled={isCreating}
              className="w-full bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-2 text-xs leading-relaxed text-[var(--t-text)] placeholder-[var(--t-muted)] focus:outline-none focus:border-[var(--t-accent)] disabled:opacity-50"
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
                  placeholder={MIN_POT_AMOUNT.toString()}
                  disabled={isCreating}
                  className="w-20 border border-[var(--t-border)] bg-transparent px-2 py-1 text-xs text-[var(--t-text)] placeholder-[var(--t-muted)] focus:outline-none focus:border-[var(--t-accent)] disabled:opacity-50"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--t-muted)]">ENTRY</span>
                <input
                  type="number"
                  value={entryCost}
                  onChange={(e) => setEntryCost(e.target.value)}
                  min={MIN_ENTRY_COST}
                  step="0.01"
                  placeholder={MIN_ENTRY_COST.toString()}
                  disabled={isCreating}
                  className="w-20 border border-[var(--t-border)] bg-transparent px-2 py-1 text-xs text-[var(--t-text)] placeholder-[var(--t-muted)] focus:outline-none focus:border-[var(--t-accent)] disabled:opacity-50"
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

            {/* Insufficient balance warning */}
            {insufficientBalance && (
              <p className="mt-1.5 text-[10px] font-bold text-[var(--t-amber)]">
                INSUFFICIENT BALANCE
              </p>
            )}

            {/* Not authenticated warning */}
            {!authenticated && (
              <p className="mt-1.5 text-[10px] text-[var(--t-amber)]">
                CONNECT WALLET TO CREATE DEALS
              </p>
            )}

            {/* Error */}
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
              <div className="mt-2 flex items-center gap-2">
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
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
                >
                  CANCEL
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DealBadge({ deal }: { deal: Deal }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <Link
        href={`/deals/${deal.id}`}
        className="text-[var(--t-accent)] hover:text-[var(--t-text)]"
      >
        DEAL{" "}
        {deal.on_chain_deal_id !== undefined ? `#${deal.on_chain_deal_id}` : ""}
      </Link>
      <span
        className={`font-bold ${
          deal.status === "open"
            ? "text-[var(--t-green)]"
            : "text-[var(--t-muted)]"
        }`}
      >
        [{deal.status.toUpperCase()}]
      </span>
      <span className="text-[var(--t-muted)]">
        POT{" "}
        <span className="text-[var(--t-green)]">
          ${deal.pot_usdc.toFixed(2)}
        </span>
      </span>
      <span className="text-[var(--t-muted)]">
        ENTRY{" "}
        <span className="text-[var(--t-accent)]">
          ${deal.entry_cost_usdc.toFixed(2)}
        </span>
      </span>
      <span className="text-[var(--t-muted)]">{deal.entry_count} entries</span>
    </div>
  );
}

export function WireFeed({ feed }: { feed: FeedHeadline[] }) {
  const { data: headlineDealsMap } = useHeadlineDeals();
  const { authenticated } = usePrivy();
  const { balance } = useUsdcBalance();

  return (
    <div className="space-y-0 divide-y divide-[var(--t-border)]/20">
      {feed.map((item, i) => (
        <WirePost
          key={`${item.epoch}-${i}`}
          item={item}
          headlineDeals={headlineDealsMap?.[item.headline]}
          authenticated={authenticated}
          balance={balance}
        />
      ))}
    </div>
  );
}
