import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
