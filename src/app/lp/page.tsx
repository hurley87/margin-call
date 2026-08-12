import { AuthGate } from "@/components/auth/auth-gate";
import { LpDesk } from "@/components/lp-desk/lp-desk";

/**
 * Liquidity desk — vault metrics, deposit, and withdraw. Sign-in required for
 * share operations; unsigned visitors see the auth prompt in the shell.
 */
export default function LpPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]">
        Base Sepolia · Liquidity
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-plex-sans)] text-3xl font-bold uppercase tracking-tight text-[var(--t-text)] sm:text-4xl">
        LP Desk
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--t-muted)]">
        Provide Desk Dollars (tUSD) to receive vault shares. Sign in to deposit
        or withdraw.
      </p>
      <AuthGate>
        <LpDesk />
      </AuthGate>
    </div>
  );
}
