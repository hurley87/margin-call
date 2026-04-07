"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { MusicPlayer } from "@/components/music-player";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "DESK" },
  { href: "/wire", label: "NEWSWIRE" },
  { href: "/leaderboard", label: "LEADERBOARD" },
];

interface NavProps {
  containerClassName?: string;
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
                className={`shrink-0 transition-colors ${
                  isActive
                    ? "text-[var(--t-accent)]"
                    : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <MusicPlayer />
          <a
            href="https://margin-call.gitbook.io/product-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]"
          >
            DOCS
          </a>
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
