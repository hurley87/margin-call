import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PersonaTraits, RarityBadge } from "./persona-traits";

describe("PersonaTraits", () => {
  it("humanizes every slot and tier-tags rare/legendary values", () => {
    const html = renderToStaticMarkup(
      <PersonaTraits
        traits={{
          expression: "manic", // Rare
          fieldInk: "goldleaf", // Legendary
          attire: "business", // Common
          vice: "coupe", // Legendary
          fieldFlourish: "plain", // Common
        }}
      />
    );

    // Humanized labels for every slot
    for (const label of [
      "Manic Laugh",
      "Gold Leaf",
      "Business Suit",
      "Champagne Coupe",
      "Plain Field",
    ]) {
      expect(html).toContain(label);
    }

    // Rare + Legendary rows carry a data-tier; the ◆ marker + tags appear
    expect(html).toContain('data-tier="Rare"');
    expect(html).toContain('data-tier="Legendary"');
    expect(html).toContain("RARE");
    expect(html).toContain("LEG");
    expect(html).toContain("◆");
  });

  it("leaves common/uncommon rows untagged", () => {
    const html = renderToStaticMarkup(
      <PersonaTraits
        traits={{
          expression: "cold", // Common
          fieldInk: "vermilion", // Common
          attire: "tuxedo", // Uncommon
          vice: "none", // Common
          fieldFlourish: "plain", // Common
        }}
      />
    );
    expect(html).not.toContain("data-tier=");
    expect(html).not.toContain("◆");
    expect(html).toContain("Tuxedo");
  });
});

describe("RarityBadge", () => {
  it("renders the tier with a data-tier hook", () => {
    const legendary = renderToStaticMarkup(<RarityBadge rarity="Legendary" />);
    expect(legendary).toContain("Legendary");
    expect(legendary).toContain('data-tier="Legendary"');
    expect(legendary).toContain("◆");

    const common = renderToStaticMarkup(<RarityBadge rarity="Common" />);
    expect(common).toContain('data-tier="Common"');
    expect(common).not.toContain("◆");
  });
});
