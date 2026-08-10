/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("me", () => {
  it("returns null without an authenticated identity", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.me.me, {})).resolves.toBeNull();
  });

  it("returns only the verified canonical Privy DID", async () => {
    const t = convexTest(schema, modules);
    const authenticated = t.withIdentity({
      subject: "did:privy:cm_user_123",
      issuer: "privy.io",
      tokenIdentifier: "privy.io|did:privy:cm_user_123",
      email: "private@example.com",
      name: "Private Name",
    });

    await expect(authenticated.query(api.me.me, {})).resolves.toEqual({
      did: "did:privy:cm_user_123",
    });
  });

  it("rejects a non-Privy subject even when Convex has authenticated it", async () => {
    const t = convexTest(schema, modules);
    const authenticated = t.withIdentity({
      subject: "not-a-privy-did",
      issuer: "privy.io",
      tokenIdentifier: "privy.io|not-a-privy-did",
    });

    await expect(authenticated.query(api.me.me, {})).rejects.toThrow(
      "Expected a canonical Privy DID"
    );
  });
});
