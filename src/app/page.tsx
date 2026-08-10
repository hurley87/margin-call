import { AuthGate } from "@/components/auth/auth-gate";
import { DeskDollarsPanel } from "@/components/desk-dollars/desk-dollars-panel";
import { LpDesk } from "@/components/lp-desk/lp-desk";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--t-bg)] px-6 font-mono text-[var(--t-text)]">
      <div className="max-w-xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
          Margin Call
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-plex-sans)] text-5xl font-black uppercase tracking-tight text-[var(--t-accent)] sm:text-7xl">
          Rebuilding
        </h1>
        <p className="mt-5 text-sm leading-6 text-[var(--t-muted)]">
          The next version is under construction.
        </p>
        <AuthGate>
          <DeskDollarsPanel />
          <LpDesk />
        </AuthGate>
      </div>
    </main>
  );
}
