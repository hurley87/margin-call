import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usePrivyMock = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => usePrivyMock(),
}));

import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    usePrivyMock.mockReset();
  });

  it("shows initializing while Privy is not ready", () => {
    usePrivyMock.mockReturnValue({
      ready: false,
      authenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      user: null,
    });

    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("INITIALIZING");
  });

  it("shows landing when unauthenticated", () => {
    usePrivyMock.mockReturnValue({
      ready: true,
      authenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      user: null,
    });

    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("Margin Call");
    expect(html).toContain("Enter by email");
  });

  it("shows connected shell with wallet when authenticated", () => {
    usePrivyMock.mockReturnValue({
      ready: true,
      authenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      user: {
        wallet: {
          address: "0x1234567890abcdef1234567890abcdef12345678",
          chainType: "ethereum",
          walletClientType: "privy",
        },
      },
    });

    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("Connected");
    expect(html).toContain("0x1234");
    expect(html).toContain("[LOG OUT]");
  });
});
