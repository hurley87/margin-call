# @margin-call/mcp-server (Phase 1)

Thin MCP server that lets Claude Code (or any MCP-compatible agent) read the state of a Margin Call desk using a scoped API key.

## Phase 1 scope

Only one tool is exposed:

- `get_desk` — wallet address, USDC balance, trader count, open deals you created, recent P&L, and a funding-hint summary when the desk is unfunded.

All writes, trader creation, deal creation, approvals, etc. come in later phases.

## Local development setup (for contributors)

1. In the Margin Call web app (while logged in via Privy), issue yourself a key:

   ```bash
   curl -X POST http://localhost:3000/api/mcp/keys \
     -H "Authorization: Bearer $YOUR_PRIVY_SESSION_TOKEN" \
     -H "Content-Type: application/json"
   ```

   (Easier: after login, use browser devtools → Network or a tiny script that re-uses the Convex client.)

   The response contains a one-time `key: "mc_live_..."`.

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

   Restart Claude. You should now have the `get_desk` tool.

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
