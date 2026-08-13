// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionConfirm } from "./transaction-confirm";

describe("TransactionConfirm", () => {
  afterEach(cleanup);

  it("renders summary rows, gas note, and wires confirm/cancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <TransactionConfirm
        confirmLabel="Send USDC"
        onCancel={onCancel}
        onConfirm={onConfirm}
        rows={[
          { label: "Recipient", value: "0xabc" },
          { label: "Amount", value: "10 USDC" },
        ]}
        title="Confirm transfer"
      />
    );

    expect(screen.getByText("Confirm transfer")).not.toBeNull();
    expect(screen.getByText("Recipient")).not.toBeNull();
    expect(screen.getByText("0xabc")).not.toBeNull();
    expect(screen.getByText("10 USDC")).not.toBeNull();
    expect(screen.getByText("Gas sponsored — no ETH required.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send USDC" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables actions and shows submitting label while busy", () => {
    render(
      <TransactionConfirm
        busy
        confirmLabel="Deposit USDC"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        rows={[{ label: "Amount", value: "5 USDC" }]}
        title="Confirm deposit"
      />
    );

    expect(screen.getByRole("button", { name: "Submitting…" })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
      "disabled",
      true
    );
  });
});
