import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WalletOnboardingChecklist } from "./wallet-onboarding-checklist";

const baseProps = {
  traderName: "Gordon Gekko",
  imageStatus: "generating" as const,
  profileImageUrl: "",
  traits: null,
  rarity: "Common",
};

describe("WalletOnboardingChecklist", () => {
  it("renders line 1 active and the rest dimmed when no step is recorded", () => {
    const html = renderToStaticMarkup(
      <WalletOnboardingChecklist
        {...baseProps}
        walletStatus="creating"
        walletStep={null}
        tokenId={null}
      />
    );

    expect(html).toContain("FILING PAPERWORK");
    expect(html).toContain("█");
    expect(html).toContain("MINTING TRADER ID");
    expect(html).toContain("ISSUING FLOOR BADGE");
    expect(html).not.toContain("OK");
    expect(html).not.toContain("TRADER ON THE FLOOR");
  });

  it("shows the minted tokenId and advances to the seat step", () => {
    const html = renderToStaticMarkup(
      <WalletOnboardingChecklist
        {...baseProps}
        walletStatus="creating"
        walletStep="id_minted"
        tokenId={128}
      />
    );

    expect(html).toContain("PAPERWORK FILED");
    expect(html).toContain("TRADER ID MINTED #128");
    expect(html).toContain("OK");
    expect(html).toContain("REGISTERING SEAT");
    expect(html).not.toContain("SEAT REGISTERED");
  });

  it("tolerates jumping straight to seat_registered", () => {
    const html = renderToStaticMarkup(
      <WalletOnboardingChecklist
        {...baseProps}
        walletStatus="creating"
        walletStep="seat_registered"
        tokenId={null}
      />
    );

    expect(html).toContain("PAPERWORK FILED");
    expect(html).toContain("TRADER ID MINTED");
    expect(html).toContain("SEAT REGISTERED");
    expect(html).toContain("ISSUING FLOOR BADGE");
    expect(html).not.toContain("FLOOR BADGE ISSUED");
  });

  it("renders all steps done plus the stamp when the wallet is ready", () => {
    const html = renderToStaticMarkup(
      <WalletOnboardingChecklist
        {...baseProps}
        walletStatus="ready"
        walletStep="seat_registered"
        tokenId={42}
      />
    );

    expect(html).toContain("PAPERWORK FILED");
    expect(html).toContain("TRADER ID MINTED #42");
    expect(html).toContain("SEAT REGISTERED");
    expect(html).toContain("FLOOR BADGE ISSUED");
    expect(html).toContain("TRADER ON THE FLOOR");
    expect(html).not.toContain("█");
  });

  it("shows a flavor line while provisioning and hides it when ready", () => {
    const provisioning = renderToStaticMarkup(
      <WalletOnboardingChecklist
        {...baseProps}
        walletStatus="pending"
        walletStep={null}
        tokenId={null}
      />
    );
    expect(provisioning).toContain("COMPLIANCE NEVER SLEEPS");

    const ready = renderToStaticMarkup(
      <WalletOnboardingChecklist
        {...baseProps}
        walletStatus="ready"
        walletStep={null}
        tokenId={null}
      />
    );
    expect(ready).not.toContain("COMPLIANCE NEVER SLEEPS");
  });

  it("reveals persona traits + rarity once the portrait is ready", () => {
    const html = renderToStaticMarkup(
      <WalletOnboardingChecklist
        {...baseProps}
        imageStatus="ready"
        walletStatus="ready"
        walletStep="seat_registered"
        tokenId={7}
        rarity="Legendary"
        traits={{
          expression: "cold",
          fieldInk: "vermilion",
          attire: "business",
          vice: "none",
          fieldFlourish: "confetti",
        }}
      />
    );

    expect(html).toContain("Persona revealed");
    expect(html).toContain("Confetti Storm"); // legendary flourish label
    expect(html).toContain("Legendary"); // rarity badge
    expect(html).toContain('data-tier="Legendary"');
  });

  it("hides the persona reveal while the portrait is still generating", () => {
    const html = renderToStaticMarkup(
      <WalletOnboardingChecklist
        {...baseProps}
        imageStatus="generating"
        walletStatus="creating"
        walletStep="id_minted"
        tokenId={7}
        rarity="Legendary"
        traits={{
          expression: "cold",
          fieldInk: "vermilion",
          attire: "business",
          vice: "none",
          fieldFlourish: "confetti",
        }}
      />
    );
    expect(html).not.toContain("Persona revealed");
  });
});
