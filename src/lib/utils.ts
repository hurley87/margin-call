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
