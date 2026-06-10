import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DIALOG_BACKDROP_CLASS =
  "fixed inset-0 z-50 bg-[#020403]/55 backdrop-blur-[2px]";

const DIALOG_POPUP_BASE_CLASS =
  "fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60 sm:max-h-[88vh]";

const DIALOG_POPUP_SIZE_CLASS = {
  lg: "max-w-2xl sm:w-[92vw]",
  xl: "max-w-4xl sm:w-[94vw]",
} as const;

export function dialogPopupClass(size: keyof typeof DIALOG_POPUP_SIZE_CLASS) {
  return `${DIALOG_POPUP_BASE_CLASS} ${DIALOG_POPUP_SIZE_CLASS[size]}`;
}

const USDC_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsdc(value: number): string {
  return USDC_FORMATTER.format(value);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

export function formatCompactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatSignedCompactMoney(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCompactMoney(value)}`;
}

export function formatSignedMoney(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatMoney(value)}`;
}

const ACTIVITY_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function formatActivityTime(timestamp: number): string {
  return ACTIVITY_TIME_FORMATTER.format(new Date(timestamp));
}

export function heatColor(score: number): string {
  if (score >= 7) return "text-[var(--t-red)]";
  if (score >= 4) return "text-[var(--t-amber)]";
  return "text-[var(--t-green)]";
}

export function formatShortAddress(
  value: string | null | undefined,
  fallback = "Unknown"
): string {
  if (!value) return fallback;
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function relativeTime(
  timestamp: number | undefined,
  nowMs: number = Date.now()
): string {
  if (!timestamp) return "—";
  const diff = Math.max(0, nowMs - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
