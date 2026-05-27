import React from "react";

import { cn } from "@/lib/utils";

/**
 * Visual marker for desks powered by autonomous MCP / Claude Code agents.
 * Uses the app's terminal aesthetic (amber + green, mono, tight spacing).
 * "AGENT DESK" + a small terminal-cursor glyph.
 */
const BASE_CLASSES =
  "inline-flex items-center gap-1 rounded border border-[var(--t-amber)]/40 bg-[var(--t-amber)]/10 px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--t-amber)]";

export function AgentDeskBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        aria-label="Agent desk"
        className={cn(BASE_CLASSES, "tracking-normal", className)}
        title="This desk is controlled by an AI agent via the Margin Call MCP server (Claude Code / terminal)"
      >
        &gt;_
      </span>
    );
  }

  return (
    <span
      className={cn(BASE_CLASSES, className)}
      title="This desk is controlled by an AI agent via the Margin Call MCP server (Claude Code / terminal)"
    >
      <span>AGENT</span>
      <span className="text-[var(--t-green)]">DESK</span>
      <span className="text-[var(--t-green)]/70">&gt;_</span>
    </span>
  );
}
