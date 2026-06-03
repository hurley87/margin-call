/** MCP agent desks use subject prefixes `mcp:cdp-wallet:*` or `mcp:base:*`. */
export const MCP_SUBJECT_PREFIX = "mcp:" as const;

export function isMcpSubject(subject: string | undefined | null): boolean {
  return typeof subject === "string" && subject.startsWith(MCP_SUBJECT_PREFIX);
}
