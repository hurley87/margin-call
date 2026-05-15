"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

export interface MarketClosedButtonProps extends Omit<ButtonProps, "children"> {
  /** When true, render the disabled MARKET CLOSED label with countdown. */
  isClosed: boolean;
  /** Live HH:MM:SS countdown until the next open. */
  countdownLabel: string;
  /** Inline closed copy. Defaults to `"MARKET CLOSED"`. */
  closedLabel?: string;
  /** Rendered when `isClosed === false`. */
  enabledChildren: React.ReactNode;
}

/**
 * Shared button shape for affordances that should be gated outside trading
 * hours. When closed, renders disabled with
 * `MARKET CLOSED — Opens in HH:MM:SS` inline; otherwise renders
 * `enabledChildren`.
 */
export function MarketClosedButton({
  isClosed,
  countdownLabel,
  closedLabel = "MARKET CLOSED",
  enabledChildren,
  disabled,
  ...props
}: MarketClosedButtonProps) {
  return (
    <Button {...props} disabled={isClosed || disabled}>
      {isClosed
        ? `${closedLabel} — Opens in ${countdownLabel}`
        : enabledChildren}
    </Button>
  );
}
