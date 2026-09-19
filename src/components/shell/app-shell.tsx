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

/** The one product shell: light theme and shared header on every route. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="playful-theme">
      <header className="playful-header">
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
      <main className="playful-main">{children}</main>
    </div>
  );
}
