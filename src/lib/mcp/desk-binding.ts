import "server-only";
import crypto from "crypto";
import {
  MCP_DESK_BINDING_HEADER,
  MCP_DESK_BINDING_TTL_MS,
} from "./desk-binding-core";

export { MCP_DESK_BINDING_HEADER, MCP_DESK_BINDING_TTL_MS };

function bindingSecret(): string {
  const secret = process.env.MCP_API_KEY_SECRET;
  if (!secret) {
    throw new Error("MCP_API_KEY_SECRET is not set");
  }
  return secret;
}

/** Sign deskManagerId for Convex MCP HTTP so service token alone cannot impersonate desks. */
export function signMcpDeskBinding(deskManagerId: string): string {
  const timestamp = Date.now();
  const message = `${deskManagerId}:${timestamp}`;
  const signature = crypto
    .createHmac("sha256", bindingSecret())
    .update(message)
    .digest("hex");
  return `${timestamp}.${signature}`;
}
