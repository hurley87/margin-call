// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CountdownBanner } from "./countdown-banner";

describe("CountdownBanner", () => {
  afterEach(cleanup);

  it("renders the formatted countdown and label", () => {
    render(
      <CountdownBanner
        label="Entry closes in"
        progress={0.4}
        seconds={22}
        urgency="calm"
      />
    );

    expect(screen.getByTestId("countdown-banner")).toBeTruthy();
    expect(screen.getByText("Entry closes in")).toBeTruthy();
    expect(screen.getByText("00:22")).toBeTruthy();
  });

  it("shows LOCKED when locked with no seconds", () => {
    render(
      <CountdownBanner
        label={null}
        locked
        progress={null}
        seconds={null}
        urgency="locked"
      />
    );

    expect(screen.getByText("LOCKED")).toBeTruthy();
  });

  it("applies threat throb class under five seconds", () => {
    const { container } = render(
      <CountdownBanner
        label="Entry closes in"
        progress={0.95}
        seconds={3}
        urgency="threat"
      />
    );

    expect(container.querySelector(".mc-dial-throb")).toBeTruthy();
    expect(container.querySelector(".mc-dial-halo")).toBeTruthy();
  });
});
