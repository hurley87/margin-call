import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-8 text-center">
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
