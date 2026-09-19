"use client";

import Link from "next/link";
import { DrawablyUnderline } from "drawably/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PlayfulIcon } from "@/components/ui/playful-icon";
import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { PRODUCT_DOCS_URL } from "@/lib/product-docs";

const NAV_ITEMS = [
  { href: "/", label: "Portfolio" },
  { href: "/positions", label: "Explore" },
  { href: "/create", label: "Create" },
] as const;

/** Shared light header; the portfolio and create page share the light content theme. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isCreate = pathname === "/create";

  return (
    <div
      className={
        isHome || isCreate
          ? `${isHome ? "portfolio-home" : "create-home"} playful-theme`
          : "min-h-screen bg-[var(--t-bg)] font-mono text-[var(--t-text)]"
      }
    >
      <header className="playful-header playful-theme">
        <div className="playful-header-inner">
          <Link
            href="/"
            className="playful-brand"
            aria-label="Margin Call home"
          >
            <PlayfulIcon kind="paw" />
            <span>margin call</span>
          </Link>
          <nav aria-label="Primary" className="playful-nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                {pathname === item.href ? (
                  <DrawablyUnderline seed={12} roughness={0.7} boil={0}>
                    {item.label}
                  </DrawablyUnderline>
                ) : (
                  item.label
                )}
              </Link>
            ))}
            <a href={PRODUCT_DOCS_URL}>Docs</a>
          </nav>
          <div className="playful-wallet">
            <WalletConnectControl />
          </div>
        </div>
      </header>
      <main
        className={
          isHome
            ? "portfolio-main"
            : isCreate
              ? "create-main"
              : "mx-auto w-full max-w-3xl px-6 py-8"
        }
      >
        {children}
      </main>
    </div>
  );
}
