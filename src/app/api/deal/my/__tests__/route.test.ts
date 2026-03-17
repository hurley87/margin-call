import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import { verifyPrivyToken, getPrivyWalletAddress } from "@/lib/privy/server";
import { listOpenDealsByCreator } from "@/lib/supabase/queries";

vi.mock("@/lib/privy/server", () => ({
  verifyPrivyToken: vi.fn(),
  getPrivyWalletAddress: vi.fn(),
}));

vi.mock("@/lib/supabase/queries", () => ({
  listOpenDealsByCreator: vi.fn(),
}));

const mockVerifyPrivyToken = vi.mocked(verifyPrivyToken);
const mockGetPrivyWalletAddress = vi.mocked(getPrivyWalletAddress);
const mockListOpenDealsByCreator = vi.mocked(listOpenDealsByCreator);

function createRequest() {
  return new NextRequest("http://localhost/api/deal/my", {
    method: "GET",
    headers: { authorization: "Bearer fake-token" },
  });
}

describe("GET /api/deal/my", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no wallet is linked", async () => {
    mockVerifyPrivyToken.mockResolvedValue({
      claims: {} as never,
      user: {} as never,
    });
    mockGetPrivyWalletAddress.mockReturnValue(null);

    const request = createRequest();
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("No wallet linked");
    expect(mockListOpenDealsByCreator).not.toHaveBeenCalled();
  });

  it("returns only deals for the authenticated creator", async () => {
    const wallet = "0xabc123";
    const ownerDeals = [
      {
        id: "deal-1",
        creator_address: wallet.toLowerCase(),
        status: "open",
        prompt: "Own deal",
      },
    ];

    mockVerifyPrivyToken.mockResolvedValue({
      claims: {} as never,
      user: {} as never,
    });
    mockGetPrivyWalletAddress.mockReturnValue(wallet);
    mockListOpenDealsByCreator.mockResolvedValue(ownerDeals as never);

    const request = createRequest();
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deals).toEqual(ownerDeals);
    expect(mockListOpenDealsByCreator).toHaveBeenCalledTimes(1);
    expect(mockListOpenDealsByCreator).toHaveBeenCalledWith(wallet);
  });

  it("passes wallet address to listOpenDealsByCreator for consistent query", async () => {
    mockVerifyPrivyToken.mockResolvedValue({
      claims: {} as never,
      user: {} as never,
    });
    mockGetPrivyWalletAddress.mockReturnValue("0xBe52...9b0c");
    mockListOpenDealsByCreator.mockResolvedValue([]);

    const request = createRequest();
    await GET(request);

    expect(mockListOpenDealsByCreator).toHaveBeenCalledWith("0xBe52...9b0c");
  });

  it("returns 401 when auth fails", async () => {
    mockVerifyPrivyToken.mockRejectedValue(
      new Error("Missing or invalid Authorization header")
    );

    const request = createRequest();
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBeDefined();
    expect(mockListOpenDealsByCreator).not.toHaveBeenCalled();
  });
});
