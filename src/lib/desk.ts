/**
 * Desk identity helpers (shared by Convex backend and React UI).
 * MCP desks use subject prefixes `mcp:cdp-wallet:*` or `mcp:base:*`.
 * They are visually distinguished with an "AGENT DESK" badge + terminal glyph
 * on public surfaces (Wire, leaderboards, deal cards, trader rows).
 */

export const MCP_SUBJECT_PREFIX = "mcp:" as const;

/** @deprecated Use MCP_SUBJECT_PREFIX — kept for callers that referenced the old value. */
export const MCP_CDP_WALLET_SUBJECT_PREFIX = "mcp:cdp-wallet:" as const;

export function isMcpDeskSubject(subject: string | undefined | null): boolean {
  return typeof subject === "string" && subject.startsWith(MCP_SUBJECT_PREFIX);
}

export function isMcpDesk(
  desk: { subject?: string | null } | null | undefined
): boolean {
  return isMcpDeskSubject(desk?.subject);
}
