import { BaseError, UserRejectedRequestError } from "viem";

const REJECT_MESSAGE =
  /user rejected|user denied|rejected the request|request rejected|denied transaction signature/i;

/**
 * True when the wallet (or a wrapped viem error) reports that the user
 * cancelled the signature prompt. Other RPC failures stay errors.
 */
export function isUserRejectedRequest(error: unknown): boolean {
  if (error instanceof BaseError) {
    if (error.walk((err) => err instanceof UserRejectedRequestError) != null) {
      return true;
    }
  }
  return walkUnknown(error);
}

function walkUnknown(error: unknown, seen = new Set<unknown>()): boolean {
  if (error == null || seen.has(error)) return false;
  seen.add(error);

  if (error instanceof UserRejectedRequestError) return true;

  if (typeof error === "object") {
    const record = error as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
      details?: unknown;
      shortMessage?: unknown;
      cause?: unknown;
    };
    if (record.name === "UserRejectedRequestError") return true;
    if (record.code === 4001 || record.code === "ACTION_REJECTED") return true;
    for (const value of [record.message, record.details, record.shortMessage]) {
      if (typeof value === "string" && REJECT_MESSAGE.test(value)) return true;
    }
    return walkUnknown(record.cause, seen);
  }

  return typeof error === "string" && REJECT_MESSAGE.test(error);
}
