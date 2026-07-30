import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usePrivyMock = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => usePrivyMock(),
}));

vi.mock("@/components/shell/connected-shell", () => ({
  ConnectedShell: ({ address }: { address: string | null }) => (
    <div>
      Connected shell {address}
      <div>Pool Statistics</div>
      <div>Starter Grant panel</div>
    </div>
  ),
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

  it("shows connected browse shell when authenticated", () => {
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
    expect(html).toContain("Connected shell");
    expect(html).toContain("0x1234567890abcdef1234567890abcdef12345678");
    expect(html).toContain("Pool Statistics");
    expect(html).toContain("Starter Grant panel");
  });
});
