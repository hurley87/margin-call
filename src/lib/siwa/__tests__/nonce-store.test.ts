import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests for the Convex-backed SIWA nonce store.
 *
 * These tests exercise the read/write paths of `createConvexNonceStore` by
 * mocking the Convex admin client so no real network call is made.
 */

// Mock the admin client module before importing nonce-store
vi.mock("@/lib/convex/server-client", () => ({
  createConvexAdminClient: vi.fn(),
}));

// Mock "server-only" to avoid Next.js server-only guard in tests
vi.mock("server-only", () => ({}));

import { createConvexAdminClient } from "@/lib/convex/server-client";
import { createConvexNonceStore } from "@/lib/siwa/nonce-store";

const mockMutation = vi.fn();
const mockClient = { mutation: mockMutation };

beforeEach(() => {
  vi.clearAllMocks();
  (createConvexAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
    mockClient
  );
});

describe("createConvexNonceStore", () => {
  describe("issue", () => {
    it("returns true when Convex mutation inserts successfully", async () => {
      mockMutation.mockResolvedValueOnce(true);
      const store = createConvexNonceStore();
      const result = await store.issue("abc123", 5 * 60 * 1000);
      expect(result).toBe(true);
      expect(mockMutation).toHaveBeenCalledOnce();
    });

    it("returns false when nonce already exists (Convex mutation returns false)", async () => {
      mockMutation.mockResolvedValueOnce(false);
      const store = createConvexNonceStore();
      const result = await store.issue("abc123", 5 * 60 * 1000);
      expect(result).toBe(false);
    });

    it("passes nonce and a future expiresAt to the mutation", async () => {
      mockMutation.mockResolvedValueOnce(true);
      const before = Date.now();
      const store = createConvexNonceStore();
      await store.issue("mynonce", 300_000);
      const after = Date.now();

      const [, args] = mockMutation.mock.calls[0];
      expect(args.nonce).toBe("mynonce");
      expect(args.expiresAt).toBeGreaterThanOrEqual(before + 300_000);
      expect(args.expiresAt).toBeLessThanOrEqual(after + 300_000);
    });
  });

  describe("consume", () => {
    it('returns true when Convex mutation returns "ok"', async () => {
      mockMutation.mockResolvedValueOnce("ok");
      const store = createConvexNonceStore();
      const result = await store.consume("abc123");
      expect(result).toBe(true);
    });

    it('returns false when Convex mutation returns "expired"', async () => {
      mockMutation.mockResolvedValueOnce("expired");
      const store = createConvexNonceStore();
      const result = await store.consume("abc123");
      expect(result).toBe(false);
    });

    it('returns false when Convex mutation returns "notFound" (idempotent second call)', async () => {
      mockMutation.mockResolvedValueOnce("notFound");
      const store = createConvexNonceStore();
      const result = await store.consume("already-consumed");
      expect(result).toBe(false);
    });
  });
});
