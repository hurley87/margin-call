"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useDeskManager } from "@/hooks/use-desk";

export default function Home() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { data: deskManager, isLoading } = useDeskManager();

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
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Margin Call
        </h1>
        <p className="text-zinc-400">Wall Street Agent Trading Game</p>
        <button
          onClick={login}
          className="rounded-full bg-green-500 px-8 py-3 font-medium text-black transition-colors hover:bg-green-400"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
        Margin Call
      </h1>
      {isLoading ? (
        <p className="text-zinc-400">Registering...</p>
      ) : deskManager ? (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Desk Manager</p>
          <p className="font-mono text-lg text-zinc-50">
            {deskManager.display_name}
          </p>
          <p className="text-sm text-zinc-500">{deskManager.wallet_address}</p>
        </div>
      ) : (
        <p className="text-zinc-400">
          {user?.wallet ? "Setting up your desk..." : "No wallet connected"}
        </p>
      )}
      <button
        onClick={logout}
        className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        Disconnect
      </button>
    </div>
  );
}
