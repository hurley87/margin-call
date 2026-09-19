// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usePathnameMock = vi.hoisted(() => vi.fn(() => "/"));
const useSearchParamsMock = vi.hoisted(() =>
  vi.fn(() => new URLSearchParams())
);
const usePaginatedQueryMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useOptionalConvexClientMock = vi.hoisted(() => vi.fn());
const useWalletSessionMock = vi.hoisted(() => vi.fn());
const useGetWalletAccountsMock = vi.hoisted(() =>
  vi.fn(() => ({ data: [] as Array<{ chain: string; key: string }> }))
);

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useSearchParams: useSearchParamsMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: "page" | undefined;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
  useQuery: useQueryMock,
}));

vi.mock("@/components/providers/convex-client-provider", () => ({
  useOptionalConvexClient: useOptionalConvexClientMock,
}));

vi.mock("@/components/wallet/wallet-providers", () => ({
  useDynamicReady: () => true,
  useWalletSession: useWalletSessionMock,
  WalletProviders: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@dynamic-labs-sdk/react-hooks", () => ({
  useInitStatus: () => ({ data: "finished", error: null }),
  useGetWalletAccounts: useGetWalletAccountsMock,
  useGetAvailableWalletProvidersData: () => ({ data: [] }),
  useConnectWithWalletProvider: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useVerifyWalletAccount: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useLogout: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useGetActiveNetworkId: () => ({ data: { networkId: "eip155:8453" } }),
}));

vi.mock("@dynamic-labs-sdk/evm", () => ({
  isEvmWalletAccount: (account: { chain: string }) => account.chain === "EVM",
}));

vi.mock("@dynamic-labs-sdk/client", () => ({
  isProgrammaticNetworkSwitchAvailable: () => false,
  isDeeplinkWalletProvider: () => false,
  isWalletAccountVerified: () => true,
}));

vi.mock("@/lib/protocol/reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocol/reads")>();
  return {
    ...actual,
    loadOpenSnapshot: vi.fn().mockResolvedValue({
      stockBalance: 1_000_000_00n,
      stockAllowance: 1_000_000_00n,
      availableCredit: 10_000_000_000n,
      oracleState: 0,
      estimatedPrincipal: 100_000n,
    }),
    loadPosition: vi.fn().mockResolvedValue({
      status: "open",
      tokenId: 42n,
      assetId: 3,
      stockAmount: 100_000_000n,
      principal: 0n,
      currentDebt: 0n,
      owner: "0x1234567890abcdef1234567890abcdef12345678",
      executor: "0x0000000000000000000000000000000000000000",
      thesis: "",
      nav: null,
      liquidatable: null,
    }),
  };
});

vi.mock("@/lib/protocol/public-client", () => ({
  createBasePublicClient: () => ({}),
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/convex/use-sync-position-transaction", () => ({
  useSyncPositionTransaction: () => vi.fn().mockResolvedValue("skipped"),
}));

import { MyPositionsPage } from "@/components/positions/my-positions-page";
import { PositionDetailPage } from "@/components/positions/position-detail-page";
import { AppShell } from "@/components/shell/app-shell";
import { loadPosition } from "@/lib/protocol/reads";
import CreatePositionPage from "@/app/create/page";

const CONNECTED_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as const;

function mockDisconnectedSession() {
  useWalletSessionMock.mockReturnValue({ kind: "disconnected" });
}

function mockConnectedSession() {
  useWalletSessionMock.mockReturnValue({
    kind: "connected",
    address: CONNECTED_ADDRESS,
  });
}

