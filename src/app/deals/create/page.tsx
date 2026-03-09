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
  approving: "Approving USDC...",
  creating: "Creating deal on-chain...",
  syncing: "Syncing deal...",
  done: "Deal created!",
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
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg)]">
        <p className="text-[var(--t-muted)]">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--t-bg)]">
        <h1 className="text-2xl font-semibold text-[var(--t-text)] font-[family-name:var(--font-plex-sans)]">
          Create a Deal
        </h1>
        <p className="text-[var(--t-muted)]">
          Connect your wallet to create deals.
        </p>
        <button
          onClick={login}
          className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-8 py-3 font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  const belowMinPot = balance !== undefined && balance < MIN_POT_AMOUNT;

  if (!balanceLoading && belowMinPot && walletAddress) {
    return (
      <div className="min-h-screen bg-[var(--t-bg)]">
        <Nav />
        <div className="flex flex-col items-center justify-center gap-6 px-4 py-12">
          <div className="flex w-full max-w-lg flex-col gap-4 border border-[var(--t-border)] bg-[var(--t-surface)] p-8">
            <h1 className="text-2xl font-semibold text-[var(--t-text)] font-[family-name:var(--font-plex-sans)]">
              Create a Deal
            </h1>
            <div className="border border-[var(--t-amber)]/50 bg-[var(--t-amber)]/5 p-4">
              <p className="font-medium text-[var(--t-amber)]">
                Insufficient USDC balance
              </p>
              <p className="mt-2 text-sm text-[var(--t-muted)]">
                You need at least {MIN_POT_AMOUNT} USDC on {PAYMENT_CHAIN_NAME}{" "}
                to create a deal. Send USDC to your wallet and this page will
                update automatically.
              </p>
              <p className="mt-3 text-sm text-[var(--t-muted)]">
                Your wallet address:
              </p>
              <button
                type="button"
                className="mt-1 w-full break-all border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-left font-mono text-sm text-[var(--t-text)] transition-colors hover:border-[var(--t-accent)]"
                onClick={() => navigator.clipboard.writeText(walletAddress)}
                title="Copy address"
              >
                {walletAddress}
              </button>
              <p className="mt-2 text-xs text-[var(--t-muted)]">
                Click to copy
              </p>
            </div>
            <p className="text-center text-xs text-[var(--t-muted)]">
              Wallet balance: {balance!.toFixed(2)} USDC — checking every 15s
            </p>
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
      <div className="min-h-screen bg-[var(--t-bg)]">
        <Nav />
        <div className="flex flex-col items-center justify-center gap-6 px-4 py-12">
          <div className="flex w-full max-w-lg flex-col gap-4 border border-[var(--t-border)] bg-[var(--t-surface)] p-8">
            <h1 className="text-2xl font-semibold text-[var(--t-green)] font-[family-name:var(--font-plex-sans)]">
              Deal Created!
            </h1>
            {dealId !== undefined && (
              <p className="text-sm text-[var(--t-muted)]">
                On-chain Deal ID: {dealId.toString()}
              </p>
            )}
            {createHash && (
              <a
                href={`https://sepolia.basescan.org/tx/${createHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--t-accent)] underline decoration-[var(--t-accent)]/50 hover:text-[var(--t-text)]"
              >
                View transaction on BaseScan
              </a>
            )}
            <p className="text-sm text-[var(--t-muted)]">
              Redirecting to deals...
            </p>
            <button
              onClick={() => {
                resetCreateDeal();
                router.push("/deals");
              }}
              className="border border-[var(--t-border)] px-6 py-2 text-sm font-medium text-[var(--t-text)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
            >
              Go to Deals
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--t-bg)]">
      <Nav />
      <div className="flex flex-col items-center justify-center px-4 py-12">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-lg flex-col gap-6 border border-[var(--t-border)] bg-[var(--t-surface)] p-8"
        >
          <h1 className="text-2xl font-semibold text-[var(--t-text)] font-[family-name:var(--font-plex-sans)]">
            Create a Deal
          </h1>

          <div className="flex flex-col gap-2">
            <label htmlFor="theme" className="text-sm text-[var(--t-muted)]">
              AI Prompt Suggestions
            </label>
            <div className="flex gap-2">
              <input
                id="theme"
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. insider trading, hostile takeover"
                disabled={isCreating}
                className="flex-1 border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
              />
              <button
                type="button"
                disabled={
                  suggestPrompts.isPending ||
                  theme.trim().length === 0 ||
                  isCreating
                }
                onClick={() => suggestPrompts.mutate(theme.trim())}
                className="whitespace-nowrap border border-[var(--t-border)] bg-[var(--t-bg)] px-4 py-2 text-sm font-medium text-[var(--t-text)] transition-colors hover:border-[var(--t-accent)] disabled:opacity-50"
              >
                {suggestPrompts.isPending ? "Thinking..." : "Suggest Prompts"}
              </button>
            </div>
            {suggestPrompts.error && (
              <p className="text-sm text-[var(--t-red)]">
                {suggestPrompts.error.message}
              </p>
            )}
            {suggestPrompts.data && (
              <div className="flex flex-col gap-2">
                {suggestPrompts.data.map((suggestion, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPrompt(suggestion)}
                    disabled={isCreating}
                    className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-3 text-left text-sm text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-text)]"
                  >
                    {suggestion}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => suggestPrompts.mutate(theme.trim())}
                  disabled={suggestPrompts.isPending || isCreating}
                  className="self-end text-xs text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
                >
                  {suggestPrompts.isPending
                    ? "Thinking..."
                    : "Try different suggestions"}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="prompt" className="text-sm text-[var(--t-muted)]">
              Deal Prompt
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={4}
              disabled={isCreating}
              placeholder="Write a scenario for traders to enter..."
              className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="potAmount"
              className="text-sm text-[var(--t-muted)]"
            >
              Pot Amount (USDC)
            </label>
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
              className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
            />
            {potNum > 0 && (
              <p className="text-xs text-[var(--t-muted)]">
                {DEAL_CREATION_FEE_PERCENTAGE}% fee deducted. Net pot:{" "}
                {netPot.toFixed(2)} USDC
              </p>
            )}
            {balance !== undefined && (
              <p className="text-xs text-[var(--t-muted)]">
                Wallet balance: {balance.toFixed(2)} USDC
              </p>
            )}
            {insufficientBalance && walletAddress && (
              <div className="border border-[var(--t-amber)]/50 bg-[var(--t-amber)]/5 p-3 text-sm">
                <p className="font-medium text-[var(--t-amber)]">
                  Insufficient USDC balance
                </p>
                <p className="mt-1 text-[var(--t-muted)]">
                  You need {potNum.toFixed(2)} USDC but only have{" "}
                  {balance!.toFixed(2)} USDC.
                </p>
                <p className="mt-1 text-[var(--t-muted)]">
                  Send USDC on {PAYMENT_CHAIN_NAME} to:{" "}
                  <button
                    type="button"
                    className="break-all font-mono text-[var(--t-text)] underline decoration-[var(--t-border)] hover:text-[var(--t-accent)]"
                    onClick={() => navigator.clipboard.writeText(walletAddress)}
                    title="Copy address"
                  >
                    {walletAddress}
                  </button>
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="entryCost"
              className="text-sm text-[var(--t-muted)]"
            >
              Entry Cost (USDC)
            </label>
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
              className="border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none"
            />
          </div>

          {isWrongNetwork && (
            <p className="text-sm text-[var(--t-amber)]">
              Switch your wallet to {PAYMENT_CHAIN_NAME} using the banner above
              to create a deal.
            </p>
          )}

          {createError && (
            <div className="border border-[var(--t-red)]/50 bg-[var(--t-red)]/5 p-3">
              <p className="text-sm text-[var(--t-red)]">{createError}</p>
              <button
                type="button"
                onClick={resetCreateDeal}
                className="mt-2 text-xs text-[var(--t-muted)] underline hover:text-[var(--t-text)]"
              >
                Try again
              </button>
            </div>
          )}

          {isCreating && (
            <div className="border border-[var(--t-green)]/50 bg-[var(--t-green)]/5 p-3">
              <p className="text-sm text-[var(--t-green)]">
                {STEP_LABELS[step] ?? "Processing..."}
              </p>
              <div className="mt-2 h-1 overflow-hidden bg-[var(--t-border)]">
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

          <button
            type="submit"
            disabled={
              isWrongNetwork ||
              insufficientBalance ||
              balanceLoading ||
              isCreating
            }
            className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-8 py-3 font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50"
          >
            {isCreating ? "Creating Deal..." : "Create Deal"}
          </button>
        </form>
      </div>
    </div>
  );
}
