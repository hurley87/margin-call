// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useWalletSessionMock = vi.hoisted(() => vi.fn());
const useGetWalletAccountsMock = vi.hoisted(() => vi.fn());
const useGetActiveNetworkIdMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useOptionalConvexClientMock = vi.hoisted(() => vi.fn());
const resolveBaseWalletClientMock = vi.hoisted(() => vi.fn());
const loadPositionMock = vi.hoisted(() => vi.fn());
const runRepayAllFlowMock = vi.hoisted(() => vi.fn());
const runClosePositionFlowMock = vi.hoisted(() => vi.fn());
const syncPositionTxMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
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
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@/components/providers/convex-client-provider", () => ({
  useOptionalConvexClient: useOptionalConvexClientMock,
}));

vi.mock("@/components/wallet/wallet-providers", () => ({
  useWalletSession: useWalletSessionMock,
}));

vi.mock("@dynamic-labs-sdk/react-hooks", () => ({
  useGetWalletAccounts: useGetWalletAccountsMock,
  useGetActiveNetworkId: useGetActiveNetworkIdMock,
}));

vi.mock("@dynamic-labs-sdk/evm", () => ({
  isEvmWalletAccount: (account: { chain: string }) => account.chain === "EVM",
}));

vi.mock("@/lib/dynamic/resolve-wallet-client", () => ({
  resolveBaseWalletClient: resolveBaseWalletClientMock,
  parseNetworkIdToChainId: (networkId: string | null | undefined) => {
    if (networkId == null) return null;
    const match = /^eip155:(\d+)$/i.exec(networkId);
    return match?.[1] ? Number(match[1]) : null;
  },
}));

vi.mock("@/lib/protocol/public-client", () => ({
  createBasePublicClient: () => ({}),
}));

vi.mock("@/lib/protocol/reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocol/reads")>();
  return {
    ...actual,
    loadPosition: loadPositionMock,
  };
});

vi.mock("@/lib/protocol/manage-flow", () => ({
  runRepayAllFlow: runRepayAllFlowMock,
  runClosePositionFlow: runClosePositionFlowMock,
}));

vi.mock("@/lib/convex/use-sync-position-transaction", () => ({
  useSyncPositionTransaction: () => syncPositionTxMock,
}));

import { PositionDetailPage } from "@/components/positions/position-detail-page";
import type { OpenPosition } from "@/lib/protocol/reads";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678" as const;
const EXECUTOR = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
const STRANGER = "0x1111111111111111111111111111111111111111" as const;
const CLOSE_HASH =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const REPAY_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const EVM_ACCOUNT = { chain: "EVM", key: "test" } as const;

function indexed(overrides: Record<string, unknown> = {}) {
  return {
    tokenId: "42",
    assetId: 3,
    owner: OWNER,
    status: "active",
    ...overrides,
  };
}

function live(overrides: Partial<OpenPosition> = {}): OpenPosition {
  return {
    status: "open",
    tokenId: 42n,
    assetId: 3,
    stockAmount: 100_000_000n,
    principal: 250_000n,
    currentDebt: 250_000n,
    owner: OWNER,
    executor: EXECUTOR,
    nav: 1_250_000n,
    liquidatable: false,
    ...overrides,
  };
}

function mockConnected(address: `0x${string}` = OWNER) {
  useWalletSessionMock.mockReturnValue({ kind: "connected", address });
  useGetWalletAccountsMock.mockReturnValue({ data: [EVM_ACCOUNT] });
  useGetActiveNetworkIdMock.mockReturnValue({
    data: { networkId: "eip155:8453" },
  });
  resolveBaseWalletClientMock.mockReturnValue({
    account: { address },
    request: vi.fn(),
  });
}

