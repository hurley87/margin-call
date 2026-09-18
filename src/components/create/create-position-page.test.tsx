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

  it("shows stock, amount, leverage, and Open without repay/close or Approve", async () => {
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
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();
  });

  it("previews the healthy artwork for the selected stock", async () => {
    render(<CreatePositionPage />);

    const preview = await screen.findByAltText("NVDAc Position NFT preview");

    // `next/image` wraps the path in its optimizer query, so decode before asserting.
    // Every open mints healthy, so the preview is honest without a risk read.
    expect(decodeURIComponent(preview.getAttribute("src") ?? "")).toContain(
      "/nvda/healthy.png"
    );
  });

  it("opens with an empty thesis when the field is untouched", async () => {
    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toHaveProperty(
        "disabled",
        false
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(runOpenPositionFlowMock).toHaveBeenCalledWith(
        expect.objectContaining({ thesis: "" })
      );
    });
  });

  it("sends the thesis with the same open transaction", async () => {
    render(<CreatePositionPage />);

    const field = await screen.findByPlaceholderText(/Why this position/);
    fireEvent.change(field, { target: { value: "Long the puppy." } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toHaveProperty(
        "disabled",
        false
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(runOpenPositionFlowMock).toHaveBeenCalledWith(
        expect.objectContaining({ thesis: "Long the puppy." })
      );
    });
  });

  it("counts UTF-8 bytes, not characters, and blocks an over-long thesis", async () => {
    render(<CreatePositionPage />);

    const field = await screen.findByPlaceholderText(/Why this position/);

    // 70 four-byte emoji are 70 characters but 280 bytes: exactly at the limit.
    fireEvent.change(field, { target: { value: "🐶".repeat(70) } });
    expect(screen.getByText("280/280 bytes")).not.toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toHaveProperty(
        "disabled",
        false
      );
    });

    fireEvent.change(field, { target: { value: "🐶".repeat(71) } });
    expect(screen.getByText(/284\/280 bytes/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open" })).toHaveProperty(
      "disabled",
      true
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(runOpenPositionFlowMock).not.toHaveBeenCalled();
  });

  it("redirects to /?opened=tokenId and syncs hash after a successful open", async () => {
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
    expect(useRouterPushMock).toHaveBeenCalledWith("/?opened=42");
  });

  it("still redirects when Convex sync is pending", async () => {
    syncPositionTxMock.mockReturnValue(new Promise(() => undefined));
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

    expect(syncPositionTxMock).toHaveBeenCalledWith(OPEN_HASH);
  });

  it("still redirects when Convex sync is skipped or fails", async () => {
    syncPositionTxMock.mockResolvedValueOnce("skipped");
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

    cleanup();
    useRouterPushMock.mockReset();
    syncPositionTxMock.mockRejectedValueOnce(new Error("index unavailable"));

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
