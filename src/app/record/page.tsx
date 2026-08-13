import { AuthGate } from "@/components/auth/auth-gate";
import { PersonalHistory } from "@/components/history/personal-history";
import { RoutePageIntro } from "@/components/route-page-intro";

/**
 * Wallet-scoped ticket record — lookback tickets with receipt-backed
 * claim and refund actions.
 */
export default function RecordPage() {
  return (
    <section aria-labelledby="record-heading">
      <RoutePageIntro
        eyebrow="Base Sepolia · Your tickets"
        title="Record"
        titleId="record-heading"
      >
        Every ticket in the lookback window. Claim and refund actions wait for
        Base Sepolia receipts — a transaction hash alone never changes
        settlement state.
      </RoutePageIntro>
      <div className="mt-8">
        <AuthGate>
          <PersonalHistory />
        </AuthGate>
      </div>
    </section>
  );
}
