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
const useInitStatusMock = vi.hoisted(() => vi.fn());
const useGetWalletAccountsMock = vi.hoisted(() => vi.fn());

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
  WalletProviders: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@dynamic-labs-sdk/react-hooks", () => ({
  useInitStatus: useInitStatusMock,
  useGetWalletAccounts: useGetWalletAccountsMock,
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

const CONNECTED_ACCOUNT = {
  id: "account-1",
  chain: "EVM",
  address: "0x1234567890abcdef1234567890abcdef12345678",
  lastSelectedAt: null,
  verifiedCredentialId: null,
  walletProviderKey: "metamaskevm",
};

function mockConnectedWallet() {
  useInitStatusMock.mockReturnValue({ data: "finished", error: null });
  useGetWalletAccountsMock.mockReturnValue({ data: [CONNECTED_ACCOUNT] });
}

function mockDisconnectedWallet() {
  useInitStatusMock.mockReturnValue({ data: "finished", error: null });
  useGetWalletAccountsMock.mockReturnValue({ data: [] });
}

describe("portfolio-first app shell", () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue("/");
    useOptionalConvexClientMock.mockReturnValue({});
    mockDisconnectedWallet();
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });
    useQueryMock.mockReturnValue(undefined);
    vi.stubEnv("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID", "test-env");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    usePaginatedQueryMock.mockReset();
    useQueryMock.mockReset();
    useOptionalConvexClientMock.mockReset();
    useInitStatusMock.mockReset();
    useGetWalletAccountsMock.mockReset();
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
    mockDisconnectedWallet();
    render(<MyPositionsPage />);

    expect(
      screen.getByText("Connect a wallet to see your Position NFTs.")
    ).not.toBeNull();
    expect(screen.queryByText("You don't have any positions yet.")).toBeNull();
  });

  it("shows empty portfolio CTA when connected with no positions", () => {
    mockConnectedWallet();
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
    mockConnectedWallet();
    usePaginatedQueryMock.mockReturnValue({
      results: [
        {
          tokenId: "1",
          assetId: 1,
          owner: CONNECTED_ACCOUNT.address,
          status: "active",
        },
        {
          tokenId: "2",
          assetId: 2,
          owner: CONNECTED_ACCOUNT.address,
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

  it("pairs asset filter with active status when lifecycle is All", () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    render(<AllPositionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "NVDAc" }));

    const lastCall = usePaginatedQueryMock.mock.calls.at(-1);
    expect(lastCall?.[1]).toEqual({ status: "active", assetId: 1 });
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
      owner: CONNECTED_ACCOUNT.address,
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
