"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { parseUnits } from "viem";
import { useTrader, useTraderHistory } from "@/hooks/use-traders";
import type { TraderHistoryEvent } from "@/hooks/use-traders";
import {
  useSepoliaUsdcBalance,
  useDepositFlow,
  useWithdrawFlow,
} from "@/hooks/use-escrow";
import {
  ESCROW_ADDRESS,
  escrowAbi,
  CONTRACTS_CHAIN_ID,
} from "@/lib/contracts/escrow";

export default function TraderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: trader, isLoading, error } = useTrader(id);

  const { data: escrowBalance, refetch: refetchBalance } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getBalance",
    args: trader ? [BigInt(trader.token_id)] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: {
      enabled: !!trader,
      refetchInterval: 15_000,
    },
  });

  const { balance: walletUsdc } = useSepoliaUsdcBalance();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (error || !trader) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="text-red-400">{error?.message ?? "Trader not found"}</p>
        <Link
          href="/traders"
          className="text-sm text-zinc-400 hover:text-zinc-300"
        >
          Back to traders
        </Link>
      </div>
    );
  }

  const balanceUsdc =
    escrowBalance !== undefined ? Number(escrowBalance) / 1_000_000 : null;

  return (
    <div className="flex min-h-screen flex-col items-center bg-black px-4 py-12">
      <div className="w-full max-w-2xl">
        <Link
          href="/traders"
          className="mb-6 inline-block text-sm text-zinc-400 transition-colors hover:text-zinc-300"
        >
          &larr; All Traders
        </Link>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-zinc-50">
              {trader.name}
            </h1>
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

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Token ID</p>
              <p className="text-zinc-50">#{trader.token_id}</p>
            </div>
            <div>
              <p className="text-zinc-500">Escrow Balance</p>
              <p className="text-zinc-50">
                {balanceUsdc !== null ? `${balanceUsdc} USDC` : "..."}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-zinc-500">Trader Wallet</p>
              <p className="font-mono text-xs text-zinc-50">
                {trader.tba_address ?? "Not derived"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-zinc-500">Owner</p>
              <p className="font-mono text-xs text-zinc-50">
                {trader.owner_address}
              </p>
            </div>
          </div>
        </div>

        <FundingSection
          traderId={trader.token_id}
          walletUsdc={walletUsdc}
          onSuccess={() => {
            refetchBalance();
            fetch(`/api/trader/${id}/balance`, { method: "POST" });
          }}
        />

        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Mandate</h2>
          {Object.keys(trader.mandate).length === 0 ? (
            <p className="text-sm text-zinc-500">
              No mandate configured yet. Configure risk tolerance and deal
              filters to control how this trader enters deals.
            </p>
          ) : (
            <pre className="text-xs text-zinc-300">
              {JSON.stringify(trader.mandate, null, 2)}
            </pre>
          )}
        </div>

        <ActivityHistory id={id} />
      </div>
    </div>
  );
}

function formatEvent(event: TraderHistoryEvent) {
  switch (event.type) {
    case "deposit":
      return {
        label: "Deposit",
        detail: `+${event.amount} USDC`,
        color: "text-green-400",
      };
    case "withdrawal":
      return {
        label: "Withdrawal",
        detail: `-${event.amount} USDC`,
        color: "text-red-400",
      };
    case "enter":
      return {
        label: "Entered Deal",
        detail: `Deal #${event.dealId}`,
        color: "text-zinc-300",
      };
    case "resolve": {
      const pnl = event.pnl ?? 0;
      const net = pnl > 0 ? pnl - (event.rake ?? 0) : pnl;
      const sign = net >= 0 ? "+" : "";
      return {
        label: pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Break-even",
        detail: `${sign}${net.toFixed(6)} USDC (Deal #${event.dealId})`,
        color:
          pnl > 0
            ? "text-green-400"
            : pnl < 0
              ? "text-red-400"
              : "text-zinc-300",
      };
    }
  }
}

