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
const switchWalletToBaseMock = vi.hoisted(() => vi.fn());
const isProgrammaticNetworkSwitchAvailableMock = vi.hoisted(() => vi.fn());

vi.mock("@dynamic-labs-sdk/client", () => ({
  isProgrammaticNetworkSwitchAvailable:
    isProgrammaticNetworkSwitchAvailableMock,
}));

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
  switchWalletToBase: switchWalletToBaseMock,
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
import { ORACLE_STATE, SPOT_LEVERAGE } from "@/lib/protocol/constants";
import { baseDeployment, getAssetByName } from "@/lib/protocol/deployment";

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
    switchWalletToBaseMock.mockResolvedValue(undefined);
    isProgrammaticNetworkSwitchAvailableMock.mockReturnValue(true);
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
    expect(
      screen.getByRole("button", { name: "Create Position" })
    ).toHaveProperty("disabled", true);
  });

  it("copies the selected stock token address", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<CreatePositionPage />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Copy NVDAc token address" })[0]!
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(getAssetByName("NVDAc").stock);
    });

    fireEvent.click(screen.getByRole("radio", { name: "AAPLc" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Copy AAPLc token address" })[0]!
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(getAssetByName("AAPLc").stock);
    });
  });

  it("shows stock, amount, leverage, and Open without repay/close or Approve", async () => {
    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).not.toBeNull();
    });

    expect(
      screen.getByRole("heading", { name: "Create a Position" })
    ).not.toBeNull();
    expect(screen.getByRole("radio", { name: "NVDAc" })).not.toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Stock amount" })
    ).not.toBeNull();
    expect(screen.getByText("Leverage")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Repay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close/i })).toBeNull();
  });

  it("allows stock and leverage selection before connecting without issuing reads", () => {
    useWalletSessionMock.mockReturnValue({ kind: "disconnected" });
    render(<CreatePositionPage />);
    fireEvent.click(screen.getByRole("radio", { name: "METAc" }));
    fireEvent.click(screen.getByRole("radio", { name: "1.5x" }));
    expect(screen.getByRole("radio", { name: "METAc" })).toHaveProperty(
      "checked",
      true
    );
    expect(screen.getByRole("radio", { name: "1.5x" })).toHaveProperty(
      "checked",
      true
    );
    for (const [alt, face] of [
      ["METAc Position NFT preview", "healthy"],
      ["META watching artwork", "warning"],
      ["META at risk artwork", "danger"],
      ["META liquidated artwork", "liquidated"],
    ]) {
      expect(
        decodeURIComponent(screen.getByAltText(alt).getAttribute("src") ?? "")
      ).toContain(`/meta/${face}.png`);
    }
    expect(screen.getByRole("button", { name: "Max" })).toHaveProperty(
      "disabled",
      true
    );
    expect(
      screen.getByRole("button", { name: "Create Position" })
    ).toHaveProperty("disabled", true);
    expect(loadOpenSnapshotMock).not.toHaveBeenCalled();
    expect(runOpenPositionFlowMock).not.toHaveBeenCalled();
  });

  it("keeps a draft when the wallet connects", async () => {
    useWalletSessionMock.mockReturnValue({ kind: "disconnected" });
    const { rerender } = render(<CreatePositionPage />);
    fireEvent.click(screen.getByRole("radio", { name: "AAPLc" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Stock amount" }), {
      target: { value: "0.12345678" },
    });
    useWalletSessionMock.mockReturnValue({
      kind: "connected",
      address: CONNECTED_ADDRESS,
    });
    rerender(<CreatePositionPage />);
    await waitFor(() =>
      expect(loadOpenSnapshotMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          asset: expect.objectContaining({ name: "AAPLc" }),
          stockAmount: 12345678n,
        })
      )
    );
    expect(
      screen.getByRole("textbox", { name: "Stock amount" })
    ).toHaveProperty("value", "0.12345678");
  });

  it("uses the exact balance for Max and suppresses stale quotes on stock change", async () => {
    loadOpenSnapshotMock.mockResolvedValueOnce({
      stockBalance: 123456789n,
      stockAllowance: 0n,
      availableCredit: 10000000000n,
      oracleState: ORACLE_STATE.LIVE,
      estimatedPrincipal: 100000n,
      contributionValue: 400000n,
    });
    render(<CreatePositionPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Max" })).toHaveProperty(
        "disabled",
        false
      )
    );
    expect(
      screen.getByText(/Estimated position value: 0.5 USDC/)
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(
      screen.getByRole("textbox", { name: "Stock amount" })
    ).toHaveProperty("value", "1.23456789");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Max" })).toHaveProperty(
        "disabled",
        false
      )
    );
    loadOpenSnapshotMock.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("radio", { name: "GOOGLc" }));
    expect(screen.getByRole("button", { name: "Max" })).toHaveProperty(
      "disabled",
      true
    );
    expect(
      screen.getByRole("button", { name: "Create Position" })
    ).toHaveProperty("disabled", true);
    expect(screen.queryByText(/Estimated position value: 0.5 USDC/)).toBeNull();
  });

  it("can retry a failed quote without enabling creation early", async () => {
    loadOpenSnapshotMock.mockRejectedValueOnce(new Error("RPC unavailable"));
    render(<CreatePositionPage />);
    const retry = await screen.findByRole("button", { name: "Retry quote" });
    expect(
      screen.getByRole("button", { name: "Create Position" })
    ).toHaveProperty("disabled", true);
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false)
    );
  });

  it("leaves Uniswap out of the way when the balance covers the amount", async () => {
    render(<CreatePositionPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false)
    );
    expect(screen.queryByRole("link", { name: /Buy/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Refresh balance" })
    ).toBeNull();
  });

  it("offers a Uniswap hand-off for the stock the wallet does not hold", async () => {
    loadOpenSnapshotMock.mockResolvedValue({
      stockBalance: 0n,
      stockAllowance: 0n,
      availableCredit: 10_000_000_000n,
      oracleState: ORACLE_STATE.LIVE,
      estimatedPrincipal: 100_000n,
    });
    render(<CreatePositionPage />);

    expect(
      await screen.findByText("You don’t have any NVDAc yet.")
    ).not.toBeNull();

    const usdc = screen.getByRole("link", { name: "Buy NVDAc with USDC" });
    const usdcParams = new URL(usdc.getAttribute("href") ?? "").searchParams;
    expect(usdcParams.get("chain")).toBe("base");
    expect(usdcParams.get("inputCurrency")).toBe(baseDeployment.usdc);
    expect(usdcParams.get("outputCurrency")).toBe(
      getAssetByName("NVDAc").stock
    );
    expect(usdc.getAttribute("target")).toBe("_blank");
    expect(usdc.getAttribute("rel")).toBe("noopener noreferrer");

    const eth = screen.getByRole("link", { name: "Buy NVDAc with ETH" });
    expect(
      new URL(eth.getAttribute("href") ?? "").searchParams.get("inputCurrency")
    ).toBe("ETH");
    expect(eth.getAttribute("target")).toBe("_blank");

    // The link follows the selected stock rather than a hardcoded per-stock URL.
    fireEvent.click(screen.getByRole("radio", { name: "AAPLc" }));
    const aapl = await screen.findByRole("link", {
      name: "Buy AAPLc with USDC",
    });
    expect(
      new URL(aapl.getAttribute("href") ?? "").searchParams.get(
        "outputCurrency"
      )
    ).toBe(getAssetByName("AAPLc").stock);
  });

  it("names the shortfall and re-reads Base after a swap", async () => {
    loadOpenSnapshotMock.mockResolvedValue({
      stockBalance: 10_000_000n,
      stockAllowance: 0n,
      availableCredit: 10_000_000_000n,
      oracleState: ORACLE_STATE.LIVE,
      estimatedPrincipal: 100_000n,
    });
    render(<CreatePositionPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Stock amount" }), {
      target: { value: "0.25" },
    });

    expect(
      await screen.findByText("You need 0.25 NVDAc but only have 0.1.")
    ).not.toBeNull();
    expect(
      screen.getByText("Insufficient selected-stock balance.")
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Create Position" })
    ).toHaveProperty("disabled", true);

    const reads = loadOpenSnapshotMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh balance" }));
    await waitFor(() =>
      expect(loadOpenSnapshotMock.mock.calls.length).toBeGreaterThan(reads)
    );
  });

  it("offers the network switch instead of Create Position on the wrong chain", async () => {
    useGetActiveNetworkIdMock.mockReturnValue({
      data: { networkId: "eip155:1" },
    });
    render(<CreatePositionPage />);

    const switchButton = await screen.findByRole("button", {
      name: "Switch to Base",
    });
    expect(
      screen.queryByRole("button", { name: "Create Position" })
    ).toBeNull();
    expect(
      screen.getByText("Wrong network (chain 1). Switch to Base (8453).")
    ).not.toBeNull();

    fireEvent.click(switchButton);
    await waitFor(() =>
      expect(switchWalletToBaseMock).toHaveBeenCalledTimes(1)
    );
    expect(runOpenPositionFlowMock).not.toHaveBeenCalled();
  });

  it("asks for a manual switch when the wallet cannot change chains", async () => {
    isProgrammaticNetworkSwitchAvailableMock.mockReturnValue(false);
    useGetActiveNetworkIdMock.mockReturnValue({
      data: { networkId: "eip155:1" },
    });
    render(<CreatePositionPage />);

    expect(
      await screen.findByText(
        "Switch the wallet to Base mainnet (8453) to continue."
      )
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Switch to Base" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create Position" })
    ).toBeNull();
  });

  it("surfaces a failed network switch without losing the button", async () => {
    switchWalletToBaseMock.mockRejectedValue(new Error("user rejected"));
    useGetActiveNetworkIdMock.mockReturnValue({
      data: { networkId: "eip155:1" },
    });
    render(<CreatePositionPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Switch to Base" })
    );

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "user rejected"
    );
    expect(
      screen.getByRole("button", { name: "Switch to Base" })
    ).toHaveProperty("disabled", false);
  });

  it("keeps Create Position when the wallet is already on Base", async () => {
    render(<CreatePositionPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false)
    );
    expect(screen.queryByRole("button", { name: "Switch to Base" })).toBeNull();
  });

  it("points the docs note at the in-app docs page", async () => {
    render(<CreatePositionPage />);

    const docs = await screen.findByRole("link", { name: "docs" });
    expect(docs.getAttribute("href")).toBe("/docs");
  });

  it("explains unavailable pricing without naming oracle states", async () => {
    for (const state of [ORACLE_STATE.HELD, ORACLE_STATE.INVALID]) {
      loadOpenSnapshotMock.mockResolvedValue({
        stockBalance: 1_000_000_00n,
        stockAllowance: 1_000_000_00n,
        availableCredit: 10_000_000_000n,
        oracleState: state,
        estimatedPrincipal: null,
      });
      const { container } = render(<CreatePositionPage />);

      expect(
        await screen.findByText(
          "Market pricing is temporarily unavailable. Leveraged positions can be opened when fresh pricing returns."
        )
      ).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", true);

      const shown = container.textContent ?? "";
      expect(shown).not.toMatch(/state \d/);
      expect(shown).not.toMatch(/HELD|INVALID/);
      cleanup();
    }
  });

  it("points at 1.0x as the open that needs no pricing", async () => {
    loadOpenSnapshotMock.mockResolvedValue({
      stockBalance: 1_000_000_00n,
      stockAllowance: 1_000_000_00n,
      availableCredit: 10_000_000_000n,
      oracleState: ORACLE_STATE.INVALID,
      estimatedPrincipal: null,
    });
    render(<CreatePositionPage />);

    expect(
      await screen.findByText(
        "You can still open a 1.0x position, which does not require live pricing."
      )
    ).not.toBeNull();

    const spot = screen.getByRole("radio", { name: "1.0x" });
    expect(spot).toHaveProperty("disabled", false);

    // Selecting 1.0x clears the block without waiting for pricing to return.
    fireEvent.click(spot);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false)
    );
    expect(
      screen.queryByText(
        "Market pricing is temporarily unavailable. Leveraged positions can be opened when fresh pricing returns."
      )
    ).toBeNull();
  });

  it("opens a 1.0x position while pricing is unavailable", async () => {
    loadOpenSnapshotMock.mockResolvedValue({
      stockBalance: 1_000_000_00n,
      stockAllowance: 1_000_000_00n,
      availableCredit: 10_000_000_000n,
      oracleState: ORACLE_STATE.INVALID,
      estimatedPrincipal: null,
    });
    render(<CreatePositionPage />);

    fireEvent.click(await screen.findByRole("radio", { name: "1.0x" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false)
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));

    await waitFor(() =>
      expect(runOpenPositionFlowMock).toHaveBeenCalledWith(
        expect.objectContaining({ targetLeverage: SPOT_LEVERAGE })
      )
    );
  });

  it("locks the draft while a transaction is awaiting its signature", async () => {
    runOpenPositionFlowMock.mockImplementation(() => new Promise(() => {}));
    render(<CreatePositionPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false)
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));
    expect(
      screen.getByRole("button", { name: "Creating position…" })
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("radio", { name: "AAPLc" }).closest("fieldset")
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("textbox", { name: "Stock amount" }).closest("fieldset")
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("textbox", { name: "Thesis (optional)" })
    ).toHaveProperty("disabled", true);
  });

  it("resets the draft when the wallet rejects the signature", async () => {
    runOpenPositionFlowMock.mockRejectedValueOnce(
      Object.assign(new Error("User rejected the request."), { code: 4001 })
    );
    render(<CreatePositionPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false)
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false)
    );
    expect(screen.queryByText(/Awaiting wallet signature/)).toBeNull();
    expect(screen.queryByText(/Open:/)).toBeNull();
    expect(
      screen.getByRole("radio", { name: "AAPLc" }).closest("fieldset")
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("textbox", { name: "Stock amount" })
    ).toHaveProperty("value", "0.01");
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
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));

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
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));

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
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false);
    });

    fireEvent.change(field, { target: { value: "🐶".repeat(71) } });
    expect(screen.getByText(/284\/280 bytes/)).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Create Position" })
    ).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));
    expect(runOpenPositionFlowMock).not.toHaveBeenCalled();
  });

  it("redirects to /?opened=tokenId and syncs hash after a successful open", async () => {
    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));

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
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));

    await waitFor(() => {
      expect(useRouterPushMock).toHaveBeenCalledWith("/?opened=42");
    });

    expect(syncPositionTxMock).toHaveBeenCalledWith(OPEN_HASH);
  });

  it("still redirects when Convex sync is skipped or fails", async () => {
    syncPositionTxMock.mockResolvedValueOnce("skipped");
    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));

    await waitFor(() => {
      expect(useRouterPushMock).toHaveBeenCalledWith("/?opened=42");
    });

    cleanup();
    useRouterPushMock.mockReset();
    syncPositionTxMock.mockRejectedValueOnce(new Error("index unavailable"));

    render(<CreatePositionPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Create Position" })
      ).toHaveProperty("disabled", false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));

    await waitFor(() => {
      expect(useRouterPushMock).toHaveBeenCalledWith("/?opened=42");
    });
  });
});
