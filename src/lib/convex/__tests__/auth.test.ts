import { describe, expect, it, vi } from "vitest";
import { getConvexUrl, toConvexAuthProvider } from "@/lib/convex/auth";

describe("Privy-to-Convex auth adapter", () => {
  it("keeps Convex loading until Privy is ready", () => {
    const auth = toConvexAuthProvider({
      ready: false,
      authenticated: true,
      getAccessToken: vi.fn(),
    });

    expect(auth.isLoading).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
  });

  it("maps ready authenticated and unauthenticated Privy states", () => {
    expect(
      toConvexAuthProvider({
        ready: true,
        authenticated: true,
        getAccessToken: vi.fn(),
      })
    ).toMatchObject({ isLoading: false, isAuthenticated: true });

    expect(
      toConvexAuthProvider({
        ready: true,
        authenticated: false,
        getAccessToken: vi.fn(),
      })
    ).toMatchObject({ isLoading: false, isAuthenticated: false });
  });

  it("fetches the current Privy access token on demand without retaining it", async () => {
    const getAccessToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("first-token")
      .mockResolvedValueOnce("second-token");
    const auth = toConvexAuthProvider({
      ready: true,
      authenticated: true,
      getAccessToken,
    });

    await expect(
      auth.fetchAccessToken({ forceRefreshToken: false })
    ).resolves.toBe("first-token");
    await expect(
      auth.fetchAccessToken({ forceRefreshToken: true })
    ).resolves.toBe("second-token");
    expect(getAccessToken).toHaveBeenCalledTimes(2);
  });
});

describe("Convex public configuration", () => {
  it("fails at a testable boundary when the public Convex URL is absent", () => {
    expect(() => getConvexUrl(undefined)).toThrow(
      "Missing NEXT_PUBLIC_CONVEX_URL"
    );
  });

  it("returns a configured Convex URL unchanged", () => {
    expect(getConvexUrl("https://example.convex.cloud")).toBe(
      "https://example.convex.cloud"
    );
  });
});
