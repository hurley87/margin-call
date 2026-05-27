# @margin-call/mcp-server (Phase 1)

Thin MCP server that lets Claude Code (or any MCP-compatible agent) read the state of a Margin Call desk using a scoped API key.

## Phase 2 scope (MCP desk identity)

Each `mc_live_*` key now maps 1:1 to a **dedicated autonomous AGENT DESK**:

- At key issuance (from the web UI while Privy-logged), a CDP server wallet is provisioned and a Convex `deskManager` row is created with subject `mcp:cdp-wallet:<walletId>`.
- The desk has its own on-chain wallet address (separate from any browser Privy desk).
- `sync_wallet` — refreshes the on-chain USDC balance into the desk record.
- All prior Phase 1 read tools continue to work against the MCP desk.

The key can be used from Claude Code with no further browser session. MCP desks are first-class owners of traders and deals (own-desk blocking, etc. apply using the desk's ID).

Public UI surfaces now tag these desks with an **AGENT DESK** badge (terminal glyph).

**Phase 3 trader management** (via MCP): `create_trader`, `configure_trader`, `fund_trader`, `resume_trader`, `pause_trader`, `withdraw_from_trader`. Deal creation and approvals are later phases.

All tools log compact rows to the `mcpRequests` audit table.

## Local development setup (for contributors)

### 1. Get a per-desk MCP key (recommended)

The easiest way is to use the built-in helper script after you have a valid Privy session:

```bash
# 1. Make sure your dev server is running
pnpm dev

# 2. In another terminal, while logged into the app in your browser:
#    - Open DevTools → Network tab
#    - Do something authenticated
#    - Copy the long JWT from any request's Authorization header (after "Bearer ")

PRIVY_JWT="paste_the_long_jwt_here" pnpm mcp:issue-key
```

The script will:

- Call `POST /api/mcp/keys` with the proper header
- Print the fresh `mc_live_...` key (shown only once)
- Give you the exact command to run the MCP server
- Show the snippet for your `.mcp.json` / Cursor settings

Alternative (if you prefer raw curl):

```bash
curl -X POST http://localhost:3000/api/mcp/keys \
  -H "Authorization: Bearer $PRIVY_JWT" \
  -H "Content-Type: application/json"
```

The response contains a one-time `key: "mc_live_..."` plus the new dedicated desk wallet address (Phase 2+).

2. Run the dev server:

   ```bash
   cd /path/to/margin-call
   pnpm dev
   ```

3. Start the MCP server (two env vars):

   ```bash
   MARGIN_CALL_MCP_KEY=mc_live_xxxxxxxxxxxxxxxx \
   MARGIN_CALL_API_URL=http://localhost:3000 \
   npx tsx packages/mcp-server/src/index.ts
   ```

   It speaks stdio and will stay running.

4. In Cursor / Claude Code, add it via local path (example `.mcp.json` or UI):

   ```json
   {
     "mcpServers": {
       "margin-call": {
         "command": "npx",
         "args": [
           "-y",
           "tsx",
           "/absolute/path/to/margin-call/packages/mcp-server/src/index.ts"
         ],
         "env": {
           "MARGIN_CALL_MCP_KEY": "mc_live_...",
           "MARGIN_CALL_API_URL": "http://localhost:3000"
         }
       }
     }
   }
   ```

   Restart Claude. You should now have the full Phase 2 surface (including `sync_wallet` and dedicated per-key CDP desk wallets with `mcp:cdp-wallet:*` identity).

## Production (future)

Once published:

```
claude mcp add margin-call -- npx -y @margin-call/mcp-server
```

You will be prompted for your per-desk key (stored in Claude's secret vault).

## Security notes

- The key only ever grants read access to **one** desk.
- No arbitrary transactions, no raw DB access.
- All dangerous actions (create trader, fund, create deal, answer approvals, withdraw) will require explicit Claude approval and server-side safety rails (daily caps, allowlists, market hours, own-desk blocking, idempotency, audit logging).

See `plans/mcp.md` for the full roadmap.
