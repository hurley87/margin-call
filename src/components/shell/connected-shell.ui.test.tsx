import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/grants/starter-grant-panel", () => ({
  StarterGrantPanel: () => <div>Starter Grant panel</div>,
}));

vi.mock("@/components/maker/my-packs-dashboard", () => ({
  MyPacksDashboard: ({ walletAddress }: { walletAddress: string | null }) => (
    <div>My Packs for {walletAddress}</div>
  ),
}));

vi.mock("@/components/maker/pack-composer", () => ({
  PackComposer: ({ walletAddress }: { walletAddress: string }) => (
    <div>Compose a Pack for {walletAddress}</div>
  ),
}));

vi.mock("@/components/pool/browse-pool", () => ({
  BrowsePool: () => (
    <div>
      Pool Statistics
      <span>Eligible</span>
      <span>No resting Packs indexed.</span>
    </div>
  ),
}));

import { ConnectedShell } from "./connected-shell";

describe("ConnectedShell", () => {
  it("renders grant + browse sections when Convex is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    const html = renderToStaticMarkup(
      <ConnectedShell
        address="0x1234567890abcdef1234567890abcdef12345678"
        onLogout={() => undefined}
      />
    );
    expect(html).toContain("Margin Call");
    expect(html).toContain("0x1234");
    expect(html).toContain("Starter Grant panel");
    expect(html).toContain("My Packs for");
    expect(html).toContain("Compose a Pack for");
    expect(html).toContain("0x1234567890abcdef1234567890abcdef12345678");
    expect(html).toContain("Pool Statistics");
    expect(html).toContain("[LOG OUT]");
    vi.unstubAllEnvs();
  });

  it("shows empty-pool messaging from browse mock", () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    const html = renderToStaticMarkup(
      <ConnectedShell
        address="0x1234567890abcdef1234567890abcdef12345678"
        onLogout={() => undefined}
      />
    );
    expect(html).toContain("No resting Packs indexed.");
    vi.unstubAllEnvs();
  });
});
