import type { ReactNode } from "react";

import { AnimatedNumber } from "@/components/animated-number";
import { cn } from "@/lib/utils";

export function MarketValue({
  value,
  format,
  live = false,
  className,
  tone = "auto",
}: {
  value: number;
  format: (n: number) => string;
  live?: boolean;
  className?: string;
  tone?: "auto" | "neutral" | "up" | "down";
}) {
  const resolvedTone =
    tone === "auto"
      ? value > 0
        ? "up"
        : value < 0
          ? "down"
          : "neutral"
      : tone;

  return (
    <AnimatedNumber
      value={value}
      format={format}
      live={live}
      className={cn(
        "mc-live-value tabular-nums",
        resolvedTone === "up" && "text-[var(--t-green)]",
        resolvedTone === "down" && "text-[var(--t-red)]",
        resolvedTone === "neutral" && "text-[var(--t-text)]",
        className
      )}
    />
  );
}

export function MarketLabel({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
        {label}
      </p>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-[var(--t-text)]">
        {children}
      </div>
    </div>
  );
}
