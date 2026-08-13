import { AuthGate } from "@/components/auth/auth-gate";
import { LpDesk } from "@/components/lp-desk/lp-desk";
import { RoutePageIntro } from "@/components/route-page-intro";

/**
 * Liquidity desk — vault metrics, deposit, and withdraw. Sign-in required for
 * share operations; unsigned visitors see the auth prompt in the shell.
 */
export default function LpPage() {
  return (
    <section aria-labelledby="lp-heading" className="mx-auto max-w-3xl">
      <RoutePageIntro
        eyebrow="Base Sepolia · Liquidity"
        title="LP Desk"
        titleId="lp-heading"
      >
        Provide Desk Dollars (USDC) to receive vault shares. Sign in to deposit
        or withdraw.
      </RoutePageIntro>
      <AuthGate>
        <LpDesk />
      </AuthGate>
    </section>
  );
}
