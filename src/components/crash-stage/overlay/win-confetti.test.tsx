// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WIN_CONFETTI_PIECE_COUNT, WinConfetti } from "./win-confetti";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WinConfetti", () => {
  it("renders the expected piece count for a win burst", () => {
    render(<WinConfetti nonce={1} />);
    expect(screen.getByTestId("win-confetti")).toBeTruthy();
    expect(screen.getAllByTestId("win-confetti-piece")).toHaveLength(
      WIN_CONFETTI_PIECE_COUNT
    );
  });

  it("regenerates pieces when remounted with a new nonce", () => {
    const { rerender } = render(<WinConfetti key={1} nonce={1} />);
    const firstLeft =
      screen.getAllByTestId("win-confetti-piece")[0]?.style.left;

    rerender(<WinConfetti key={2} nonce={2} />);
    const secondLeft =
      screen.getAllByTestId("win-confetti-piece")[0]?.style.left;

    expect(firstLeft).toBeTruthy();
    expect(secondLeft).toBeTruthy();
    expect(secondLeft).not.toBe(firstLeft);
  });

  it("unmounts after the celebration window", async () => {
    vi.useFakeTimers();
    render(<WinConfetti nonce={3} />);
    expect(screen.getByTestId("win-confetti")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(4_300);
    });
    expect(screen.queryByTestId("win-confetti")).toBeNull();
  });
});
