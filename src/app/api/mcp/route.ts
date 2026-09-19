import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  agentErrorKind,
  getAssets,
  getCreditPool,
  getMarketState,
  getPosition,
  prepareOpen,
  quoteOpen,
  type AgentResult,
} from "@/lib/agent";
import { createBaseServerClient } from "@/lib/protocol/server-client";

/**
 * Streamable HTTP MCP endpoint for the public agent surface.
 *
 * The same six functions the `/api/agent/*` routes call, so an MCP client and
 * an HTTP client cannot disagree about pricing, sizing, or calldata. No auth:
 * every tool reads public Base state, and none of them can sign.
 */

const assetSelector = {
  asset: z
    .string()
    .optional()
    .describe('Token name from get_assets, e.g. "NVDAc". Use this or assetId.'),
  assetId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("On-chain asset id from get_assets, e.g. 1. Use this or asset."),
};

const stockAmount = z
  .string()
  .describe(
    'Stock to deposit, in raw 8-decimal base units as a decimal string. 0.01 NVDAc is "1000000".'
  );

const leverage = z
  .number()
  .int()
  .describe(
    "Target leverage in basis points. One of 10000, 11000, 12500, 14000, 15000. 10000 is spot and borrows nothing."
  );

/** MCP reports a caller mistake as a tool error; a closed market is an answer. */
function toolResult(result: AgentResult<unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    isError: !result.ok && agentErrorKind(result.code) === "request",
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_assets",
      {
        title: "List supported assets",
        description:
          "Curated tokenized stocks Margin Call supports on Base, their canonical addresses, and the supported leverage presets. Requires no wallet and no RPC.",
        inputSchema: z.object({}),
      },
      () => toolResult(getAssets())
    );

    server.registerTool(
      "get_market_state",
      {
        title: "Check pricing availability",
        description:
          "Whether fresh U.S. equity pricing is live for one asset, and therefore whether a leveraged position can be opened right now. Check this before quoting a financed open.",
        inputSchema: z.object(assetSelector),
      },
      async (args) =>
        toolResult(await getMarketState(createBaseServerClient(), args))
    );

    server.registerTool(
      "get_credit_pool",
      {
        title: "Read available protocol credit",
        description:
          "USDC the CreditPool can still lend. A financed open needs its whole principal available at once, so this is the ceiling on a single position.",
        inputSchema: z.object({}),
      },
      async () => toolResult(await getCreditPool(createBaseServerClient()))
    );

    server.registerTool(
      "quote_open",
      {
        title: "Quote opening a position",
        description:
          "Whether a requested open is possible right now and how it would be sized: contribution value, borrowed principal, and total exposure. Needs no wallet. Refuses a financed open when pricing is not live rather than using a stale price.",
        inputSchema: z.object({ ...assetSelector, stockAmount, leverage }),
      },
      async (args) =>
        toolResult(await quoteOpen(createBaseServerClient(), args))
    );

    server.registerTool(
      "get_position",
      {
        title: "Read a Position NFT",
        description:
          "Live state of one Position NFT from Base: owner, stock, principal, current debt, thesis, and health. NAV is omitted rather than guessed when pricing is unavailable.",
        inputSchema: z.object({
          tokenId: z.string().describe('Position NFT token id, e.g. "42".'),
        }),
      },
      async (args) =>
        toolResult(await getPosition(createBaseServerClient(), args))
    );

    server.registerTool(
      "prepare_open",
      {
        title: "Prepare an unsigned open",
        description:
          "Build the unsigned Base transactions that open a position for a wallet: a stock approval when the allowance is short, then MarginCall.openPosition. Returns calldata only — Margin Call never signs or broadcasts, so any Base-capable wallet can execute the result.",
        inputSchema: z.object({
          wallet: z
            .string()
            .describe(
              "Base address that will sign and own the Position NFT. Margin Call never sees its key."
            ),
          ...assetSelector,
          stockAmount,
          leverage,
          thesis: z
            .string()
            .optional()
            .describe(
              "Optional opening note stored on-chain, at most 280 UTF-8 bytes. Immutable once minted."
            ),
        }),
      },
      async (args) =>
        toolResult(await prepareOpen(createBaseServerClient(), args))
    );
  },
  {
    serverInfo: { name: "margin-call", version: "1.0.0" },
    instructions:
      "Margin Call opens leveraged positions in tokenized stocks on Base. Reads, quotes, and transaction preparation are public and need no wallet. To open a position: check get_market_state, then quote_open, then prepare_open, then sign and submit the returned transactions with your own Base wallet. When pricing is unavailable, refusing to open a leveraged position is the correct outcome — do not fall back to spot to force a financed request through.",
  }
);

export { handler as GET, handler as POST, handler as DELETE };
