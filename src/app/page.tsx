import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--t-bg)] text-[var(--t-text)]">
      <WalletConnectControl />
    </main>
  );
}
