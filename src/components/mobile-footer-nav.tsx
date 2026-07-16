"use client";

import { Activity, Briefcase, Newspaper, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

export type MobileTab = "wire" | "desk" | "feed" | "floor";

const TABS: Array<{
  id: MobileTab;
  label: string;
  icon: typeof Newspaper;
}> = [
  { id: "wire", label: "Wire", icon: Newspaper },
  { id: "desk", label: "Desk", icon: Briefcase },
  { id: "feed", label: "Feed", icon: Activity },
  { id: "floor", label: "Floor", icon: Trophy },
];

type MobileFooterNavProps = {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  approvalsCount: number;
};

export function MobileFooterNav({
  activeTab,
  onTabChange,
  approvalsCount,
}: MobileFooterNavProps) {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--t-bronze)] bg-[#050706]/98 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-4">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          const showBadge = id === "feed" && approvalsCount > 0;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 border-t-2 px-1 pt-0.5 transition-colors",
                isActive
                  ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border-transparent text-[var(--t-muted)] hover:text-[var(--t-text)]"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden />
                {showBadge && (
                  <span className="absolute -right-2 -top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-[var(--t-amber)] px-1 text-[9px] font-bold tabular-nums text-[var(--t-bg)]">
                    {approvalsCount > 9 ? "9+" : approvalsCount}
                  </span>
                )}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em]">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
