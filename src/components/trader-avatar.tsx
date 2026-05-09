import Image from "next/image";

import { cn } from "@/lib/utils";

export type TraderAvatarImageStatus =
  | "pending"
  | "generating"
  | "ready"
  | "error";

export type TraderAvatarSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<TraderAvatarSize, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-sm",
  lg: "h-full w-full text-5xl",
};

const IMAGE_SIZES: Record<TraderAvatarSize, string> = {
  sm: "1.75rem",
  md: "2.5rem",
  lg: "12rem",
};

const STATUS_LABEL: Record<
  Exclude<TraderAvatarImageStatus, "ready">,
  string
> = {
  pending: "Portrait developing",
  generating: "Generating portrait",
  error: "Portrait unavailable",
};

export function traderInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "??";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function TraderAvatar({
  name,
  src,
  imageStatus,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  imageStatus?: TraderAvatarImageStatus | null;
  size?: TraderAvatarSize;
  className?: string;
}) {
  const isReady = imageStatus === "ready" && Boolean(src);
  const isLoading = imageStatus === "pending" || imageStatus === "generating";
  const fallbackStatus =
    imageStatus === "ready" && !src ? "missing" : (imageStatus ?? "missing");

  let label = "Portrait unavailable";
  if (imageStatus === "pending") label = STATUS_LABEL.pending;
  else if (imageStatus === "generating") label = STATUS_LABEL.generating;
  else if (imageStatus === "error") label = STATUS_LABEL.error;

  return (
    <div
      className={cn(
        "relative isolate flex shrink-0 items-center justify-center overflow-hidden bg-[linear-gradient(135deg,rgba(104,166,82,0.16),rgba(218,173,94,0.08)_45%,rgba(0,0,0,0.42))] font-[family-name:var(--font-plex-sans)] font-black uppercase text-[var(--t-accent)]/85",
        SIZE_CLASS[size],
        className
      )}
      data-status={isReady ? "ready" : fallbackStatus}
      aria-label={`${name} trader portrait`}
    >
      {isReady ? (
        <Image
          src={src as string}
          alt={`${name} portrait`}
          fill
          unoptimized
          sizes={IMAGE_SIZES[size]}
          className={cn(
            "object-cover opacity-95",
            size === "lg" ? "scale-[1.06]" : ""
          )}
        />
      ) : (
        <>
          <div
            className={cn(
              "absolute inset-0 bg-[radial-gradient(circle_at_45%_28%,rgba(218,173,94,0.22),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.32))]",
              isLoading ? "animate-pulse" : ""
            )}
          />
          <span className="relative z-10 leading-none">
            {traderInitials(name)}
          </span>
          {size !== "sm" && (
            <span className="absolute inset-x-1 bottom-2 z-10 truncate text-center font-mono text-[9px] font-bold tracking-[0.12em] text-[var(--t-muted)]">
              {label}
            </span>
          )}
        </>
      )}
      <div className="pointer-events-none absolute inset-0 crt-line-grid opacity-35" />
    </div>
  );
}
