import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-landing-roster", () => ({
  useLandingRoster: () => ({
    data: [
      {
        id: "trader_abc",
        name: "Vic Sterling",
        profileImageUrl: "https://example.com/vic.png",
        traits: null,
        effectiveTier: "Seat",
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-market-pulse", () => ({
  useMarketPulse: () => ({
    mood: "nervous",
    moodLabel: "nervous",
    moodTone: "warn",
    heatBand: "hot",
    heatLabel: "Elevated",
    heatTone: "warn",
    tension: 7,
    isFlash: false,
    headline: "Junk desks scramble as treasury whispers heat up",
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-market-hours", () => ({
  useMarketHours: () => ({
    isOpen: true,
    countdownLabel: "1:02:00",
  }),
}));

vi.mock("@/components/connect-mcp-dialog", () => ({
  ConnectMcpDialog: () => <button type="button">Connect via MCP</button>,
}));

import { LandingScreen } from "@/components/landing/landing-screen";

describe("LandingScreen", () => {
  it("renders cinematic brand hero, live roster link, and email CTA", () => {
    const html = renderToStaticMarkup(<LandingScreen onLogin={() => {}} />);

    expect(html).toContain("Margin Call");
    expect(html).toContain("Run a hostile Wall Street desk");
    expect(html).toContain("Enter by email");
    expect(html).toContain("/traders/trader_abc");
    expect(html).toContain("Vic Sterling");
    expect(html).toContain("Hire. Fund. Bait. Collect.");
    expect(html).toContain("Junk desks scramble");
    expect(html).toContain("NYSE open");
    expect(html).not.toContain("banner.png");
    expect(html).not.toContain("SEC Elevated");
    expect(html).not.toContain("SEC Critical");
  });
});
