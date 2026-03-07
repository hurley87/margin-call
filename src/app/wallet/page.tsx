"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { useSendUsdc } from "@/hooks/use-send-usdc";

export default function WalletPage() {
  const { ready, authenticated, login } = usePrivy();
  const {
    balance,
    isLoading: balanceLoading,
    walletAddress,
    refetch,
  } = useUsdcBalance();
  const { send, isPending, isSuccess, error, txHash } = useSendUsdc();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isSuccess) {
      refetch();
    }
  }, [isSuccess, refetch]);

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
        <h1 className="text-2xl font-semibold text-zinc-50">Wallet</h1>
        <p className="text-zinc-400">Connect your wallet to manage funds.</p>
        <button
          onClick={login}
          className="rounded-full bg-green-500 px-8 py-3 font-medium text-black transition-colors hover:bg-green-400"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(recipient);
  const amountNum = parseFloat(amount);
  const hasValidAmount = !isNaN(amountNum) && amountNum > 0;
  const exceedsBalance =
    balance !== undefined && hasValidAmount && amountNum > balance;
  const canWithdraw =
    isValidAddress && hasValidAmount && !exceedsBalance && !isPending;

  function handleCopy() {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleMax() {
    if (balance !== undefined) {
      setAmount(balance.toString());
    }
  }

  function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!canWithdraw) return;
    send({ to: recipient, amount: amountNum });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <h1 className="text-2xl font-semibold text-zinc-50">Wallet</h1>

        {/* Balance */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">USDC Balance</p>
          <p className="mt-1 text-3xl font-semibold text-zinc-50">
            {balanceLoading
              ? "..."
              : balance !== undefined
                ? `${balance.toFixed(2)} USDC`
                : "--"}
          </p>
        </div>

        {/* Fund */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-medium text-zinc-50">Fund Wallet</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Send USDC on Base to the address below.
          </p>
          {walletAddress && (
            <>
              <button
                type="button"
                onClick={handleCopy}
                className="mt-3 w-full break-all rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-left font-mono text-sm text-zinc-300 transition-colors hover:border-green-500 hover:text-zinc-50"
              >
                {walletAddress}
              </button>
              <p className="mt-1 text-xs text-zinc-500">
                {copied ? "Copied!" : "Click to copy"}
              </p>
            </>
          )}
        </div>

        {/* Withdraw */}
        <form
          onSubmit={handleWithdraw}
          className="rounded-lg border border-zinc-800 bg-zinc-900 p-6"
        >
          <h2 className="text-lg font-medium text-zinc-50">Withdraw USDC</h2>
          <p className="mt-2 text-sm text-zinc-400">
            You can transfer your USDC out at any time.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="recipient" className="text-sm text-zinc-400">
                Recipient Address
              </label>
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
                className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none"
              />
              {recipient && !isValidAddress && (
                <p className="text-xs text-red-400">
                  Enter a valid Ethereum address (0x...)
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="amount" className="text-sm text-zinc-400">
                Amount (USDC)
              </label>
              <div className="flex gap-2">
                <input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleMax}
                  className="rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-green-500 hover:text-green-400"
                >
                  Max
                </button>
              </div>
              {exceedsBalance && (
                <p className="text-xs text-red-400">
                  Amount exceeds your balance ({balance!.toFixed(2)} USDC)
                </p>
              )}
            </div>
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-400">{error.message}</p>
          )}

          {isSuccess && txHash && (
            <div className="mt-3 rounded border border-green-500/50 bg-green-500/10 p-3">
              <p className="text-sm text-green-400">Withdrawal submitted!</p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-400">
                Tx: {txHash}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canWithdraw}
            className="mt-4 w-full rounded-full bg-green-500 px-8 py-3 font-medium text-black transition-colors hover:bg-green-400 disabled:opacity-50"
          >
            {isPending ? "Withdrawing..." : "Withdraw"}
          </button>
        </form>
      </div>
    </div>
  );
}
