// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FlashValue } from "./flash-value";

describe("FlashValue", () => {
  afterEach(cleanup);

  it("renders without a flash direction on first paint", () => {
    render(<FlashValue value={100n}>100 tUSD</FlashValue>);
    const span = screen.getByText("100 tUSD");
    expect(span.getAttribute("data-dir")).toBeNull();
  });

  it("flashes up on increases and down on decreases", () => {
    const { rerender } = render(<FlashValue value={100n}>100 tUSD</FlashValue>);

    rerender(<FlashValue value={150n}>150 tUSD</FlashValue>);
    expect(screen.getByText("150 tUSD").getAttribute("data-dir")).toBe("up");

    rerender(<FlashValue value={40n}>40 tUSD</FlashValue>);
    expect(screen.getByText("40 tUSD").getAttribute("data-dir")).toBe("down");
  });

  it("keeps the rendered label as the source of truth", () => {
    render(
      <FlashValue className="balance" value={5n}>
        5 tUSD
      </FlashValue>
    );
    const span = screen.getByText("5 tUSD");
    expect(span.className).toContain("mc-num-flash");
    expect(span.className).toContain("balance");
  });
});