describe("PositionDetailPage", () => {
  beforeEach(() => {
    useOptionalConvexClientMock.mockReturnValue({});
    useWalletSessionMock.mockReturnValue({ kind: "disconnected" });
    useGetWalletAccountsMock.mockReturnValue({ data: [] });
    useGetActiveNetworkIdMock.mockReturnValue({
      data: { networkId: "eip155:8453" },
    });
    useQueryMock.mockReturnValue(undefined);
    loadPositionMock.mockResolvedValue(live());
    runRepayAllFlowMock.mockResolvedValue({
      position: live({ currentDebt: 0n, principal: 0n }),
      hash: REPAY_HASH,
    });
    runClosePositionFlowMock.mockResolvedValue({
      tokenId: 42n,
      hash: CLOSE_HASH,
    });
    syncPositionTxMock.mockResolvedValue("synced");
    resolveBaseWalletClientMock.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an indexing state when Convex has not stored the token yet", () => {
    useQueryMock.mockReturnValue(null);
    render(<PositionDetailPage tokenId="42" />);

    expect(screen.getByText(/not in the index yet/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(loadPositionMock).not.toHaveBeenCalled();
  });

  it("renders closed positions from indexed metadata without live financials", () => {
    useQueryMock.mockReturnValue(
      indexed({ status: "closed", terminalTxHash: CLOSE_HASH })
    );
    render(<PositionDetailPage tokenId="42" />);

    expect(screen.getByText("Closed")).not.toBeNull();
    expect(screen.getByText("METAc")).not.toBeNull();
    expect(screen.queryByText(/Current debt/i)).toBeNull();
    expect(screen.queryByText(/NAV/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();
    expect(loadPositionMock).not.toHaveBeenCalled();
  });

  it("renders liquidated positions as a read-only terminal view", () => {
    useQueryMock.mockReturnValue(indexed({ status: "liquidated" }));
    render(<PositionDetailPage tokenId="42" />);

    expect(screen.getByText("Liquidated")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();
    expect(loadPositionMock).not.toHaveBeenCalled();
  });

  it("treats a token burned on Base as closed while the index still says active", async () => {
    useQueryMock.mockReturnValue(indexed());
    loadPositionMock.mockResolvedValue({ status: "closed", tokenId: 42n });
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByText("Closed")).not.toBeNull();
    });

    expect(screen.queryByText(/Couldn't read live Base state/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();
  });

  it("surfaces a failed Base read instead of inventing a lifecycle state", async () => {
    useQueryMock.mockReturnValue(indexed());
    loadPositionMock.mockRejectedValue(new Error("HTTP request failed"));
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByText(/HTTP request failed/i)).not.toBeNull();
    });

    expect(screen.queryByText("Closed")).toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
  });

  it("reads live Base owner, stock, debt, NAV, and leverage for an active position", async () => {
    useQueryMock.mockReturnValue(indexed({ owner: STRANGER }));
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByText("1.25x")).not.toBeNull();
    });

    expect(loadPositionMock).toHaveBeenCalledWith(expect.anything(), 42n);
    expect(screen.getByText("METAc")).not.toBeNull();
    expect(screen.getByText("Token #42")).not.toBeNull();
    expect(screen.getByText("Current debt")).not.toBeNull();
    expect(screen.getByText("1")).not.toBeNull();
    expect(screen.getByText("1.25 USDC")).not.toBeNull();
    expect(screen.getByText("1.25x")).not.toBeNull();
    expect(
      screen.getByText(OWNER.slice(0, 6), { exact: false })
    ).not.toBeNull();
    expect(screen.queryByText("Pricing unavailable")).toBeNull();
  });

  it("does not present NAV as current when pricing is unavailable", async () => {
    useQueryMock.mockReturnValue(indexed());
    loadPositionMock.mockResolvedValue(live({ nav: null, liquidatable: null }));
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByText("Pricing unavailable")).not.toBeNull();
    });

    expect(screen.queryByText("Liquidatable")).toBeNull();
    expect(screen.queryByText("1.25x")).toBeNull();
  });

  it("hides repay and close from a connected wallet that is not owner or executor", async () => {
    useQueryMock.mockReturnValue(indexed());
    mockConnected(STRANGER);
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByText("1.25x")).not.toBeNull();
    });

    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();
  });

  it("enables Repay all and keeps Close disabled while Base debt is outstanding", async () => {
    useQueryMock.mockReturnValue(indexed());
    mockConnected(OWNER);
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Repay all" })).toHaveProperty(
        "disabled",
        false
      );
    });

    expect(screen.getByRole("button", { name: "Close" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("enables Close and disables Repay all when a fresh Base read reports zero debt", async () => {
    useQueryMock.mockReturnValue(indexed());
    mockConnected(OWNER);
    loadPositionMock.mockResolvedValue(
      live({ currentDebt: 0n, principal: 0n, nav: 1_000_000n })
    );
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toHaveProperty(
        "disabled",
        false
      );
    });

    expect(screen.getByRole("button", { name: "Repay all" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("lets the executor repay but not close", async () => {
    useQueryMock.mockReturnValue(indexed());
    mockConnected(EXECUTOR);
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Repay all" })).toHaveProperty(
        "disabled",
        false
      );
    });

    expect(screen.getByRole("button", { name: "Close" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("re-reads Base after repay and does not sync Convex", async () => {
    useQueryMock.mockReturnValue(indexed());
    mockConnected(OWNER);
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Repay all" })).toHaveProperty(
        "disabled",
        false
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Repay all" }));

    await waitFor(() => {
      expect(runRepayAllFlowMock).toHaveBeenCalled();
    });

    expect(syncPositionTxMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toHaveProperty(
        "disabled",
        false
      );
    });
  });

  it("syncs the close receipt and shows a terminal state even if Convex is pending", async () => {
    useQueryMock.mockReturnValue(indexed());
    mockConnected(OWNER);
    loadPositionMock.mockResolvedValue(
      live({ currentDebt: 0n, principal: 0n, nav: 1_000_000n })
    );
    syncPositionTxMock.mockResolvedValue("pending");
    render(<PositionDetailPage tokenId="42" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toHaveProperty(
        "disabled",
        false
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.getByText("Closed")).not.toBeNull();
    });

    expect(runClosePositionFlowMock).toHaveBeenCalled();
    expect(syncPositionTxMock).toHaveBeenCalledWith(CLOSE_HASH);
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Close$/ })).toBeNull();
    expect(screen.getByRole("link", { name: /My Positions/i })).not.toBeNull();
  });
});
