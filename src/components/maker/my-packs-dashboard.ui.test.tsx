import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePaginatedQueryMock } = vi.hoisted(() => ({
  usePaginatedQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
}));

vi.mock("./pack-lifecycle-actions", () => ({
  PackLifecycleActions: ({ tokenId }: { tokenId: number }) => (
    <button>[MANAGE PACK #{tokenId}]</button>
  ),
}));

vi.mock("./acquisition-fees-panel", () => ({
  AcquisitionFeesPanel: () => <div>[LIVE ACQUISITION FEES]</div>,
}));

import { MyPacksDashboard } from "./my-packs-dashboard";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";

describe("MyPacksDashboard", () => {
  beforeEach(() => {
    usePaginatedQueryMock.mockReset();
  });

  it("skips the public query until a connected wallet is available", () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MyPacksDashboard walletAddress={null} />
    );

    expect(usePaginatedQueryMock.mock.calls[0]?.[1]).toBe("skip");
    expect(html).toContain("Waiting for connected wallet");
  });

  it("shows a first-page loading state instead of an empty state", () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MyPacksDashboard walletAddress={WALLET} />
    );

    expect(usePaginatedQueryMock.mock.calls[0]?.[1]).toEqual({ maker: WALLET });
    expect(html).toContain("Loading your Packs");
    expect(html).not.toContain("No Packs indexed");
  });

  it("shows the wallet-scoped empty state after loading", () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MyPacksDashboard walletAddress={WALLET} />
    );

    expect(html).toContain("No Packs indexed for this wallet.");
  });

  it("renders indexed Pack lifecycle fields and pagination state", () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [
        {
          tokenId: 42,
          maker: WALLET,
          basket: [
            {
              asset: "0x0000000000000000000000000000000000000001",
              amount: "1000000000000000000",
              symbol: "AAPL",
            },
            {
              asset: "0x0000000000000000000000000000000000000002",
              amount: "2000000000000000000",
              symbol: "MSFT",
            },
          ],
          navUsdWad: "123450000000000000000",
          status: "resting",
          eligible: true,
          updatedAt: 1,
        },
      ],
      status: "CanLoadMore",
      loadMore: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MyPacksDashboard walletAddress={WALLET} />
    );

    expect(html).toContain("My Packs");
    expect(html).toContain("[LIVE ACQUISITION FEES]");
    expect(html).toContain("Pack #42");
    expect(html).toContain("AAPL · MSFT");
    expect(html).toContain("Indexed NAV $123.45");
    expect(html).toContain("Eligible");
    expect(html).toContain("Resting");
    expect(html).toContain("[MANAGE PACK #42]");
    expect(html).toContain("[LOAD MORE PACKS]");
  });
});
