import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DatumCellProps {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  className?: string;
}

export function DatumCell({
  label,
  value,
  valueClassName,
  className,
}: DatumCellProps) {
  return (
    <div
      className={cn(
        "min-w-0 border border-[var(--t-divider)] bg-[#070b09]/75 p-3",
        className
      )}
    >
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "break-words text-sm font-bold uppercase tracking-wide text-[var(--t-text)]",
          valueClassName
        )}
      >
        {value}
      </p>
    </div>
  );
}
