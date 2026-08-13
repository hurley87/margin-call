"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthControls } from "@/components/auth/auth-controls";
import { DeskDollarsFaucetProvider } from "@/components/desk-dollars/desk-dollars-faucet";
import { NoRealValueDisclosure } from "@/components/no-real-value-disclosure";

const NAV = [
  { href: "/", label: "Floor" },
  { href: "/record", label: "Record" },
  { href: "/history", label: "Rounds" },
  { href: "/lp", label: "LP" },
] as const;

/**
 * Shared chrome: brand, Floor / Record / Rounds / LP nav, compact auth,
 * disclosure. Leaves page content as the primary workspace.
 */
export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  return (
    <DeskDollarsFaucetProvider>
      <div className="min-h-screen bg-[var(--t-bg)] font-mono text-[var(--t-text)]">
        <header className="border-b border-[var(--t-border)] bg-[var(--t-panel-strong)]">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 flex-wrap items-center gap-4 sm:gap-6">
              <Link
                className="font-[family-name:var(--font-plex-sans)] text-xl font-black uppercase tracking-tight text-[var(--t-accent)] sm:text-2xl"
                href="/"
              >
                Margin Call
              </Link>
              <nav
                aria-label="Primary"
                className="flex items-center gap-1"
                data-testid="app-shell-nav"
              >
                {NAV.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={`px-2.5 py-1 text-xs font-bold uppercase tracking-[0.16em] transition-colors duration-[var(--mc-dur-fast)] sm:px-3 ${
                        isActive
                          ? "border-b-2 border-[var(--t-accent)] text-[var(--t-accent)]"
                          : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
                      }`}
                      href={item.href}
                      key={item.href}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <AuthControls />
          </div>
          <div className="mx-auto w-full max-w-7xl px-4 pb-2 sm:px-6">
            <NoRealValueDisclosure />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 text-left sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </DeskDollarsFaucetProvider>
  );
}
