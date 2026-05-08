"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Github, Twitter } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "DESK" },
  { href: "/wire", label: "NEWSWIRE" },
  { href: "/leaderboard", label: "LEADERBOARD" },
];

interface NavProps {
  containerClassName?: string;
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
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      className="shrink-0 text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
    >
      {children}
    </a>
  );
}

export function Nav({ containerClassName }: NavProps) {
  const pathname = usePathname();
  const { logout } = usePrivy();

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
      <div
        className={cn(
          "mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5 text-xs tracking-wider",
          containerClassName
        )}
      >
        <div className="flex items-center gap-3 overflow-x-auto">
          {NAV_ITEMS.map(({ href, label }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "shrink-0 transition-colors",
                  isActive
                    ? "text-[var(--t-accent)]"
                    : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <ExternalNavLink
            href="https://x.com/davidbhurley"
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
            className="shrink-0 text-[var(--t-muted)] transition-colors hover:text-[var(--t-red)]"
          >
            LOGOUT
          </button>
        </div>
      </div>
    </nav>
  );
}
