"use client";

import { useState, type ReactNode } from "react";

type FlashValueProps = {
  /** Numeric value watched for direction changes. */
  value: bigint;
  className?: string;
  children: ReactNode;
};

/**
 * Wraps a rendered numeric label and plays the terminal tick flash
 * (green up / red down) whenever the underlying value moves. The flash is
 * decorative; the children carry the fact.
 */
export function FlashValue({
  value,
  className = "",
  children,
}: FlashValueProps) {
  // Adjusted during render (guarded) so a value change re-keys the span and
  // replays the one-shot CSS animation — no effects, no timers.
  const [tracked, setTracked] = useState<{
    value: bigint;
    direction: "up" | "down" | null;
  }>({ value, direction: null });
  if (value !== tracked.value) {
    setTracked({ value, direction: value > tracked.value ? "up" : "down" });
  }

  return (
    <span
      className={`mc-num-flash ${className}`}
      data-dir={tracked.direction ?? undefined}
      key={tracked.direction ? tracked.value.toString() : "initial"}
    >
      {children}
    </span>
  );
}
