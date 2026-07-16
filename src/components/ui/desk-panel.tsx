import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DeskPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={cn("terminal-panel", className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  meta,
  action,
  metaAriaLabel,
  onMetaClick,
  className,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  metaAriaLabel?: string;
  onMetaClick?: () => void;
  className?: string;
}) {
  const metaNode = meta ? (
    onMetaClick ? (
      <button
        type="button"
        onClick={onMetaClick}
        aria-label={metaAriaLabel ?? meta}
        className="border border-[var(--t-divider)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] focus-visible:border-[var(--t-accent)] focus-visible:text-[var(--t-accent)] focus-visible:outline-none"
      >
        {meta}
      </button>
    ) : (
      <span className="border border-[var(--t-divider)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
        {meta}
      </span>
    )
  ) : null;

  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-b border-[var(--t-divider)] bg-[#0b100d]/90 px-3 py-2.5",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate font-[family-name:var(--font-plex-sans)] text-sm font-black uppercase tracking-[0.14em] text-[var(--t-accent)]">
          {title}
        </h2>
        {metaNode}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </header>
  );
}
