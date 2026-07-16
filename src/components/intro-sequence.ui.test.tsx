import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-sfx", () => ({
  useSfx: () => ({
    playStinger: vi.fn(),
    playWin: vi.fn(),
    playApprovalPing: vi.fn(),
    enabled: true,
    toggleEnabled: vi.fn(),
  }),
}));

import { IntroSequence } from "@/components/intro-sequence";

describe("IntroSequence", () => {
  it("opens on the cinematic prologue with skip and mute controls", () => {
    const html = renderToStaticMarkup(<IntroSequence onComplete={() => {}} />);

    expect(html).toContain("The year is 1987");
    expect(html).toContain("SKIP INTRO");
    expect(html).toContain("Mute music");
    expect(html).toContain("Step onto the floor");
    expect(html).not.toContain("Acknowledge every rule");
  });
});
