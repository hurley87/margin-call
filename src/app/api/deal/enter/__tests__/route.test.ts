import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import { getOwnedTrader } from "@/lib/supabase/traders";
import {
  createDealOutcome,
  getDeal,
  getExistingDealOutcome,
} from "@/lib/supabase/queries";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";

vi.mock("@/lib/privy/server", () => ({
  verifyPrivyToken: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createServerClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/supabase/traders", () => ({
  getTrader: vi.fn(),
  getOwnedTrader: vi.fn(),
}));

vi.mock("@/lib/supabase/queries", () => ({
  createDealOutcome: vi.fn(),
  createTraderTransaction: vi.fn(),
  getDeal: vi.fn(),
  getExistingDealOutcome: vi.fn(),
  updateDealAfterEntry: vi.fn(),
  getTraderAssets: vi.fn(),
  syncAssetsFromOutcome: vi.fn(),
  getLatestNarrative: vi.fn(),
}));

vi.mock("@/lib/siwa/verify", () => ({
  verifySIWARequest: vi.fn(),
}));

vi.mock("@/lib/siwa/binding", () => ({
  siwaAuthMatchesTrader: vi.fn(),
}));

vi.mock("@/lib/llm/call-model", () => ({
  callModel: vi.fn(),
}));

vi.mock("@/lib/cdp/trader-wallet", () => ({
  getOrCreateTraderSmartAccount: vi.fn(),
}));

vi.mock("@/lib/cdp/send-contract-call", () => ({
  sendContractCall: vi.fn(),
  sendBatchContractCalls: vi.fn(),
}));

vi.mock("@/lib/contracts/balance", () => ({
  getEscrowBalance: vi.fn(),
  syncTraderEscrow: vi.fn(),
}));

vi.mock("@/lib/contracts/on-chain", () => ({
  getOnChainDeal: vi.fn(),
  getNftOwner: vi.fn(),
  DEAL_STATUS_OPEN: 0,
}));

vi.mock("@/lib/contracts/operator", () => ({
  makeOperatorWalletClient: vi.fn(),
}));

vi.mock("@/lib/contracts/client", () => ({
  makePublicClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  dealEnterLimit: {},
  checkRateLimit: vi.fn(),
  getClientIdentifier: vi.fn(),
}));

const mockVerifyPrivyToken = vi.mocked(verifyPrivyToken);
const mockCreateServerClient = vi.mocked(createServerClient);
const mockGetOwnedTrader = vi.mocked(getOwnedTrader);
const mockGetDeal = vi.mocked(getDeal);
const mockGetExistingDealOutcome = vi.mocked(getExistingDealOutcome);
const mockCreateDealOutcome = vi.mocked(createDealOutcome);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetClientIdentifier = vi.mocked(getClientIdentifier);

function createRequest() {
  return new NextRequest("http://localhost/api/deal/enter", {
    method: "POST",
    headers: { authorization: "Bearer fake-token" },
    body: JSON.stringify({
      deal_id: "deal-123",
      trader_id: "trader-123",
    }),
  });
}

describe("POST /api/deal/enter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServerClient.mockReturnValue({} as never);
    mockVerifyPrivyToken.mockResolvedValue({
      claims: {} as never,
      user: { wallet: { address: "0xabc123" } } as never,
    });
    mockGetOwnedTrader.mockResolvedValue({
      id: "trader-123",
      name: "John",
      token_id: 1,
      owner_address: "0xabc123",
      cdp_wallet_address: null,
      escrow_balance_usdc: 10,
    } as never);
    mockGetClientIdentifier.mockReturnValue("test-client");
    mockCheckRateLimit.mockResolvedValue(null);
  });

  it("rejects duplicate entries for the same trader and deal", async () => {
    mockGetDeal.mockResolvedValue({
      id: "deal-123",
      status: "open",
      on_chain_deal_id: null,
    } as never);
    mockGetExistingDealOutcome.mockResolvedValue({
      id: "outcome-123",
    });

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: "Trader has already entered this deal",
      outcome_id: "outcome-123",
    });
    expect(mockCreateDealOutcome).not.toHaveBeenCalled();
  });
});
