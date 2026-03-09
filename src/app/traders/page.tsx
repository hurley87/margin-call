"use client";

import { useState } from "react";
import Link from "next/link";
import { useTraders } from "@/hooks/use-traders";
import { useCreateTrader } from "@/hooks/use-create-trader";

export default function TradersPage() {
  const { data: traders, isLoading, error } = useTraders();
  const {
    createTrader,
    step,
    error: createError,
    isLoading: isCreating,
  } = useCreateTrader();
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createTrader(name.trim());
      setName("");
      setShowForm(false);
    } catch {
      // error is surfaced via hook state
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-black px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-50">My Traders</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/approvals"
              className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500"
            >
              Approvals
            </Link>
            <button
              onClick={() => setShowForm(!showForm)}
              className="rounded-full bg-green-500 px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-green-400"
            >
              {showForm ? "Cancel" : "Create Trader"}
            </button>
          </div>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5"
          >
            <label className="mb-2 block text-sm text-zinc-400">
              Trader Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gordon Gecko Jr."
              maxLength={50}
              className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isCreating || !name.trim()}
              className="rounded-full bg-green-500 px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-green-400 disabled:opacity-50"
            >
              {step === "minting"
                ? "Sign in Wallet..."
                : step === "syncing"
                  ? "Saving..."
                  : "Mint Trader"}
            </button>
            {createError && (
              <p className="mt-3 text-sm text-red-400">{createError}</p>
            )}
          </form>
        )}

        {isLoading ? (
          <p className="text-zinc-400">Loading traders...</p>
        ) : error ? (
          <p className="text-red-400">Failed to load traders.</p>
        ) : !traders || traders.length === 0 ? (
          <p className="text-zinc-400">
            No traders yet. Mint your first trader NFT to get started.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {traders.map((trader) => (
              <Link
                key={trader.id}
                href={`/traders/${trader.id}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-lg font-medium text-zinc-50">
                    {trader.name}
                  </p>
                  <span
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      trader.status === "active"
                        ? "bg-green-500/10 text-green-400"
                        : trader.status === "paused"
                          ? "bg-yellow-500/10 text-yellow-400"
                          : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {trader.status}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-sm text-zinc-400">
                  <span>Token ID: #{trader.token_id}</span>
                  {trader.tba_address && (
                    <span className="font-mono text-xs">
                      Wallet: {trader.tba_address.slice(0, 6)}...
                      {trader.tba_address.slice(-4)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
