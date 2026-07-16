import { describe, expect, it } from "vitest";

import {
  formatMoodLabel,
  heatBandFromTension,
  heatLabel,
  heatTone,
  moodTone,
} from "@/lib/market-pulse";

describe("market-pulse helpers", () => {
  it("maps mood to UI tones", () => {
    expect(moodTone("electric")).toBe("live");
    expect(moodTone("grim")).toBe("danger");
    expect(moodTone("nervous")).toBe("warn");
    expect(moodTone("bored")).toBe("neutral");
  });

  it("bands tension into SEC heat labels", () => {
    expect(heatBandFromTension(1)).toBe("cool");
    expect(heatBandFromTension(4)).toBe("warm");
    expect(heatBandFromTension(7)).toBe("hot");
    expect(heatBandFromTension(9)).toBe("critical");
    expect(heatLabel("critical")).toBe("Critical");
    expect(heatTone("cool")).toBe("live");
  });

  it("formats mood labels for display", () => {
    expect(formatMoodLabel("unknown")).toBe("Quiet tape");
    expect(formatMoodLabel("electric")).toBe("electric");
  });
});
