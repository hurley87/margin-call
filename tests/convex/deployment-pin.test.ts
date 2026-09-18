import { describe, expect, it } from "vitest";
import { baseDeployment } from "@/lib/protocol/deployment";
import {
  BASE_CHAIN_ID,
  MARGIN_CALL_ADDRESS,
  MARGIN_CALL_DEPLOYED_AT_BLOCK,
} from "../../convex/lib/deployment";

describe("Convex deployment pins lockstep with base.json", () => {
  it("matches chain, MarginCall address, and deploy block", () => {
    expect(BASE_CHAIN_ID).toBe(baseDeployment.chainId);
    expect(MARGIN_CALL_ADDRESS).toBe(baseDeployment.marginCall.toLowerCase());
    expect(MARGIN_CALL_DEPLOYED_AT_BLOCK).toBe(
      baseDeployment.marginCallDeployedAtBlock
    );
    expect(MARGIN_CALL_DEPLOYED_AT_BLOCK).toBe(51470656);
  });
});
