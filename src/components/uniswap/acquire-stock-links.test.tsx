// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AcquireStockLinks,
  type AcquireStockLinksProps,
} from "@/components/uniswap/acquire-stock-links";
import { baseDeployment, getAssetByName } from "@/lib/protocol/deployment";

function renderLinks(overrides: Partial<AcquireStockLinksProps> = {}) {
  const onRefresh = vi.fn();
  render(
    <AcquireStockLinks
      stockName="NVDAc"
      stockAddress={getAssetByName("NVDAc").stock}
      stockBalance={0n}
      stockAmount={25_000_000n}
      onRefresh={onRefresh}
      {...overrides}
    />
  );
  return { onRefresh };
}

function linkParams(name: RegExp): URLSearchParams {
  const href = screen.getByRole("link", { name }).getAttribute("href") ?? "";
  return new URL(href).searchParams;
}

afterEach(cleanup);

describe("AcquireStockLinks", () => {
  it("offers USDC and ETH swaps into the selected stock", () => {
    renderLinks();

    const usdc = linkParams(/USDC/);
    expect(usdc.get("chain")).toBe("base");
    expect(usdc.get("inputCurrency")).toBe(baseDeployment.usdc);
    expect(usdc.get("outputCurrency")).toBe(getAssetByName("NVDAc").stock);
    expect(usdc.get("field")).toBe("input");

    expect(linkParams(/ETH/).get("inputCurrency")).toBe("ETH");
  });

  it("follows the stock it is handed", () => {
    renderLinks({
      stockName: "GOOGLc",
      stockAddress: getAssetByName("GOOGLc").stock,
    });

    expect(linkParams(/USDC/).get("outputCurrency")).toBe(
      getAssetByName("GOOGLc").stock
    );
    expect(screen.getByText("You don’t have any GOOGLc yet.")).not.toBeNull();
  });

  it("opens Uniswap outside the app", () => {
    renderLinks();

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("names the shortfall when the wallet holds some already", () => {
    renderLinks({ stockBalance: 10_000_000n, stockAmount: 25_000_000n });

    expect(
      screen.getByText("You need 0.25 NVDAc but only have 0.1.")
    ).not.toBeNull();
    expect(screen.queryByText("Already swapped?")).toBeNull();
  });

  it("re-reads the balance on request", () => {
    const { onRefresh } = renderLinks();

    fireEvent.click(screen.getByRole("button", { name: "Refresh balance" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("prefills the input amount when one is suggested", () => {
    renderLinks({ suggestedInputAmount: "40" });

    expect(linkParams(/USDC/).get("value")).toBe("40");
    expect(linkParams(/ETH/).get("value")).toBe("40");
  });
});
