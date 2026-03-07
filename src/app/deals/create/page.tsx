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
import { useCreateDeal, useSuggestPrompts } from "@/hooks/use-deals";

export default function CreateDealPage() {
  const { ready, authenticated, login } = usePrivy();
  const { isWrongNetwork } = useBaseNetwork();
  const router = useRouter();
  const createDeal = useCreateDeal();
  const suggestPrompts = useSuggestPrompts();

  const [prompt, setPrompt] = useState("");
  const [potAmount, setPotAmount] = useState("");
  const [entryCost, setEntryCost] = useState("");
  const [theme, setTheme] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black">
        <h1 className="text-2xl font-semibold text-zinc-50">Create a Deal</h1>
        <p className="text-zinc-400">Connect your wallet to create deals.</p>
        <button
          onClick={login}
          className="rounded-full bg-green-500 px-8 py-3 font-medium text-black transition-colors hover:bg-green-400"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  const potNum = parseFloat(potAmount);
  const netPot =
    potNum > 0 ? potNum * (1 - DEAL_CREATION_FEE_PERCENTAGE / 100) : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowConfirmation(true);
  }

  async function handleConfirmPayment() {
    const deal = await createDeal.mutateAsync({
      prompt,
      pot_amount: parseFloat(potAmount),
      entry_cost: parseFloat(entryCost),
    });

    router.push(`/deals/${deal.id}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-lg flex-col gap-6 rounded-lg border border-zinc-800 bg-zinc-900 p-8"
      >
        <h1 className="text-2xl font-semibold text-zinc-50">Create a Deal</h1>

        <div className="flex flex-col gap-2">
          <label htmlFor="theme" className="text-sm text-zinc-400">
            AI Prompt Suggestions
          </label>
          <div className="flex gap-2">
            <input
              id="theme"
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. insider trading, hostile takeover"
              className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none"
            />
            <button
              type="button"
              disabled={suggestPrompts.isPending || theme.trim().length === 0}
              onClick={() => suggestPrompts.mutate(theme.trim())}
              className="whitespace-nowrap rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-600 disabled:opacity-50"
            >
              {suggestPrompts.isPending ? "Thinking..." : "Suggest Prompts"}
            </button>
          </div>
          {suggestPrompts.error && (
            <p className="text-sm text-red-400">
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
                  className="rounded border border-zinc-700 bg-zinc-800 px-3 py-3 text-left text-sm text-zinc-300 transition-colors hover:border-green-500 hover:text-zinc-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="prompt" className="text-sm text-zinc-400">
            Deal Prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
            rows={4}
            placeholder="Write a scenario for traders to enter..."
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="potAmount" className="text-sm text-zinc-400">
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
            placeholder={MIN_POT_AMOUNT.toString()}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none"
          />
          {potNum > 0 && (
            <p className="text-xs text-zinc-500">
              {DEAL_CREATION_FEE_PERCENTAGE}% fee deducted. Net pot:{" "}
              {netPot.toFixed(2)} USDC
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="entryCost" className="text-sm text-zinc-400">
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
            placeholder={MIN_ENTRY_COST.toString()}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none"
          />
        </div>

        {createDeal.error && (
          <p className="text-sm text-red-400">{createDeal.error.message}</p>
        )}

        {isWrongNetwork && (
          <p className="text-sm text-amber-400">
            Switch your wallet to Base using the banner above to create a deal.
          </p>
        )}

        <button
          type="submit"
          disabled={createDeal.isPending || showConfirmation || isWrongNetwork}
          className="rounded-full bg-green-500 px-8 py-3 font-medium text-black transition-colors hover:bg-green-400 disabled:opacity-50"
        >
          {createDeal.isPending ? "Creating..." : "Create Deal"}
        </button>
      </form>

      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-700 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold text-zinc-50">
              Confirm Payment
            </h2>
            <p className="text-sm text-zinc-400">
              Creating this deal requires a USDC payment via x402.
            </p>
            <div className="flex flex-col gap-1 rounded border border-zinc-700 bg-zinc-800 p-3 text-sm">
              <div className="flex justify-between text-zinc-300">
                <span>Pot amount</span>
                <span>{parseFloat(potAmount).toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Platform fee ({DEAL_CREATION_FEE_PERCENTAGE}%)</span>
                <span>
                  {(
                    parseFloat(potAmount) *
                    (DEAL_CREATION_FEE_PERCENTAGE / 100)
                  ).toFixed(2)}{" "}
                  USDC
                </span>
              </div>
              <hr className="border-zinc-700" />
              <div className="flex justify-between font-medium text-zinc-50">
                <span>Net pot</span>
                <span>{netPot.toFixed(2)} USDC</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmation(false)}
                disabled={createDeal.isPending}
                className="flex-1 rounded-full border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={createDeal.isPending || isWrongNetwork}
                className="flex-1 rounded-full bg-green-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-green-400 disabled:opacity-50"
              >
                {createDeal.isPending ? "Processing..." : "Pay & Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
