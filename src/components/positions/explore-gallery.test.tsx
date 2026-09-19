// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usePaginatedQueryMock = vi.hoisted(() => vi.fn());
const useOptionalConvexClientMock = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
}));

vi.mock("@/components/providers/convex-client-provider", () => ({
  useOptionalConvexClient: useOptionalConvexClientMock,
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

import { AllPositionsPage } from "@/components/positions/all-positions-page";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678" as const;

/** The JSON shape `GET /api/nft/[tokenId]` serves for a live token. */
function nftResponse(stage: string, image: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      name: "Margin Call Position #51",
      description: "Long the puppy.",
      image,
      attributes: [
        { trait_type: "Stock", value: "NVDA" },
        { trait_type: "Stage", value: stage },
        { trait_type: "Status", value: "Active" },
      ],
    }),
  };
}

function artSrc(card: Element): string {
  return decodeURIComponent(
    card.querySelector("img")?.getAttribute("src") ?? ""
  );
}

/** Scopes assertions to the card — the filter chips reuse the status words. */
function onlyCard(): HTMLElement {
  const card = document.querySelector<HTMLElement>(".explore-card-link");
  if (card === null) throw new Error("no Explore card rendered");
  return card;
}

describe("Explore gallery", () => {
  beforeEach(() => {
    useOptionalConvexClientMock.mockReturnValue({});
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    cleanup();
    usePaginatedQueryMock.mockReset();
    useOptionalConvexClientMock.mockReset();
  });

  it("filters by lifecycle without live RPC fields", () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [
        {
          tokenId: "9",
          assetId: 1,
          owner: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          status: "closed",
        },
      ],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    render(<AllPositionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Closed" }));

    expect(usePaginatedQueryMock.mock.calls.at(-1)?.[1]).toEqual({
      status: "closed",
    });
    expect(screen.getByText("Token #9")).not.toBeNull();
    expect(screen.getByText(/Owner/)).not.toBeNull();
    expect(screen.queryByText(/NAV/i)).toBeNull();
    expect(screen.queryByText(/debt/i)).toBeNull();
    // A settled position has no live health left to ask about.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a status before asset chips can be selected", () => {
    render(<AllPositionsPage />);

    const nvda = screen.getByRole("button", { name: "NVDAc" });
    expect(nvda).toHaveProperty("disabled", true);
    expect(
      screen.getByText("Choose a status to filter by asset.")
    ).not.toBeNull();

    fireEvent.click(nvda);
    expect(usePaginatedQueryMock.mock.calls.at(-1)?.[1]).toEqual({});

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    fireEvent.click(screen.getByRole("button", { name: "NVDAc" }));

    expect(usePaginatedQueryMock.mock.calls.at(-1)?.[1]).toEqual({
      status: "active",
      assetId: 1,
    });
    expect(
      screen.queryByText("Choose a status to filter by asset.")
    ).toBeNull();
  });

  it("retains the selected asset when switching status and clears filters", () => {
    render(<AllPositionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    fireEvent.click(screen.getByRole("button", { name: "NVDAc" }));
    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    expect(usePaginatedQueryMock.mock.calls.at(-1)?.[1]).toEqual({
      status: "closed",
      assetId: 1,
    });
    expect(
      screen.getByRole("button", { name: "NVDAc" }).getAttribute("aria-pressed")
    ).toBe("true");
    fireEvent.click(
      within(screen.getByRole("group", { name: "Asset" })).getByRole("button", {
        name: "All",
      })
    );
    expect(usePaginatedQueryMock.mock.calls.at(-1)?.[1]).toEqual({
      status: "closed",
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Status" })).getByRole(
        "button",
        { name: "All" }
      )
    );
    expect(usePaginatedQueryMock.mock.calls.at(-1)?.[1]).toEqual({});
    expect(screen.getByRole("button", { name: "NVDAc" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("renders gallery cards and preserves pagination", () => {
    const loadMore = vi.fn();
    const results = [
      { tokenId: "51", assetId: 1, status: "active", owner: OWNER },
      { tokenId: "52", assetId: 2, status: "closed", owner: OWNER },
      { tokenId: "53", assetId: 1, status: "liquidated", owner: OWNER },
      { tokenId: "54", assetId: 999, status: "active", owner: OWNER },
    ];
    usePaginatedQueryMock.mockReturnValue({
      results,
      status: "CanLoadMore",
      loadMore,
    });
    const { container, rerender } = render(<AllPositionsPage />);
    const cards = container.querySelectorAll(".explore-card-link");
    expect(cards).toHaveLength(4);
    expect(cards[0].getAttribute("href")).toBe("/position/51");
    expect(cards[0].textContent).toContain("Active");
    expect(cards[0].textContent).toContain("Owner");
    expect(artSrc(cards[0])).toContain("/logos/nvda.png");
    expect(artSrc(cards[1])).toContain("/aapl/closed.png");
    expect(artSrc(cards[2])).toContain("/nvda/liquidated.png");
    expect(cards[3].querySelector(".explore-art-placeholder")).not.toBeNull();

    // Only the active tokens are worth a metadata read.
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      "/api/nft/51",
      "/api/nft/54",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledWith(20);
    usePaginatedQueryMock.mockReturnValue({
      results,
      status: "LoadingMore",
      loadMore,
    });
    rerender(<AllPositionsPage />);
    expect(screen.getByRole("button", { name: "Loading…" })).toHaveProperty(
      "disabled",
      true
    );
    expect(container.querySelectorAll(".explore-card-link")).toHaveLength(4);
    usePaginatedQueryMock.mockReturnValue({
      results,
      status: "Exhausted",
      loadMore,
    });
    rerender(<AllPositionsPage />);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it.each([
    ["Healthy", "healthy"],
    ["Warning", "warning"],
    ["Danger", "danger"],
  ])(
    "shows the %s dog, tag, and thesis from live metadata",
    async (label, face) => {
      fetchMock.mockResolvedValue(
        nftResponse(label, `https://margincall.fun/nvda/${face}.png`)
      );
      usePaginatedQueryMock.mockReturnValue({
        results: [
          { tokenId: "51", assetId: 1, status: "active", owner: OWNER },
        ],
        status: "Exhausted",
        loadMore: vi.fn(),
      });

      render(<AllPositionsPage />);

      // Until the metadata lands, the card cannot name a health state.
      expect(screen.getByRole("status").textContent).toBe("Checking health…");
      expect(artSrc(onlyCard())).toContain("/logos/nvda.png");

      await waitFor(() => {
        expect(screen.getByRole("status").textContent).toBe(label);
      });
      // The card serves the committed file, not the absolute metadata URL.
      expect(artSrc(onlyCard())).toContain(`/nvda/${face}.png`);
      expect(within(onlyCard()).getByText("Long the puppy.")).not.toBeNull();
      expect(within(onlyCard()).getByText("Active")).not.toBeNull();
    }
  );

  it("keeps the honest label and the metadata dog when a position cannot be priced", async () => {
    fetchMock.mockResolvedValue(
      nftResponse(
        "Pricing unavailable",
        "https://margincall.fun/nvda/healthy.png"
      )
    );
    usePaginatedQueryMock.mockReturnValue({
      results: [{ tokenId: "51", assetId: 1, status: "active", owner: OWNER }],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    render(<AllPositionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Pricing unavailable"
      );
    });
    // The route publishes the healthy dog so marketplaces do not cache the
    // ticker through a weekend halt. Explore shows that same file.
    expect(artSrc(onlyCard())).toContain("/nvda/healthy.png");
    expect(artSrc(onlyCard())).not.toContain("/logos/nvda.png");
    expect(within(onlyCard()).getByText("Active")).not.toBeNull();
  });

  it("tells one story when the index still lists a burned token as active", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "No live position" }),
    });
    usePaginatedQueryMock.mockReturnValue({
      results: [{ tokenId: "51", assetId: 1, status: "active", owner: OWNER }],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    render(<AllPositionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Position ended");
    });
    expect(within(onlyCard()).queryByText("Active")).toBeNull();
  });

  it("keeps the position listed when the metadata route declines", async () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [{ tokenId: "51", assetId: 1, status: "active", owner: OWNER }],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    render(<AllPositionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Health unavailable");
    });
    expect(within(onlyCard()).getByText("Active")).not.toBeNull();
  });

  it("distinguishes loading, empty, and index-unavailable states", () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    });
    const { rerender } = render(<AllPositionsPage />);
    expect(screen.getByRole("status").textContent).toBe("Loading positions…");
    expect(screen.queryByText("No positions match these filters.")).toBeNull();

    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });
    rerender(<AllPositionsPage />);
    expect(screen.getByRole("status").textContent).toBe(
      "No positions match these filters."
    );

    useOptionalConvexClientMock.mockReturnValue(null);
    rerender(<AllPositionsPage />);
    expect(screen.getByRole("status").textContent).toContain(
      "temporarily unavailable"
    );
    // A public explorer should not name the operator's env var.
    expect(screen.queryByText(/NEXT_PUBLIC/)).toBeNull();
  });

  it("keeps the page in-shell and recovers when a Convex query throws", () => {
    usePaginatedQueryMock.mockImplementation(() => {
      throw new Error("offline");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      render(<AllPositionsPage />);
      expect(screen.getByRole("alert").textContent).toContain(
        "Couldn't load positions"
      );
      expect(screen.getByRole("heading", { name: "Explore" })).not.toBeNull();
      expect(screen.queryByText(/circuit breaker/i)).toBeNull();

      usePaginatedQueryMock.mockReturnValue({
        results: [],
        status: "Exhausted",
        loadMore: vi.fn(),
      });
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(screen.getByRole("status").textContent).toBe(
        "No positions match these filters."
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
