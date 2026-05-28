import { describe, it, expect, vi } from "vitest";
import {
  simulateUsdcTransfer,
  simulateUsdcApprove,
  simulateEscrowDepositFor,
  simulateEscrowTraderWithdraw,
  simulateEscrowCreateDeal,
  simulateEscrowCloseDeal,
} from "../../convex/mcp/simulate";

const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const escrow = "0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609" as const;
const account = "0x000000000000000000000000000000000000beef" as const;
const dest = "0x000000000000000000000000000000000000cafe" as const;

function clientThatThrows(reason: string) {
  return {
    simulateContract: vi.fn(async () => {
      throw new Error(reason);
    }),
  } as unknown as Parameters<typeof simulateUsdcTransfer>[0];
}

function clientThatResolves() {
  return {
    simulateContract: vi.fn(async () => ({ request: {} })),
  } as unknown as Parameters<typeof simulateUsdcTransfer>[0];
}

describe("MCP simulate wrappers", () => {
  it("surfaces a USDC.transfer revert with a labeled error", async () => {
    const c = clientThatThrows("ERC20: insufficient balance");
    await expect(
      simulateUsdcTransfer(c, usdc, account, dest, BigInt(1_000_000))
    ).rejects.toThrow(
      /simulation reverted: USDC\.transfer: ERC20: insufficient balance/
    );
  });

  it("surfaces a USDC.approve revert with a labeled error", async () => {
    const c = clientThatThrows("paused");
    await expect(
      simulateUsdcApprove(c, usdc, account, escrow, BigInt(1_000_000))
    ).rejects.toThrow(/simulation reverted: USDC\.approve: paused/);
  });

  it("surfaces an escrow.depositFor revert with a labeled error", async () => {
    const c = clientThatThrows("Escrow: trader missing");
    await expect(
      simulateEscrowDepositFor(
        c,
        escrow,
        account,
        BigInt(42),
        BigInt(1_000_000)
      )
    ).rejects.toThrow(
      /simulation reverted: escrow\.depositFor: Escrow: trader missing/
    );
  });

  it("surfaces an escrow.withdraw revert with a labeled error", async () => {
    const c = clientThatThrows("Escrow: insufficient");
    await expect(
      simulateEscrowTraderWithdraw(
        c,
        escrow,
        account,
        BigInt(42),
        BigInt(1_000_000)
      )
    ).rejects.toThrow(
      /simulation reverted: escrow\.withdraw: Escrow: insufficient/
    );
  });

  it("surfaces an escrow.createDeal revert with a labeled error", async () => {
    const c = clientThatThrows("Escrow: paused");
    await expect(
      simulateEscrowCreateDeal(
        c,
        escrow,
        account,
        "test prompt",
        BigInt(100_000_000),
        BigInt(10_000_000)
      )
    ).rejects.toThrow(
      /simulation reverted: escrow\.createDeal: Escrow: paused/
    );
  });

  it("surfaces an escrow.closeDeal revert with a labeled error", async () => {
    const c = clientThatThrows("Escrow: pending entries");
    await expect(
      simulateEscrowCloseDeal(c, escrow, account, BigInt(99))
    ).rejects.toThrow(
      /simulation reverted: escrow\.closeDeal: Escrow: pending entries/
    );
  });

  it("resolves silently when the simulation succeeds", async () => {
    const c = clientThatResolves();
    await expect(
      simulateUsdcTransfer(c, usdc, account, dest, BigInt(1_000_000))
    ).resolves.toBeUndefined();
    await expect(
      simulateEscrowCloseDeal(c, escrow, account, BigInt(1))
    ).resolves.toBeUndefined();
  });
});
