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