describe("portfolio-first app shell", () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue("/");
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    useOptionalConvexClientMock.mockReturnValue({});
    useGetWalletAccountsMock.mockReturnValue({ data: [] });
    mockDisconnectedSession();
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });
    useQueryMock.mockReturnValue(undefined);
    vi.mocked(loadPosition).mockClear();
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
    useQueryMock.mockReset();
    useOptionalConvexClientMock.mockReset();
    useWalletSessionMock.mockReset();
    useSearchParamsMock.mockReset();
    useGetWalletAccountsMock.mockReset();
  });

  it("exposes Portfolio, Explore, Create, Docs, and wallet state", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Portfolio" })).toHaveProperty(
      "href",
      expect.stringMatching(/\/$/)
    );
    expect(within(nav).getByRole("link", { name: "Explore" })).toHaveProperty(
      "href",
      expect.stringMatching(/\/positions$/)
    );
    expect(within(nav).getByRole("link", { name: "Create" })).toHaveProperty(
      "href",
      expect.stringMatching(/\/create$/)
    );
    expect(screen.getByRole("button", { name: "Connect" })).not.toBeNull();
  });

  it("links Docs and keeps one light theme on every route", () => {
    const { container, rerender } = render(<AppShell>page</AppShell>);
    expect(
      screen.getByRole("link", { name: "Docs" }).getAttribute("href")
    ).toBe("/docs");
    expect(
      screen
        .getByRole("link", { name: "Portfolio" })
        .getAttribute("aria-current")
    ).toBe("page");
    for (const path of [
      "/",
      "/create",
      "/positions",
      "/position/42",
      "/docs",
    ]) {
      usePathnameMock.mockReturnValue(path);
      rerender(<AppShell>page</AppShell>);
      expect(container.querySelector(".playful-theme")).not.toBeNull();
      expect(screen.getByRole("main").className).toBe("playful-main");
      expect(
        screen.getByRole("link", { name: "Docs" }).getAttribute("aria-current")
      ).toBe(path === "/docs" ? "page" : null);
    }
  });

  it("keeps first-page loading distinct from an empty portfolio", () => {
    mockConnectedSession();
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    });
    render(<MyPositionsPage />);
    expect(screen.getByText("Loading positions…")).not.toBeNull();
    expect(screen.queryByText("Your portfolio is empty")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("preserves owner filtering and pagination on a populated portfolio", () => {
    mockConnectedSession();
    const loadMore = vi.fn();
    usePaginatedQueryMock.mockReturnValue({
      results: [
        {
          tokenId: "1",
          assetId: 1,
          owner: CONNECTED_ADDRESS,
          status: "active",
        },
      ],
      status: "CanLoadMore",
      loadMore,
    });
    const { container } = render(<MyPositionsPage />);
    expect(container.querySelector(".position-card")).not.toBeNull();
    expect(container.querySelector(".explore-grid")).toBeNull();
    expect(usePaginatedQueryMock.mock.calls.at(-1)?.[1]).toEqual({
      owner: CONNECTED_ADDRESS,
      status: "active",
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledWith(20);
    expect(screen.queryByText("Collect puppies")).toBeNull();
    expect(screen.queryByText("Your portfolio is empty")).toBeNull();
  });

  it("offers retry without showing the empty welcome when the portfolio query fails", () => {
    mockConnectedSession();
    usePaginatedQueryMock.mockImplementation(() => {
      throw new Error("Index unavailable");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      render(<MyPositionsPage />);
      expect(screen.queryByText("Your portfolio is empty")).toBeNull();
      usePaginatedQueryMock.mockReturnValue({
        results: [],
        status: "Exhausted",
        loadMore: vi.fn(),
      });
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(
        screen.getByRole("heading", { name: "Your portfolio is empty" })
      ).not.toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not show the empty-portfolio copy when disconnected", () => {
    mockDisconnectedSession();
    render(<MyPositionsPage />);

    expect(
      screen.getByText(
        "Connect your wallet to see your portfolio and start collecting puppies."
      )
    ).not.toBeNull();
    expect(screen.queryByText("Your portfolio is empty")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open a Position" })
    ).not.toBeNull();
  });

  it("shows init failure instead of connecting spinner", () => {
    useWalletSessionMock.mockReturnValue({
      kind: "failed",
      message: "Project settings unavailable",
    });

    render(<MyPositionsPage />);

    expect(screen.getByText("Project settings unavailable")).not.toBeNull();
    expect(screen.queryByText("Connecting wallet…")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open a Position" })
    ).not.toBeNull();
  });

  it("shows index unavailable with CTA when connected without Convex", () => {
    mockConnectedSession();
    useOptionalConvexClientMock.mockReturnValue(null);

    render(<MyPositionsPage />);

    expect(screen.getByText("NEXT_PUBLIC_CONVEX_URL")).not.toBeNull();
    expect(screen.getByText(/to load your portfolio/)).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Open a Position" })
    ).not.toBeNull();
  });

  it("shows empty portfolio CTA when connected with no positions", () => {
    mockConnectedSession();
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    render(<MyPositionsPage />);

    expect(screen.getByText("Your portfolio is empty")).not.toBeNull();
    const cta = screen.getByRole("link", { name: "Open a Position" });
    expect(cta).toHaveProperty("href", expect.stringMatching(/\/create$/));
  });

  it("renders multiple position cards linking to detail", () => {
    mockConnectedSession();
    usePaginatedQueryMock.mockReturnValue({
      results: [
        {
          tokenId: "1",
          assetId: 1,
          owner: CONNECTED_ADDRESS,
          status: "active",
        },
        {
          tokenId: "2",
          assetId: 2,
          owner: CONNECTED_ADDRESS,
          status: "active",
        },
      ],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    render(<MyPositionsPage />);

    expect(screen.getByText("NVDAc")).not.toBeNull();
    expect(screen.getByText("AAPLc")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Token #1/ })).toHaveProperty(
      "href",
      expect.stringMatching(/\/position\/1$/)
    );
    expect(screen.getByRole("link", { name: /Token #2/ })).toHaveProperty(
      "href",
      expect.stringMatching(/\/position\/2$/)
    );
    expect(
      screen.queryByText("Close the current position before opening another.")
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();

    // Card artwork must stay lifecycle-driven. Explore pays for live health
    // per card; the portfolio makes neither the Base read nor the metadata
    // fetch behind it, however many positions a wallet holds.
    expect(loadPosition).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    // Thumbnails are decorative (the ticker and status are already text), so
    // they are queried from the DOM rather than the accessibility tree.
    const thumbnails = Array.from(document.querySelectorAll("img")).map((img) =>
      decodeURIComponent(img.getAttribute("src") ?? "")
    );
    expect(thumbnails).toEqual([
      expect.stringContaining("/logos/nvda.png"),
      expect.stringContaining("/logos/aapl.png"),
    ]);
  });

  it("create page has Open without repay, close, or Approve", () => {
    mockConnectedSession();
    useGetWalletAccountsMock.mockReturnValue({
      data: [{ chain: "EVM", key: "test-account" }],
    });
    render(<CreatePositionPage />);

    expect(
      screen.getByRole("heading", { name: "Create a Position" })
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /^Create Position$/i })
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Approve/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();
  });

  it("detail page shows indexed identity without inventing a missing token", () => {
    useQueryMock.mockReturnValue({
      tokenId: "42",
      assetId: 3,
      owner: CONNECTED_ADDRESS,
      status: "closed",
    });

    const { rerender } = render(<PositionDetailPage tokenId="42" />);

    expect(screen.getByText("METAc")).not.toBeNull();
    expect(screen.getByText("Token #42")).not.toBeNull();
    expect(screen.getByText("Closed")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();

    useQueryMock.mockReturnValue(null);
    rerender(<PositionDetailPage tokenId="999" />);
    expect(screen.getByText(/not in the index yet/i)).not.toBeNull();
  });

  it("shows an indexing state when opened=42 is not yet in Convex results", () => {
    mockConnectedSession();
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    render(<MyPositionsPage openedTokenId="42" />);

    expect(screen.getByText("Indexing Position #42…")).not.toBeNull();
    expect(screen.queryByText("Your portfolio is empty")).toBeNull();
    expect(screen.queryByRole("link", { name: /Token #42/ })).toBeNull();
  });

  it("highlights Position #42 when it appears in Convex results", () => {
    mockConnectedSession();
    usePaginatedQueryMock.mockReturnValue({
      results: [
        {
          tokenId: "42",
          assetId: 1,
          owner: CONNECTED_ADDRESS,
          status: "active",
        },
        {
          tokenId: "1",
          assetId: 2,
          owner: CONNECTED_ADDRESS,
          status: "active",
        },
      ],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    render(<MyPositionsPage openedTokenId="42" />);

    expect(screen.queryByText(/Indexing Position #42/)).toBeNull();
    expect(
      screen
        .getByRole("link", { name: /Token #42/ })
        .getAttribute("data-highlighted")
    ).toBe("true");
    expect(
      screen
        .getByRole("link", { name: /Token #1/ })
        .getAttribute("data-highlighted")
    ).toBeNull();
  });
});
