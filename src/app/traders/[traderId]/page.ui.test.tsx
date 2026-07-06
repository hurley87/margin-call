import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicTraderDossier } from "./page";

const BASE_TRADER = {
  traderId: "trader_1",
  name: "Gordon Gecko",
  status: "active" as const,
  tokenId: 87,
  portraitStatus: "ready" as const,
  rarity: "Legendary",
  riskProfile: "Aggressive",
  traits: null,
  escrowBalanceUsdc: 125.5,
  profileImageUrl: "/traders/placeholder.svg",
  recentActivity: [],
};

describe("PublicTraderDossier", () => {
  it("clarifies the public dossier as a read-only floor tape", () => {
    const html = renderToStaticMarkup(
      <PublicTraderDossier trader={BASE_TRADER} />
    );

    expect(html).toContain("Public trader dossier // floor tape");
    expect(html).toContain("Read-only reputation");
    expect(html).toContain("Back to desk");
    expect(html).toContain("Escrow capital");
    expect(html).toContain("$125.50");
  });

  it("uses the hardened empty state when the public tape has not printed", () => {
    const html = renderToStaticMarkup(
      <PublicTraderDossier
        trader={{
          ...BASE_TRADER,
          status: "paused",
          portraitStatus: "generating",
          escrowBalanceUsdc: 0,
        }}
      />
    );

    expect(html).toContain("No public activity on the tape yet");
    expect(html).toContain(
      "Once this trader scans, skips, wins, loses, or gets wiped out"
    );
    expect(html).toContain("generating");
  });
});
