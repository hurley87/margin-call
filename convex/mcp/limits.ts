import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { USDC_DECIMALS } from "./escrowConstants";

/**
 * Default per-action USDC ceiling when a desk has not set `perActionCapUsdc`.
 * Daily caps remain the cumulative ceiling; per-action is the single-tx
 * ceiling that protects against a single runaway prompt from Claude.
 */
export const DEFAULT_PER_ACTION_CAP_USDC = 500;

/** Scoped ERC20 approve amount: required + 10 USDC headroom, capped at 500 USDC. */
export function usdcApproveAllowance(requiredAtomic: bigint): bigint {
  const headroom = BigInt(10) * BigInt(USDC_DECIMALS);
  const cap = BigInt(DEFAULT_PER_ACTION_CAP_USDC) * BigInt(USDC_DECIMALS);
  const target = requiredAtomic + headroom;
  return target > cap ? cap : target;
}

/**
 * Resolve the per-action USDC cap for a tool on a given desk. Honors the
 * optional `perToolCapUsdc` override map first, then `perActionCapUsdc`,
 * then `DEFAULT_PER_ACTION_CAP_USDC`.
 */
export function resolvePerActionCapUsdc(
  desk: {
    perActionCapUsdc?: number;
    perToolCapUsdc?: unknown;
  } | null,
  tool: string
): number {
  if (!desk) return DEFAULT_PER_ACTION_CAP_USDC;
  const overrides =
    desk.perToolCapUsdc && typeof desk.perToolCapUsdc === "object"
      ? (desk.perToolCapUsdc as Record<string, unknown>)
      : undefined;
  const override = overrides?.[tool];
  if (typeof override === "number" && override > 0) return override;
  if (typeof desk.perActionCapUsdc === "number" && desk.perActionCapUsdc > 0) {
    return desk.perActionCapUsdc;
  }
  return DEFAULT_PER_ACTION_CAP_USDC;
}

/**
 * Enforce the per-action USDC cap for an MCP write tool. Throws when
 * exceeded; the caller (mcpWriteRoute) catches and surfaces as a cached
 * error under the idempotency key so retries with the same key return
 * the same error message.
 */
export async function assertPerActionCap(
  ctx: ActionCtx,
  deskManagerId: Id<"deskManagers">,
  tool: string,
  usdcAmount: number
): Promise<void> {
  if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) return;
  const desk = await ctx.runQuery(internal.deskManagers.getByIdInternal, {
    id: deskManagerId,
  });
  const cap = resolvePerActionCapUsdc(desk, tool);
  if (usdcAmount > cap) {
    throw new Error(
      `Per-action cap exceeded for ${tool}: ${usdcAmount.toFixed(2)} USDC > ${cap.toFixed(2)} USDC. Adjust perActionCapUsdc / perToolCapUsdc on this desk to raise the ceiling.`
    );
  }
}
