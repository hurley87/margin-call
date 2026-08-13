import { AuthGate } from "@/components/auth/auth-gate";
import { CurrentRound } from "@/components/current-round/current-round";
import { CrashTicketRefund } from "@/components/current-round/crash-ticket-refund";
import { CrashTicketSettlement } from "@/components/current-round/crash-ticket-settlement";
import { RoundTheater } from "@/components/round-theater/round-theater";

/**
 * Chart-first play floor on desktop; entry rail first on small screens so
 * Enter round is in the first viewport. Record / history / LP live on tabs.
 */
export default function Home() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,1fr)] lg:items-start">
      <div className="order-2 min-w-0 lg:order-1">
        <RoundTheater />
      </div>
      <div className="order-1 space-y-6 lg:order-2">
        <CurrentRound />
        <AuthGate>
          <CrashTicketSettlement />
          <CrashTicketRefund />
        </AuthGate>
      </div>
    </div>
  );
}
