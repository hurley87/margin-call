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

vi.mock("@/lib/convex/use-sync-position-transaction", () => ({
  useSyncPositionTransaction: () => vi.fn().mockResolvedValue("skipped"),
}));

import { AllPositionsPage } from "@/components/positions/all-positions-page";
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

  it("links Docs and scopes the light content theme to the homepage", () => {
    const { container, rerender } = render(<AppShell>page</AppShell>);
    expect(
      screen.getByRole("link", { name: "Docs" }).getAttribute("href")
    ).toBe("https://margin-call.gitbook.io/product-docs");
    expect(
      screen
        .getByRole("link", { name: "Portfolio" })
        .getAttribute("aria-current")
    ).toBe("page");
    expect(container.querySelector(".portfolio-home")).not.toBeNull();
    for (const path of ["/positions", "/position/42"]) {
      usePathnameMock.mockReturnValue(path);
      rerender(<AppShell>page</AppShell>);
      expect(container.querySelector(".portfolio-home")).toBeNull();
      expect(screen.getByRole("main").className).toContain("max-w-3xl");
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
    render(<MyPositionsPage />);
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

    // Card artwork must stay lifecycle-driven: live health here would cost one
    // Base read per card, which is exactly what this page refuses to do.
    expect(loadPosition).not.toHaveBeenCalled();
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

  it("filters All Positions by lifecycle without live RPC fields", () => {
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

    expect(usePaginatedQueryMock).toHaveBeenCalled();
    const lastCall = usePaginatedQueryMock.mock.calls.at(-1);
    expect(lastCall?.[1]).toEqual({ status: "closed" });

    expect(screen.getByText("Token #9")).not.toBeNull();
    expect(screen.getByText(/Owner/)).not.toBeNull();
    expect(screen.queryByText(/NAV/i)).toBeNull();
    expect(screen.queryByText(/debt/i)).toBeNull();
    expect(loadPosition).not.toHaveBeenCalled();
  });

  it("requires a status before asset chips can be selected", () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

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

    const lastCall = usePaginatedQueryMock.mock.calls.at(-1);
    expect(lastCall?.[1]).toEqual({ status: "active", assetId: 1 });
    expect(
      screen.queryByText("Choose a status to filter by asset.")
    ).toBeNull();
  });

  it("keeps the list in-shell when a Convex query throws", () => {
    usePaginatedQueryMock.mockImplementation(() => {
      throw new Error("Convex query failed");
    });

    render(<AllPositionsPage />);

    expect(
      screen.getByText(/Couldn't load positions from the index/)
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "All Positions" })
    ).not.toBeNull();
    expect(screen.queryByText(/circuit breaker/i)).toBeNull();
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
