import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LandingScreen } from "@/components/landing/landing-screen";

describe("LandingScreen", () => {
  it("renders brand hero and email CTA", () => {
    const html = renderToStaticMarkup(<LandingScreen onLogin={() => {}} />);

    expect(html).toContain("Margin Call");
    expect(html).toContain("NAV-weighted Pack rips");
    expect(html).toContain("Enter by email");
    expect(html).not.toContain("/traders/");
    expect(html).not.toContain("Hire. Fund. Bait. Collect.");
  });
});
