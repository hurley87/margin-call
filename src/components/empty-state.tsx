import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-8 text-center", className)}>
      <p className="text-sm font-bold uppercase tracking-wider text-[var(--t-amber)]">
        {title}
      </p>
      {description && (
        <p className="mx-auto mt-2 max-w-[34rem] text-xs leading-relaxed text-[var(--t-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
