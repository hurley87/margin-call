"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "My Positions" },
  { href: "/positions", label: "All Positions" },
  { href: "/create", label: "Open Position" },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Persistent product chrome: brand, nav, wallet, and page content. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--t-bg)] font-mono text-[var(--t-text)]">
      <header className="border-b border-[var(--t-border)]">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Link href="/" className="block space-y-1">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
                Margin Call
              </p>
              <p className="font-[family-name:var(--font-plex-sans)] text-lg font-black uppercase tracking-tight text-[var(--t-accent)]">
                Positions
              </p>
            </Link>
            <nav
              aria-label="Primary"
              className="flex flex-wrap items-center gap-1"
            >
              {NAV_ITEMS.map((item) => {
                const isActive = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors",
                      isActive
                        ? "border border-[var(--t-accent)] text-[var(--t-accent)]"
                        : "border border-transparent text-[var(--t-muted)] hover:text-[var(--t-text)]"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="shrink-0 sm:max-w-xs sm:pt-1">
            <WalletConnectControl />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
