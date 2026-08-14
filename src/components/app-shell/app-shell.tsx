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
 * disclosure. Floor (`/`) is a locked viewport with an in-flow translucent
 * header so the immersive stage fills the leftover height; other routes keep
 * the document layout.
 */
export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isFloor = pathname === "/";

  return (
    <DeskDollarsFaucetProvider>
      <div
        className={`bg-[var(--t-bg)] font-mono text-[var(--t-text)] ${
          isFloor ? "flex h-svh flex-col overflow-hidden" : "min-h-screen"
        }`}
        data-floor={isFloor ? "true" : undefined}
      >
        <header
          className={
            isFloor
              ? "relative z-40 shrink-0 border-b border-[var(--t-border)]/60 bg-[var(--t-bg)]/70 pt-[env(safe-area-inset-top)] backdrop-blur-md"
              : "border-b border-[var(--t-border)] bg-[var(--t-panel-strong)] pt-[env(safe-area-inset-top)]"
          }
        >
          <div
            className={`mx-auto flex w-full flex-nowrap items-center justify-between gap-x-3 px-3 py-2 sm:gap-x-4 sm:px-6 sm:py-3 ${
              isFloor ? "" : "max-w-7xl"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-6">
              <Link
                className="shrink-0 font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-tight text-[var(--t-accent)] sm:text-2xl"
                href="/"
              >
                Margin Call
              </Link>
              <nav
                aria-label="Primary"
                className="-mx-1 flex min-w-0 items-center gap-0.5 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                      className={`inline-flex min-h-11 shrink-0 items-center px-2.5 py-1 text-xs font-bold uppercase tracking-[0.16em] transition-colors duration-[var(--mc-dur-fast)] sm:px-3 ${
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
          <div
            className={`mx-auto w-full px-3 pb-1.5 sm:px-6 sm:pb-2 ${
              isFloor ? "" : "max-w-7xl"
            }`}
          >
            <NoRealValueDisclosure />
          </div>
        </header>
        <main
          className={
            isFloor
              ? "relative min-h-0 flex-1 text-left"
              : "mx-auto w-full max-w-7xl px-4 py-6 text-left sm:px-6 sm:py-8"
          }
          data-testid={isFloor ? "app-shell-floor-main" : undefined}
        >
          {children}
        </main>
      </div>
    </DeskDollarsFaucetProvider>
  );
}
