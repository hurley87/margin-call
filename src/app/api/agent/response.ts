import {
  agentError,
  type AgentErr,
  type AgentErrorCode,
  type AgentResult,
} from "@/lib/agent";

/**
 * HTTP status per agent error code.
 *
 * Protocol refusals answer 200 on purpose. "Fresh U.S. equity pricing is
 * unavailable" is a correct statement about Base, not a failed request, and a
 * closed U.S. market must not look like an outage to a client that only reads
 * the status line. Every response carries `ok`, which is what callers branch
 * on; the status line is reserved for bad input, missing tokens, and RPC
 * trouble, where retrying the same call unchanged would be pointless.
 */
const STATUS_BY_CODE: Record<AgentErrorCode, number> = {
  INVALID_INPUT: 400,
  UNKNOWN_ASSET: 400,
  UNSUPPORTED_LEVERAGE: 400,
  THESIS_TOO_LONG: 400,
  POSITION_NOT_FOUND: 404,
  BASE_UNAVAILABLE: 502,
  PRICING_UNAVAILABLE: 200,
  INSUFFICIENT_CREDIT: 200,
  INSUFFICIENT_BALANCE: 200,
  SIMULATION_FAILED: 200,
};

/** The surface is public, so any origin may call it from anywhere. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** The deployment manifest only changes with a redeploy. */
export const ASSETS_CACHE =
  "public, max-age=300, s-maxage=300, stale-while-revalidate=900";

/** Debt accrues continuously and stage follows the oracle, so barely cache. */
export const POSITION_CACHE = "public, max-age=10";

/** Pricing, credit, and prepared calldata are only true for this instant. */
export const NO_STORE = "no-store";

export function agentJson(
  result: AgentResult<unknown>,
  cacheControl: string
): Response {
  const status = result.ok ? 200 : STATUS_BY_CODE[result.code];
  return Response.json(result, {
    status,
    headers: {
      // A refused answer is still true only for now, and an error never is.
      "Cache-Control": result.ok ? cacheControl : NO_STORE,
      ...CORS_HEADERS,
    },
  });
}

export function agentPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

export async function readJsonBody(
  request: Request
): Promise<{ ok: true; value: Record<string, unknown> } | AgentErr> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return agentError("INVALID_INPUT", "Request body must be valid JSON.");
  }
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return agentError("INVALID_INPUT", "Request body must be a JSON object.");
  }
  return { ok: true, value: body as Record<string, unknown> };
}
