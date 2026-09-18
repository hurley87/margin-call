import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";

export default function Home() {
  const hasDynamic = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);

  return (
    <main className="min-h-screen bg-[var(--t-bg)] text-[var(--t-text)]">
      {hasDynamic ? (
        <WalletConnectControl />
      ) : (
        <div className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-16 font-mono">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
            Margin Call
          </p>
          <h1 className="font-[family-name:var(--font-plex-sans)] text-3xl font-black uppercase tracking-tight text-[var(--t-accent)]">
            Base workspace
          </h1>
          <p className="text-sm leading-6 text-[var(--t-muted)]">
            Set{" "}
            <code className="text-[var(--t-text)]">
              NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID
            </code>{" "}
            to enable wallet connect and the Position lifecycle against Base.
          </p>
        </div>
      )}
    </main>
  );
}
