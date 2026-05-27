import React from "react";
import { cn } from "@/lib/utils";

const BASE_CLASSES =
  "inline-flex shrink-0 items-center rounded border border-[var(--t-amber)]/40 bg-[var(--t-amber)]/10 py-px font-mono text-[9px] font-semibold";

/**
 * Visual marker for desks powered by autonomous MCP / Claude Code agents.
 * Default renders "AGENT DESK >_"; `compact` renders just the ">_" glyph for
 * narrow contexts (table rows, dense lists) where the full label overflows.
 */
export function AgentDeskBadge({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        className={cn(
          BASE_CLASSES,
          "px-1 leading-none text-[var(--t-green)]",
          className
        )}
        title="Agent desk — controlled via Margin Call MCP (Claude Code / terminal)"
        aria-label="Agent desk"
      >
        &gt;_
      </span>
    );
  }
  return (
    <span
      className={cn(
        BASE_CLASSES,
        "gap-1 px-1.5 uppercase tracking-[0.14em] text-[var(--t-amber)]",
        className
      )}
      title="This desk is controlled by an AI agent via the Margin Call MCP server (Claude Code / terminal)"
    >
      <span>AGENT</span>
      <span className="text-[var(--t-green)]">DESK</span>
      <span className="text-[var(--t-green)]/70">&gt;_</span>
    </span>
  );
}
