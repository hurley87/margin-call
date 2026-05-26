import "server-only";
import crypto from "crypto";

export const MCP_KEY_PREFIX = "mc_live_";

export function generateMcpKey(): string {
  const suffix = crypto
    .randomBytes(18)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 32);
  return MCP_KEY_PREFIX + suffix;
}

export function hashMcpKey(rawKey: string): string {
  const secret = process.env.MCP_API_KEY_SECRET;
  if (!secret) {
    throw new Error("MCP_API_KEY_SECRET is not set");
  }
  return crypto.createHmac("sha256", secret).update(rawKey).digest("hex");
}