function ActivityHistory({ id }: { id: string }) {
  const { data: events, isLoading } = useTraderHistory(id);

  return (
    <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="mb-3 text-sm font-medium text-zinc-400">
        Activity History
      </h2>
      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-zinc-500">No on-chain activity yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event, i) => {
            const { label, detail, color } = formatEvent(event);
            return (
              <div
                key={`${event.txHash}-${i}`}
                className="flex items-center justify-between rounded border border-zinc-700/50 bg-zinc-800/50 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-zinc-400 w-24">
                    {label}
                  </span>
                  <span className={`text-sm ${color}`}>{detail}</span>
                </div>
                <a
                  href={`https://sepolia.basescan.org/tx/${event.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  tx
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FundingSection({
  traderId,
  walletUsdc,
  onSuccess,
}: {
  traderId: number;
  walletUsdc: number | undefined;
  onSuccess: () => void;
}) {
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const {
    deposit,
    reset: resetDeposit,
    step: depositStep,
    error: depositError,
    isLoading: isDepositBusy,
  } = useDepositFlow();
  const {
    withdraw,
    reset: resetWithdraw,
    busy: withdrawBusy,
    done: withdrawDone,
    error: withdrawError,
  } = useWithdrawFlow();

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseUnits(depositAmount, 6);
    if (parsed === BigInt(0)) return;

    try {
      await deposit(BigInt(traderId), parsed);
      setDepositAmount("");
      onSuccess();
    } catch {
      // error surfaced via hook state
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseUnits(withdrawAmount, 6);
    if (parsed === BigInt(0)) return;

    try {
      await withdraw(BigInt(traderId), parsed);
      setWithdrawAmount("");
      onSuccess();
    } catch {
      // error surfaced via hook state
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="mb-1 text-sm font-medium text-zinc-400">Fund Trader</h2>
      {walletUsdc !== undefined && (
        <p className="mb-4 text-xs text-zinc-500">
          Wallet balance: {walletUsdc} USDC (Base Sepolia)
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Deposit */}
        <form onSubmit={handleDeposit} className="flex flex-col gap-3">
          <label htmlFor="depositAmount" className="text-sm text-zinc-300">
            Deposit USDC
          </label>
          <input
            id="depositAmount"
            type="number"
            step="0.01"
            min="0"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="0.00"
            disabled={isDepositBusy}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isDepositBusy || !depositAmount}
            className="rounded bg-green-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-green-400 disabled:opacity-50"
          >
            {depositStep === "approving"
              ? "Approving USDC..."
              : depositStep === "depositing"
                ? "Depositing..."
                : "Deposit"}
          </button>
          {depositStep === "done" && (
            <p className="text-xs text-green-400">Deposit confirmed.</p>
          )}
          {depositError && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-red-400">
                {depositError.slice(0, 120)}
              </p>
              <button
                type="button"
                onClick={resetDeposit}
                className="text-xs text-zinc-400 underline hover:text-zinc-300"
              >
                Retry
              </button>
            </div>
          )}
        </form>

        {/* Withdraw */}
        <form onSubmit={handleWithdraw} className="flex flex-col gap-3">
          <label htmlFor="withdrawAmount" className="text-sm text-zinc-300">
            Withdraw USDC
          </label>
          <input
            id="withdrawAmount"
            type="number"
            step="0.01"
            min="0"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="0.00"
            disabled={withdrawBusy}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={withdrawBusy || !withdrawAmount}
            className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600 disabled:opacity-50"
          >
            {withdrawBusy ? "Withdrawing..." : "Withdraw"}
          </button>
          {withdrawDone && (
            <p className="text-xs text-green-400">Withdrawal confirmed.</p>
          )}
          {withdrawError && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-red-400">
                {withdrawError.slice(0, 120)}
              </p>
              <button
                type="button"
                onClick={resetWithdraw}
                className="text-xs text-zinc-400 underline hover:text-zinc-300"
              >
                Retry
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
