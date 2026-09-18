// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useRouterPushMock = vi.hoisted(() => vi.fn());
const useWalletSessionMock = vi.hoisted(() => vi.fn());
const useGetWalletAccountsMock = vi.hoisted(() => vi.fn());
const useGetActiveNetworkIdMock = vi.hoisted(() => vi.fn());
const resolveBaseWalletClientMock = vi.hoisted(() => vi.fn());
const loadOpenSnapshotMock = vi.hoisted(() => vi.fn());
const runOpenPositionFlowMock = vi.hoisted(() => vi.fn());
const approveUnlimitedMock = vi.hoisted(() => vi.fn());
const syncPositionTxMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: useRouterPushMock }),
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
  assertWalletOnBase: vi.fn(),
}));

vi.mock("@/lib/protocol/public-client", () => ({
  createBasePublicClient: () => ({}),
}));

vi.mock("@/lib/protocol/reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocol/reads")>();
  return {
    ...actual,
    loadOpenSnapshot: loadOpenSnapshotMock,
  };
});

vi.mock("@/lib/protocol/open-flow", () => ({
  runOpenPositionFlow: runOpenPositionFlowMock,
}));

vi.mock("@/lib/protocol/writes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocol/writes")>();
  return {
    ...actual,
    approveUnlimited: approveUnlimitedMock,
  };
});

vi.mock("@/lib/convex/use-sync-position-transaction", () => ({
  useSyncPositionTransaction: () => syncPositionTxMock,
}));

import { CreatePositionPage } from "@/components/create/create-position-page";
import { ORACLE_STATE } from "@/lib/protocol/constants";

const CONNECTED_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as const;
const OPEN_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

const EVM_ACCOUNT = {
  chain: "EVM",
  key: "test",
} as const;

describe("CreatePositionPage", () => {
  beforeEach(() => {
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: CONNECTED_ADDRESS,
    });
    useGetWalletAccountsMock.mockReturnValue({ data: [EVM_ACCOUNT] });
    useGetActiveNetworkIdMock.mockReturnValue({
      data: { networkId: "eip155:8453" },
    });
    resolveBaseWalletClientMock.mockReturnValue({
      account: { address: CONNECTED_ADDRESS },
      request: vi.fn(),
    });
    loadOpenSnapshotMock.mockResolvedValue({
      stockBalance: 1_000_000_00n,
      stockAllowance: 1_000_000_00n,
      availableCredit: 10_000_000_000n,
      oracleState: ORACLE_STATE.LIVE,
      estimatedPrincipal: 100_000n,
    });
    runOpenPositionFlowMock.mockResolvedValue({
      tokenId: 42n,
      hash: OPEN_HASH,
    });
    syncPositionTxMock.mockResolvedValue("synced");
    approveUnlimitedMock.mockResolvedValue({ transactionHash: OPEN_HASH });
    useRouterPushMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("asks to connect when disconnected", () => {
    useWalletSessionMock.mockReturnValue({ kind: "disconnected" });
    render(<CreatePositionPage />);

    expect(
      screen.getByText("Connect a wallet to open a Position NFT.")
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });

  it("shows stock, amount, leverage, Approve, and Open without repay/close", async () => {
    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).not.toBeNull();
    });

    expect(
      screen.getByRole("heading", { name: "Open Position" })
    ).not.toBeNull();
    expect(screen.getByText("Stock")).not.toBeNull();
    expect(screen.getByText("Stock amount")).not.toBeNull();
    expect(screen.getByText("Leverage")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();
    expect(
      screen.queryByText("Close the current position before opening another.")
    ).toBeNull();
  });

  it("stays usable when the wallet already owns other positions", async () => {
    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toHaveProperty(
        "disabled",
        false
      );
    });

    expect(
      screen.queryByText(/Close the current position before opening another/)
    ).toBeNull();
  });

  it("redirects to /?opened=tokenId and syncs hash only after a successful open", async () => {
    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toHaveProperty(
        "disabled",
        false
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(runOpenPositionFlowMock).toHaveBeenCalled();
    });

    expect(syncPositionTxMock).toHaveBeenCalledWith(OPEN_HASH);
    expect(syncPositionTxMock.mock.calls[0]?.[0]).toBe(OPEN_HASH);
    expect(useRouterPushMock).toHaveBeenCalledWith("/?opened=42");
  });

  it("still redirects when Convex sync is pending", async () => {
    syncPositionTxMock.mockResolvedValue("pending");
    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toHaveProperty(
        "disabled",
        false
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(useRouterPushMock).toHaveBeenCalledWith("/?opened=42");
    });

    expect(screen.queryByText(/Open position failed/i)).toBeNull();
  });

  it("still redirects when Convex sync is skipped", async () => {
    syncPositionTxMock.mockResolvedValue("skipped");
    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toHaveProperty(
        "disabled",
        false
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(useRouterPushMock).toHaveBeenCalledWith("/?opened=42");
    });
  });
});
