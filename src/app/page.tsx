import { AuthGate } from "@/components/auth/auth-gate";
import { CurrentRound } from "@/components/current-round/current-round";
import { CrashTicketRefund } from "@/components/current-round/crash-ticket-refund";
import { CrashTicketSettlement } from "@/components/current-round/crash-ticket-settlement";
import { DeskDollarsPanel } from "@/components/desk-dollars/desk-dollars-panel";
import { GlobalHistory } from "@/components/history/global-history";
import { PersonalHistory } from "@/components/history/personal-history";
import { LpDesk } from "@/components/lp-desk/lp-desk";
import { RoundTheater } from "@/components/round-theater/round-theater";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--t-bg)] px-4 py-10 font-mono text-[var(--t-text)] sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-5xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
          Shared-round Crash · Base Sepolia
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-plex-sans)] text-5xl font-black uppercase tracking-tight text-[var(--t-accent)] sm:text-7xl">
          Margin Call
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-[var(--t-muted)]">
          Watch each encrypted crash point commit onchain before entry closes.
        </p>

        <RoundTheater />
        <CurrentRound />
        <GlobalHistory />

        <div className="mx-auto max-w-xl">
          <AuthGate>
            <CrashTicketSettlement />
            <CrashTicketRefund />
            <PersonalHistory />
            <DeskDollarsPanel />
            <LpDesk />
          </AuthGate>
        </div>
      </div>
    </main>
  );
}
