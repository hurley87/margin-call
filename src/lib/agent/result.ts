/**
 * Structured outcomes for the public agent surface.
 *
 * Agents branch on `code`, never on prose, so every refusal names one. The
 * codes separate caller mistakes (`INVALID_INPUT`) from honest protocol
 * answers (`PRICING_UNAVAILABLE`): a refusal to finance an open while U.S.
 * equity pricing is stale is a correct result, not a failed request.
 */
export type AgentErrorCode =
  | "INVALID_INPUT"
  | "UNKNOWN_ASSET"
  | "UNSUPPORTED_LEVERAGE"
  | "PRICING_UNAVAILABLE"
  | "INSUFFICIENT_CREDIT"
  | "INSUFFICIENT_BALANCE"
  | "ASSET_OPENING_DISABLED"
  | "THESIS_TOO_LONG"
  | "POSITION_NOT_FOUND"
  | "SIMULATION_FAILED"
  | "BASE_UNAVAILABLE";

export type AgentOk<T> = { ok: true } & T;

export type AgentErr = {
  ok: false;
  code: AgentErrorCode;
  message: string;
};

export type AgentResult<T> = AgentOk<T> | AgentErr;

/** A parsed input value, or the error the tool should return unchanged. */
export type Parsed<T> = { ok: true; value: T } | AgentErr;

export function agentError(code: AgentErrorCode, message: string): AgentErr {
  return { ok: false, code, message };
}

/**
 * Whether a refusal is something the caller can fix, or a true statement about
 * Base that retrying the same call will not change.
 *
 * Transports use this to avoid telling an agent to retry a closed market: a
 * `protocol` refusal is a successful answer that happens to be "no", while a
 * `request` refusal means the call itself was wrong.
 */
export type AgentErrorKind = "request" | "protocol";

export function agentErrorKind(code: AgentErrorCode): AgentErrorKind {
  switch (code) {
    case "INVALID_INPUT":
    case "UNKNOWN_ASSET":
    case "UNSUPPORTED_LEVERAGE":
    case "THESIS_TOO_LONG":
    case "POSITION_NOT_FOUND":
    case "BASE_UNAVAILABLE":
      return "request";
    case "PRICING_UNAVAILABLE":
    case "INSUFFICIENT_CREDIT":
    case "INSUFFICIENT_BALANCE":
    case "ASSET_OPENING_DISABLED":
    case "SIMULATION_FAILED":
      return "protocol";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

/**
 * Agent-facing wording for the pricing gate.
 *
 * Deliberately not the human UI string: the site says "Market pricing is
 * temporarily unavailable", while an agent needs to know *which* market is
 * stale so it can decide whether waiting is worthwhile.
 */
export const AGENT_PRICING_UNAVAILABLE_REASON =
  "Fresh U.S. equity pricing is unavailable.";

/**
 * The asset is a known launch rail; new mints are paused. Re-spelling the
 * id will not help — only an admin toggle or time will.
 */
export function assetOpeningDisabledMessage(assetName: string): string {
  return `Opening new positions is currently disabled for ${assetName}.`;
}

export function assetOpeningDisabledError(assetName: string): AgentErr {
  return agentError(
    "ASSET_OPENING_DISABLED",
    assetOpeningDisabledMessage(assetName)
  );
}

/**
 * Base is the only chain this surface prepares transactions for, and RPC
 * trouble is never a statement about the protocol.
 */
export const BASE_UNAVAILABLE_MESSAGE =
  "Base is unavailable. Retry, or supply a dedicated RPC endpoint.";

/**
 * Run Base reads, turning transport failure into a code the agent can retry on.
 * A read that throws says nothing about pricing, credit, or the position.
 */
export async function readBase<T>(read: () => Promise<T>): Promise<Parsed<T>> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return agentError("BASE_UNAVAILABLE", BASE_UNAVAILABLE_MESSAGE);
  }
}
