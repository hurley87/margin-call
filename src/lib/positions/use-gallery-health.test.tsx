// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGalleryHealth } from "./use-gallery-health";
import type { PositionListItem } from "./types";

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const position = (
  tokenId: string,
  status: PositionListItem["status"] = "active"
): PositionListItem => ({ tokenId, status, assetId: 1, owner: "0x123" });

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function metadata(
  tokenId: string,
  stage: "Healthy" | "Warning" | "Danger" | "Pricing unavailable",
  image: string
) {
  return {
    name: `Margin Call Position #${tokenId}`,
    description: "My stock thesis",
    image,
    attributes: [
      { trait_type: "Stock", value: "NVDA" },
      { trait_type: "Stage", value: stage },
      { trait_type: "Status", value: "Active" },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  fetchMock.mockReset();
});

describe("Explore health", () => {
  it("resolves live stages from GET /api/nft/[tokenId] and skips terminal positions", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const tokenId = String(url).split("/").at(-1);
      if (tokenId === "5")
        return jsonResponse({ error: "No live position" }, 404);
      return jsonResponse(
        {
          "1": metadata(
            "1",
            "Healthy",
            "https://margincall.fun/nvda/healthy.png"
          ),
          "2": metadata(
            "2",
            "Warning",
            "https://margincall.fun/nvda/warning.png"
          ),
          "3": metadata(
            "3",
            "Danger",
            "https://margincall.fun/nvda/danger.png"
          ),
          "4": metadata(
            "4",
            "Pricing unavailable",
            "https://margincall.fun/nvda/healthy.png"
          ),
        }[tokenId ?? ""]
      );
    });
    const { result } = renderHook(() =>
      useGalleryHealth(
        [
          position("1"),
          position("2"),
          position("3"),
          position("4"),
          position("5"),
          position("6", "closed"),
          position("7", "liquidated"),
        ],
        true
      )
    );
    await waitFor(() =>
      expect(
        Object.fromEntries(
          Object.entries(result.current).map(([id, value]) => [
            id,
            value.health,
          ])
        )
      ).toEqual({
        "1": "healthy",
        "2": "warning",
        "3": "danger",
        "4": "pricing_unavailable",
        "5": "ended",
      })
    );
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      "/api/nft/1",
      "/api/nft/2",
      "/api/nft/3",
      "/api/nft/4",
      "/api/nft/5",
    ]);
    expect(result.current["1"].metadata?.description).toBe("My stock thesis");
    expect(result.current["1"].metadata?.image).toBe(
      "https://margincall.fun/nvda/healthy.png"
    );
    expect(result.current["5"].metadata).toBeUndefined();
  });

  it("limits concurrency and ignores late results after a filter change", async () => {
    const resolve: Array<(value: unknown) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise((done) => resolve.push(done))
    );
    const { result, rerender } = renderHook(
      ({ positions }) => useGalleryHealth(positions, true),
      {
        initialProps: {
          positions: [
            position("1"),
            position("2"),
            position("3"),
            position("4"),
          ],
        },
      }
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    rerender({ positions: [position("9")] });
    await act(async () => {
      const live = metadata(
        "1",
        "Healthy",
        "https://margincall.fun/nvda/healthy.png"
      );
      resolve[0](jsonResponse(live));
      resolve[1](jsonResponse(live));
      resolve[2](jsonResponse(live));
      resolve[3](
        jsonResponse(
          metadata("9", "Healthy", "https://margincall.fun/nvda/healthy.png")
        )
      );
    });
    expect(
      Object.fromEntries(
        Object.entries(result.current).map(([id, value]) => [id, value.health])
      )
    ).toEqual({ "9": "healthy" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("refreshes after a minute and replaces a stale stage on failure", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(
      jsonResponse(
        metadata("1", "Healthy", "https://margincall.fun/nvda/healthy.png")
      )
    );
    const { result, unmount } = renderHook(() =>
      useGalleryHealth([position("1")], true)
    );
    await act(async () => {});
    expect(result.current["1"]?.health).toBe("healthy");
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Base is unavailable" }, 502)
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current["1"]?.health).toBe("unavailable");
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not fetch metadata for Portfolio", () => {
    renderHook(() => useGalleryHealth([position("1")], false));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
