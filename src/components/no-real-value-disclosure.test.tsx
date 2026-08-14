// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NoRealValueDisclosure } from "./no-real-value-disclosure";

describe("NoRealValueDisclosure", () => {
  afterEach(() => cleanup());

  it("states Base Sepolia and no-real-value clearly", () => {
    render(<NoRealValueDisclosure />);
    const note = screen.getByTestId("no-real-value-disclosure");
    expect(note.textContent).toMatch(/Base Sepolia only/);
    expect(note.textContent).toMatch(/no real value/);
    expect(note.textContent).toMatch(/no claim on real US dollars/);
    expect(note.getAttribute("title")).toMatch(/no claim on real US dollars/);
  });
});
