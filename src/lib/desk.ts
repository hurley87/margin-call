/**
 * Desk identity helpers (shared by Convex backend and React UI).
 * MCP desks use subject prefix `mcp:cdp-wallet:` (Phase 2+).
 * They are visually distinguished with an "AGENT DESK" badge + terminal glyph
 * on public surfaces (Wire, leaderboards, deal cards, trader rows).
 */

export const MCP_SUBJECT_PREFIX = "mcp:cdp-wallet:" as const;

export function isMcpDeskSubject(subject: string | undefined | null): boolean {
  return typeof subject === "string" && subject.startsWith(MCP_SUBJECT_PREFIX);
}

export function isMcpDesk(
  desk: { subject?: string | null } | null | undefined
): boolean {
  return isMcpDeskSubject(desk?.subject);
}
