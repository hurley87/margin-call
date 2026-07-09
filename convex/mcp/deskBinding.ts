import { jsonResponse, constantTimeEquals } from "./httpHelpers";

export const MCP_DESK_BINDING_HEADER = "X-MCP-Desk-Binding";
export const MCP_DESK_BINDING_TTL_MS = 120_000;

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify that deskManagerId was bound to a valid mc_live_* key at the Next.js
 * proxy layer. Requires MCP_API_KEY_SECRET (same as key HMAC) in Convex env.
 */
export async function verifyMcpDeskBinding(
  req: Request,
  deskManagerId: string
): Promise<Response | null> {
  const secret = process.env.MCP_API_KEY_SECRET;
  if (!secret) {
    return jsonResponse({ error: "MCP desk binding is not configured" }, 403);
  }

  const header = req.headers.get(MCP_DESK_BINDING_HEADER) ?? "";
  const dot = header.indexOf(".");
  if (dot <= 0) {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  const timestampRaw = header.slice(0, dot);
  const signature = header.slice(dot + 1);
  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp) || signature.length !== 64) {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  const age = Date.now() - timestamp;
  if (age < 0 || age > MCP_DESK_BINDING_TTL_MS) {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  const message = `${deskManagerId}:${timestamp}`;
  const expected = await hmacSha256Hex(secret, message);
  if (!constantTimeEquals(signature, expected)) {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  return null;
}

/** Service token + desk binding for MCP HTTP routes. */
export async function authorizeMcpRequest(
  req: Request,
  deskManagerId: string,
  authorizeService: (req: Request) => Response | null
): Promise<Response | null> {
  const authErr = authorizeService(req);
  if (authErr) return authErr;
  return verifyMcpDeskBinding(req, deskManagerId);
}
