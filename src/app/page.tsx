import { AuthGate } from "@/components/auth/auth-gate";
import { CurrentRound } from "@/components/current-round/current-round";
import { CrashTicketRefund } from "@/components/current-round/crash-ticket-refund";
import { CrashTicketSettlement } from "@/components/current-round/crash-ticket-settlement";
import { DeskDollarsPanel } from "@/components/desk-dollars/desk-dollars-panel";
import { RoundTheater } from "@/components/round-theater/round-theater";

/**
 * Chart-first play floor: hero replay + entry rail and player actions.
 * Record lives on /record; recent rounds on /history; LP Desk on /lp.
 */
export default function Home() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,1fr)] lg:items-start">
      <RoundTheater />
      <div className="space-y-6">
        <CurrentRound />
        <AuthGate>
          <CrashTicketSettlement />
          <CrashTicketRefund />
          <DeskDollarsPanel />
        </AuthGate>
      </div>
    </div>
  );
}
