"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEAL_CREATION_FEE_PERCENTAGE,
  MIN_POT_AMOUNT,
  MIN_ENTRY_COST,
} from "@/lib/constants";
import { useCreateDeal } from "@/hooks/use-deals";

export default function CreateDealPage() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();
  const createDeal = useCreateDeal();

  const [prompt, setPrompt] = useState("");
  const [potAmount, setPotAmount] = useState("");
  const [entryCost, setEntryCost] = useState("");

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

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

        <button
          type="submit"
          disabled={createDeal.isPending}
          className="rounded-full bg-green-500 px-8 py-3 font-medium text-black transition-colors hover:bg-green-400 disabled:opacity-50"
        >
          {createDeal.isPending ? "Creating..." : "Create Deal"}
        </button>
      </form>
    </div>
  );
}
