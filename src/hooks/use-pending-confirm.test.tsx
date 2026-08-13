// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePendingConfirm } from "./use-pending-confirm";

describe("usePendingConfirm", () => {
  it("arms, cancels, and confirms with the armed payload", async () => {
    const { result } = renderHook(() => usePendingConfirm<number>());

    act(() => result.current.arm(42));
    expect(result.current.pending).toBe(42);

    act(() => result.current.cancel());
    expect(result.current.pending).toBeNull();

    act(() => result.current.arm(7));
    const run = vi.fn().mockResolvedValue(true);
    await act(async () => {
      result.current.confirm(run);
      await Promise.resolve();
    });
    expect(run).toHaveBeenCalledWith(7);
    expect(result.current.pending).toBeNull();
  });
});
