"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Github, Twitter } from "@/components/icons/social-icons";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [{ href: "/", label: "DESK" }];

interface NavProps {
  containerClassName?: string;
}

function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function ExternalNavLink({
  href,
  "aria-label": ariaLabel,
  children,
}: {
  href: string;
  "aria-label"?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className="inline-flex min-h-10 shrink-0 items-center text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none"
    >
      {children}
    </a>
  );
}

export function Nav({ containerClassName }: NavProps) {
  const pathname = usePathname();
  const { logout } = usePrivy();

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--t-border)] bg-[var(--t-surface)] font-mono">
      <div
        className={cn(
          "mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5 text-xs tracking-wider",
          containerClassName
        )}
      >
        <div className="flex items-center gap-3 overflow-x-auto">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center font-bold uppercase transition-colors focus:outline-none",
                isNavItemActive(pathname, href)
                  ? "text-[var(--t-accent)]"
                  : "text-[var(--t-muted)] hover:text-[var(--t-text)] focus:text-[var(--t-accent)]"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ExternalNavLink
            href="https://x.com/playmargincall"
            aria-label="Open David Hurley on X"
          >
            <Twitter className="size-4" aria-hidden="true" />
          </ExternalNavLink>
          <ExternalNavLink
            href="https://github.com/hurley87/margin-call"
            aria-label="Open Margin Call on GitHub"
          >
            <Github className="size-4" aria-hidden="true" />
          </ExternalNavLink>
          <ExternalNavLink href="https://margin-call.gitbook.io/product-docs">
            DOCS
          </ExternalNavLink>
          <button
            onClick={logout}
            className="inline-flex min-h-10 shrink-0 items-center text-[var(--t-muted)] transition-colors hover:text-[var(--t-red)] focus:text-[var(--t-red)] focus:outline-none"
          >
            LOGOUT
          </button>
        </div>
      </div>
    </nav>
  );
}
