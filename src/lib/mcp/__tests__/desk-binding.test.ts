import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { MCP_DESK_BINDING_TTL_MS } from "@/lib/mcp/desk-binding-core";

function signMcpDeskBinding(deskManagerId: string, secret: string): string {
  const timestamp = Date.now();
  const message = `${deskManagerId}:${timestamp}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return `${timestamp}.${signature}`;
}

function verifyBinding(
  deskManagerId: string,
  header: string,
  secret: string,
  now = Date.now()
): boolean {
  const dot = header.indexOf(".");
  if (dot <= 0) return false;
  const timestamp = Number(header.slice(0, dot));
  const signature = header.slice(dot + 1);
  if (!Number.isFinite(timestamp) || signature.length !== 64) return false;
  const age = now - timestamp;
  if (age < 0 || age > MCP_DESK_BINDING_TTL_MS) return false;
  const message = `${deskManagerId}:${timestamp}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return expected === signature;
}

describe("MCP desk binding", () => {
  it("signs and verifies deskManagerId binding", () => {
    const deskId = "jd7abc123";
    const secret = "test-secret";
    const header = signMcpDeskBinding(deskId, secret);
    expect(verifyBinding(deskId, header, secret)).toBe(true);
    expect(verifyBinding("other-desk", header, secret)).toBe(false);
  });

  it("rejects expired bindings", () => {
    const deskId = "jd7abc123";
    const secret = "test-secret";
    const timestamp = Date.now() - MCP_DESK_BINDING_TTL_MS - 1;
    const message = `${deskId}:${timestamp}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("hex");
    const header = `${timestamp}.${signature}`;
    expect(verifyBinding(deskId, header, secret)).toBe(false);
  });
});
