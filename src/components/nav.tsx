"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { usePendingApprovals } from "@/hooks/use-approvals";

const NAV_ITEMS = [
  { href: "/", label: "FEED" },
  { href: "/traders", label: "TRADERS" },
  { href: "/deals", label: "DEALS" },
  { href: "/leaderboard", label: "LEADERBOARD" },
  { href: "/approvals", label: "APPROVALS" },
];

export function Nav() {
  const pathname = usePathname();
  const { logout } = usePrivy();
  const { data: approvals } = usePendingApprovals();
  const pendingCount = approvals?.length ?? 0;

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-1.5 text-[10px] tracking-wider">
        <div className="flex items-center gap-3 overflow-x-auto">
          {NAV_ITEMS.map(({ href, label }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            const showBadge = href === "/approvals" && pendingCount > 0;

            return (
              <Link
                key={href}
                href={href}
                className={`shrink-0 transition-colors ${
                  isActive
                    ? "text-[var(--t-accent)]"
                    : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
                }`}
              >
                {label}
                {showBadge && (
                  <span className="ml-0.5 text-[var(--t-amber)]">
                    ({pendingCount})
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <button
          onClick={logout}
          className="shrink-0 text-[var(--t-muted)] transition-colors hover:text-[var(--t-red)]"
        >
          [X]
        </button>
      </div>
    </nav>
  );
}
