"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { useDeskManager } from "@/hooks/use-desk";
import { useUpdateSettings } from "@/hooks/use-settings";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";

export default function SettingsPage() {
  const { ready, authenticated, login } = usePrivy();
  const { data: deskManager, isLoading } = useDeskManager();
  const updateSettings = useUpdateSettings();
  const { balance } = useUsdcBalance();

  const [displayName, setDisplayName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (deskManager?.display_name) {
      setDisplayName(deskManager.display_name);
    }
  }, [deskManager?.display_name]);

  if (!ready || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black">
        <h1 className="text-2xl font-semibold text-zinc-50">Settings</h1>
        <p className="text-zinc-400">Connect your wallet to manage settings.</p>
        <button
          onClick={login}
          className="rounded-full bg-green-500 px-8 py-3 font-medium text-black transition-colors hover:bg-green-400"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    await updateSettings.mutateAsync({ display_name: displayName });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <form
        onSubmit={handleSave}
        className="flex w-full max-w-lg flex-col gap-6 rounded-lg border border-zinc-800 bg-zinc-900 p-8"
      >
        <h1 className="text-2xl font-semibold text-zinc-50">Settings</h1>

        <div className="flex flex-col gap-2">
          <label htmlFor="displayName" className="text-sm text-zinc-400">
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder="Your display name"
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 focus:border-green-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-zinc-400">Wallet</label>
          <p className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-500">
            {deskManager?.wallet_address ?? "..."}
          </p>
        </div>

        {updateSettings.error && (
          <p className="text-sm text-red-400">{updateSettings.error.message}</p>
        )}

        {saved && <p className="text-sm text-green-400">Settings saved.</p>}

        <button
          type="submit"
          disabled={updateSettings.isPending}
          className="rounded-full bg-green-500 px-8 py-3 font-medium text-black transition-colors hover:bg-green-400 disabled:opacity-50"
        >
          {updateSettings.isPending ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
