// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HOW_TO_PLAY_URL } from "@/lib/product-docs";
import { FloorHowToPlay } from "./floor-how-to-play";

describe("FloorHowToPlay", () => {
  afterEach(cleanup);

  it("links Learn more in the docs to the GitBook how-to-play page", () => {
    render(<FloorHowToPlay />);
    const link = screen.getByTestId("floor-how-to-play-docs");
    expect(link.getAttribute("href")).toBe(HOW_TO_PLAY_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
