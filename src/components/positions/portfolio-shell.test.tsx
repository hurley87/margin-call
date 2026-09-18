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
const usePaginatedQueryMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useOptionalConvexClientMock = vi.hoisted(() => vi.fn());
const useWalletSessionMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
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
  useGetWalletAccounts: () => ({ data: [] }),
  useGetAvailableWalletProvidersData: () => ({ data: [] }),
  useConnectAndVerifyWithWalletProvider: () => ({
    mutate: vi.fn(),
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
}));

import { AllPositionsPage } from "@/components/positions/all-positions-page";
import { MyPositionsPage } from "@/components/positions/my-positions-page";
import { PositionDetailStub } from "@/components/positions/position-detail-stub";
import { AppShell } from "@/components/shell/app-shell";
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
    useOptionalConvexClientMock.mockReturnValue({});
    mockDisconnectedSession();
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });
    useQueryMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    cleanup();
    usePaginatedQueryMock.mockReset();
    useQueryMock.mockReset();
    useOptionalConvexClientMock.mockReset();
    useWalletSessionMock.mockReset();
  });

  it("exposes My Positions, All Positions, Open Position, and wallet state", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(nav).getByRole("link", { name: "My Positions" })
    ).toHaveProperty("href", expect.stringMatching(/\/$/));
    expect(
      within(nav).getByRole("link", { name: "All Positions" })
    ).toHaveProperty("href", expect.stringMatching(/\/positions$/));
    expect(
      within(nav).getByRole("link", { name: "Open Position" })
    ).toHaveProperty("href", expect.stringMatching(/\/create$/));
    expect(screen.getByRole("button", { name: "Connect" })).not.toBeNull();
  });

  it("does not show the empty-portfolio copy when disconnected", () => {
    mockDisconnectedSession();
    render(<MyPositionsPage />);

    expect(
      screen.getByText("Connect a wallet to see your Position NFTs.")
    ).not.toBeNull();
    expect(screen.queryByText("You don't have any positions yet.")).toBeNull();
    expect(
      screen.getByRole("link", { name: "+ Open Position" })
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
      screen.getByRole("link", { name: "+ Open Position" })
    ).not.toBeNull();
  });

  it("shows index unavailable with CTA when connected without Convex", () => {
    mockConnectedSession();
    useOptionalConvexClientMock.mockReturnValue(null);

    render(<MyPositionsPage />);

    expect(screen.getByText("NEXT_PUBLIC_CONVEX_URL")).not.toBeNull();
    expect(screen.getByText(/to load your portfolio/)).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "+ Open Position" })
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

    expect(
      screen.getByText("You don't have any positions yet.")
    ).not.toBeNull();
    const cta = screen.getByRole("link", { name: "+ Open Position" });
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

  it("create placeholder has no repay or close controls", () => {
    render(<CreatePositionPage />);

    expect(
      screen.getByRole("heading", { name: "Open Position" })
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve/i })).toBeNull();
  });

  it("detail stub shows indexed identity and not-found without actions", () => {
    useQueryMock.mockReturnValue({
      tokenId: "42",
      assetId: 3,
      owner: CONNECTED_ADDRESS,
      status: "active",
    });

    const { rerender } = render(<PositionDetailStub tokenId="42" />);

    expect(screen.getByText("METAc")).not.toBeNull();
    expect(screen.getByText("Token #42")).not.toBeNull();
    expect(screen.getByText("Active")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();

    useQueryMock.mockReturnValue(null);
    rerender(<PositionDetailStub tokenId="999" />);
    expect(screen.getByText("Position not found")).not.toBeNull();
  });
});
