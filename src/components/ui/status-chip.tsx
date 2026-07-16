import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusChipVariants = cva(
  "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]",
  {
    variants: {
      tone: {
        neutral: "border-[var(--t-divider)] text-[var(--t-muted)]",
        accent: "border-[var(--t-accent)]/50 text-[var(--t-accent)]",
        live: "border-[var(--t-green)]/50 text-[var(--t-green)]",
        warn: "border-[var(--t-amber)]/50 text-[var(--t-amber)]",
        danger: "border-[var(--t-red)]/50 text-[var(--t-red)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export function StatusChip({
  tone,
  pulse = false,
  className,
  children,
}: VariantProps<typeof statusChipVariants> & {
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn(statusChipVariants({ tone }), className)}>
      {pulse ? (
        <span
          aria-hidden
          className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}

export { statusChipVariants };
