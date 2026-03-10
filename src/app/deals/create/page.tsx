"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEAL_CREATION_FEE_PERCENTAGE,
  MIN_POT_AMOUNT,
  MIN_ENTRY_COST,
} from "@/lib/constants";
import { useBaseNetwork } from "@/hooks/use-base-network";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { useSuggestPrompts } from "@/hooks/use-deals";
import { useCreateDeal } from "@/hooks/use-create-deal";
import { PAYMENT_CHAIN_NAME } from "@/lib/privy/config";
import { Nav } from "@/components/nav";

const STEP_LABELS: Record<string, string> = {
  approving: "APPROVING USDC SPEND...",
  creating: "CREATING DEAL ON-CHAIN...",
  syncing: "SYNCING DEAL TO DATABASE...",
  done: "DEAL CREATED SUCCESSFULLY",
};

export default function CreateDealPage() {
  const { ready, authenticated, login } = usePrivy();
  const { isWrongNetwork } = useBaseNetwork();
  const {
    balance,
    isLoading: balanceLoading,
    walletAddress,
  } = useUsdcBalance();
  const suggestPrompts = useSuggestPrompts();
  const {
    createDeal,
    reset: resetCreateDeal,
    step,
    isLoading: isCreating,
    error: createError,
    dealId,
    createHash,
  } = useCreateDeal();
  const router = useRouter();

  const [prompt, setPrompt] = useState("");
  const [potAmount, setPotAmount] = useState("");
  const [entryCost, setEntryCost] = useState("");
  const [theme, setTheme] = useState("");

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg)] font-mono">
        <p className="text-[var(--t-muted)]">
          INITIALIZING...<span className="cursor-blink">█</span>
        </p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="crt-scanlines flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--t-bg)] font-mono">
        <h1 className="text-lg font-bold text-[var(--t-text)] font-[family-name:var(--font-plex-sans)]">
          CREATE A DEAL
        </h1>
        <p className="text-xs text-[var(--t-muted)]">
          Connect your wallet to create deals.
        </p>
        <button
          onClick={login}
          className="border border-[var(--t-border)] bg-[var(--t-surface)] px-8 py-3 text-sm text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
        >
          {">"} CONNECT_WALLET<span className="cursor-blink">█</span>
        </button>
      </div>
    );
  }

  const belowMinPot = balance !== undefined && balance < MIN_POT_AMOUNT;

  if (!balanceLoading && belowMinPot && walletAddress) {
    return (
      <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
        <Nav />
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="border border-[var(--t-amber)]/40 bg-[var(--t-bg)]">
            <div className="border-b border-[var(--t-amber)]/40 bg-[var(--t-amber)]/5 px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--t-amber)]">
              INSUFFICIENT BALANCE
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-[var(--t-muted)]">
                Minimum {MIN_POT_AMOUNT} USDC on {PAYMENT_CHAIN_NAME} required.
                Send USDC to your wallet — this page updates automatically.
              </p>
              <div className="mt-4">
                <p className="text-[10px] uppercase text-[var(--t-muted)]">
                  YOUR WALLET
                </p>
                <button
                  type="button"
                  className="mt-1 w-full border border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-2 text-left font-mono text-xs text-[var(--t-text)] transition-colors hover:border-[var(--t-accent)]"
                  onClick={() => navigator.clipboard.writeText(walletAddress)}
                  title="Copy address"
                >
                  {walletAddress}
                </button>
                <p className="mt-1 text-[10px] text-[var(--t-muted)]">
                  Click to copy
                </p>
              </div>
              <p className="mt-4 text-center text-[10px] text-[var(--t-muted)]">
                Balance: {balance!.toFixed(2)} USDC — polling every 15s
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const potNum = parseFloat(potAmount);
  const netPot =
    potNum > 0 ? potNum * (1 - DEAL_CREATION_FEE_PERCENTAGE / 100) : 0;
  const hasPotAmount = !isNaN(potNum) && potNum > 0;
  const insufficientBalance =
    balance !== undefined && hasPotAmount && balance < potNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pot = parseFloat(potAmount);
    const entry = parseFloat(entryCost);
    if (!prompt.trim() || isNaN(pot) || isNaN(entry)) return;

    try {
      const result = await createDeal(prompt.trim(), pot, entry);
      if (result?.dealId !== undefined) {
        setTimeout(() => router.push("/deals"), 1500);
      }
    } catch {
      // error is in createError state
    }
  }

  if (step === "done") {
    return (
      <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
        <Nav />
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="border border-[var(--t-green)]/40 bg-[var(--t-bg)]">
            <div className="border-b border-[var(--t-green)]/40 bg-[var(--t-green)]/5 px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--t-green)]">
              DEAL CREATED
            </div>
            <div className="px-4 py-4">
              {dealId !== undefined && (
                <p className="text-xs text-[var(--t-muted)]">
                  On-chain Deal ID:{" "}
                  <span className="text-[var(--t-text)]">
                    #{dealId.toString()}
                  </span>
                </p>
              )}
              {createHash && (
                <a
                  href={`https://sepolia.basescan.org/tx/${createHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-[var(--t-accent)] underline decoration-[var(--t-accent)]/50 hover:text-[var(--t-text)]"
                >
                  View transaction on BaseScan
                </a>
              )}
              <p className="mt-3 text-[10px] text-[var(--t-muted)]">
                Redirecting to deals...
              </p>
              <button
                onClick={() => {
                  resetCreateDeal();
                  router.push("/deals");
                }}
                className="mt-4 border border-[var(--t-border)] px-4 py-2 text-xs text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
              >
                {">"} GO TO DEALS
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      {/* Sub-header */}
      <div className="border-b border-[var(--t-border)] bg-[var(--t-bg)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-1.5 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
            NEW DEAL
          </span>
          {balance !== undefined && (
            <span className="text-[10px] text-[var(--t-muted)]">
              BAL{" "}
              <span className="text-[var(--t-green)]">
                ${balance.toFixed(2)}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {/* How Deals Work */}
        <details className="mb-4 border border-[var(--t-border)]">
          <summary className="cursor-pointer border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)] select-none hover:text-[var(--t-text)]">
            HOW DEALS WORK
          </summary>
          <div className="flex flex-col gap-3 px-3 py-3 text-xs leading-relaxed text-[var(--t-muted)]">
            <p>
              <span className="text-[var(--t-accent)]">
                WHAT&apos;S A DEAL?
              </span>{" "}
              You write a scenario and fund a USDC pot. AI traders on the street
              evaluate it and decide whether to enter.
            </p>
            <p>
              <span className="text-[var(--t-accent)]">HOW YOU MAKE MONEY</span>{" "}
              When a trader enters your deal and{" "}
              <span className="text-[var(--t-text)]">loses</span>, their entry
              cost stays in your pot. You profit from bad trades. When you close
              the deal, you withdraw whatever&apos;s left.
            </p>
            <p>
              <span className="text-[var(--t-accent)]">
                WHAT MAKES A GOOD DEAL?
              </span>{" "}
              Scenarios that sound lucrative but are traps. High entry costs
              attract confident traders but filter out cautious ones. Bigger
              pots attract more entries. The AI resolves outcomes, so a
              well-crafted scenario influences the narrative.
            </p>
            <p className="border-t border-[var(--t-border)] pt-3 text-[10px] uppercase tracking-wider">
              <span className="text-[var(--t-text)]">
                {DEAL_CREATION_FEE_PERCENTAGE}%
              </span>{" "}
              creation fee
              {" · "}traders extract max{" "}
              <span className="text-[var(--t-text)]">25%</span> of pot per win
              {" · "}
              <span className="text-[var(--t-text)]">10%</span> rake on trader
              winnings to platform
            </p>
          </div>
        </details>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* AI Prompt Suggestions */}
          <div className="border border-[var(--t-border)]">
            <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              AI PROMPT GENERATOR
            </div>
            <div className="px-3 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--t-accent)]">{">"}</span>
                <input
                  id="theme"
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      theme.trim() &&
                      !suggestPrompts.isPending
                    ) {
                      e.preventDefault();
                      suggestPrompts.mutate(theme.trim());
                    }
                  }}
                  placeholder="theme: insider trading, hostile takeover, junk bonds..."
                  disabled={isCreating}
                  className="flex-1 bg-transparent text-xs text-[var(--t-text)] placeholder:text-[var(--t-muted)] outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={
                    suggestPrompts.isPending ||
                    theme.trim().length === 0 ||
                    isCreating
                  }
                  onClick={() => suggestPrompts.mutate(theme.trim())}
                  className="border border-[var(--t-border)] px-2.5 py-1 text-[10px] text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] disabled:opacity-50"
                >
                  {suggestPrompts.isPending ? "GENERATING..." : "SUGGEST"}
                </button>
              </div>

              {suggestPrompts.error && (
                <p className="mt-2 text-[10px] text-[var(--t-red)]">
                  ERR: {suggestPrompts.error.message}
                </p>
              )}

              {suggestPrompts.data && (
                <div className="mt-3 flex flex-col gap-[1px] bg-[var(--t-border)]">
                  {suggestPrompts.data.map((suggestion, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPrompt(suggestion)}
                      disabled={isCreating}
                      className={`bg-[var(--t-bg)] px-3 py-2.5 text-left text-xs transition-colors hover:bg-[var(--t-surface)] disabled:opacity-50 ${
                        prompt === suggestion
                          ? "text-[var(--t-accent)]"
                          : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => suggestPrompts.mutate(theme.trim())}
                    disabled={
                      suggestPrompts.isPending || !theme.trim() || isCreating
                    }
                    className="bg-[var(--t-bg)] px-3 py-1.5 text-left text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-accent)] disabled:opacity-50"
                  >
                    {suggestPrompts.isPending ? "GENERATING..." : "REGENERATE"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Deal Prompt */}
          <div className="border border-[var(--t-border)]">
            <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              DEAL SCENARIO
            </div>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={4}
              disabled={isCreating}
              placeholder="Write a scenario for traders to enter..."
              className="w-full bg-[var(--t-bg)] px-3 py-3 text-xs leading-relaxed text-[var(--t-text)] placeholder-[var(--t-muted)] focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Pot + Entry Side by Side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-[var(--t-border)]">
              <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                POT (USDC)
              </div>
              <div className="px-3 py-3">
                <input
                  id="potAmount"
                  type="number"
                  value={potAmount}
                  onChange={(e) => setPotAmount(e.target.value)}
                  required
                  min={MIN_POT_AMOUNT}
                  step="0.01"
                  disabled={isCreating}
                  placeholder={MIN_POT_AMOUNT.toString()}
                  className="w-full bg-transparent text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:outline-none disabled:opacity-50"
                />
                {potNum > 0 && (
                  <p className="mt-1.5 text-[10px] text-[var(--t-muted)]">
                    {DEAL_CREATION_FEE_PERCENTAGE}% fee — net:{" "}
                    <span className="text-[var(--t-green)]">
                      ${netPot.toFixed(2)}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="border border-[var(--t-border)]">
              <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
                ENTRY COST (USDC)
              </div>
              <div className="px-3 py-3">
                <input
                  id="entryCost"
                  type="number"
                  value={entryCost}
                  onChange={(e) => setEntryCost(e.target.value)}
                  required
                  min={MIN_ENTRY_COST}
                  step="0.01"
                  disabled={isCreating}
                  placeholder={MIN_ENTRY_COST.toString()}
                  className="w-full bg-transparent text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Insufficient balance warning */}
          {insufficientBalance && walletAddress && (
            <div className="border border-[var(--t-amber)]/40 bg-[var(--t-amber)]/5">
              <div className="px-3 py-3">
                <p className="text-[10px] font-bold uppercase text-[var(--t-amber)]">
                  INSUFFICIENT BALANCE
                </p>
                <p className="mt-1 text-xs text-[var(--t-muted)]">
                  Need ${potNum.toFixed(2)} — have ${balance!.toFixed(2)}. Send
                  USDC on {PAYMENT_CHAIN_NAME} to:
                </p>
                <button
                  type="button"
                  className="mt-1.5 w-full border border-[var(--t-border)] bg-[var(--t-surface)] px-2 py-1.5 text-left font-mono text-[10px] text-[var(--t-text)] transition-colors hover:border-[var(--t-accent)]"
                  onClick={() => navigator.clipboard.writeText(walletAddress)}
                >
                  {walletAddress}
                </button>
              </div>
            </div>
          )}

          {/* Wrong network */}
          {isWrongNetwork && (
            <p className="text-[10px] text-[var(--t-amber)]">
              Switch to {PAYMENT_CHAIN_NAME} to continue.
            </p>
          )}

          {/* Error */}
          {createError && (
            <div className="border border-[var(--t-red)]/40 bg-[var(--t-red)]/5 px-3 py-3">
              <p className="text-xs text-[var(--t-red)]">{createError}</p>
              <button
                type="button"
                onClick={resetCreateDeal}
                className="mt-2 text-[10px] text-[var(--t-muted)] underline hover:text-[var(--t-text)]"
              >
                Try again
              </button>
            </div>
          )}

          {/* Progress */}
          {isCreating && (
            <div className="border border-[var(--t-green)]/40 bg-[var(--t-green)]/5 px-3 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--t-green)]">
                  {STEP_LABELS[step] ?? "PROCESSING..."}
                </span>
                <span className="cursor-blink text-[var(--t-green)]">█</span>
              </div>
              <div className="mt-2 h-0.5 overflow-hidden bg-[var(--t-border)]">
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

          {/* Submit */}
          <button
            type="submit"
            disabled={
              isWrongNetwork ||
              insufficientBalance ||
              balanceLoading ||
              isCreating
            }
            className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-6 py-2.5 text-xs font-bold text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40"
          >
            {isCreating ? "CREATING DEAL..." : "CREATE DEAL"}
          </button>
        </form>
      </div>
    </div>
  );
}
