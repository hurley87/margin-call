import { describe, expect, it } from "vitest";
import { parseNetworkIdToChainId } from "@/lib/dynamic/resolve-wallet-client";

describe("parseNetworkIdToChainId", () => {
  it("parses Dynamic network id formats", () => {
    expect(parseNetworkIdToChainId("8453")).toBe(8453);
    expect(parseNetworkIdToChainId("eip155:8453")).toBe(8453);
    expect(parseNetworkIdToChainId("0x2105")).toBe(8453);
    expect(parseNetworkIdToChainId(null)).toBeNull();
    expect(parseNetworkIdToChainId("")).toBeNull();
  });
});
