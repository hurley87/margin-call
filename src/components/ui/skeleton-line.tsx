import { cn } from "@/lib/utils";

/** Single shimmer block sized by the caller. */
export function SkeletonLine({ className }: { className?: string }) {
  return <div aria-hidden className={cn("mc-shimmer h-3 w-full", className)} />;
}

/**
 * Stack of row-shaped shimmer placeholders that approximate the table rows
 * they stand in for, so panels keep their silhouette while loading.
 */
export function SkeletonRows({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-2 border border-[var(--t-divider)]/60 bg-[#070b09]/60 px-2 py-2"
        >
          <SkeletonLine className="h-5 w-5" />
          <SkeletonLine className="max-w-[60%]" />
          <SkeletonLine />
          <SkeletonLine />
        </div>
      ))}
    </div>
  );
}
