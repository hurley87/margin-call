import { describe, expect, it } from "vitest";
import { UserRejectedRequestError } from "viem";
import { isUserRejectedRequest } from "@/lib/protocol/user-rejected";

describe("isUserRejectedRequest", () => {
  it("accepts viem UserRejectedRequestError and EIP-1193 4001", () => {
    expect(
      isUserRejectedRequest(
        new UserRejectedRequestError(new Error("User rejected the request."))
      )
    ).toBe(true);
    expect(
      isUserRejectedRequest(
        Object.assign(new Error("Request rejected"), { code: 4001 })
      )
    ).toBe(true);
  });

  it("walks wrapped causes from wallet providers", () => {
    expect(
      isUserRejectedRequest({
        message: "Failed to send transaction",
        cause: {
          code: "ACTION_REJECTED",
          message: "user denied transaction signature",
        },
      })
    ).toBe(true);
  });

  it("does not treat contract or RPC failures as a cancel", () => {
    expect(isUserRejectedRequest(new Error("RPC Request failed"))).toBe(false);
    expect(
      isUserRejectedRequest(
        new Error('The contract function "availableCredit" returned no data')
      )
    ).toBe(false);
    expect(isUserRejectedRequest(null)).toBe(false);
  });
});
