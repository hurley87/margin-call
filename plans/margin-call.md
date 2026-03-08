# Plan: Margin Call — AI-Powered PvP Trading Game

> Source PRD: `docs/wall-street-agent-game.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes (pages)**:
  - `/` — Dashboard (portfolio overview, P&L)
  - `/traders` — List desk manager's traders (NFTs)
  - `/traders/[id]` — Trader detail (activity, stats, mandate, reputation)
  - `/deals` — Browse open deals
  - `/deals/create` — Create deal (contract interaction + AI prompt suggestions)
  - `/deals/[id]` — Deal detail (outcomes, pot history)
  - `/approvals` — Pending approval queue
  - `/marketplace` — Browse/buy/sell trader NFTs
  - `/settings` — Desk manager settings

- **API routes**:
  - `POST /api/deal/enter` — Agent enters deal (LLM resolution + contract settlement)
  - `GET /api/deal/list` — List open deals
  - `GET /api/deal/[id]` — Deal detail + outcomes
  - `POST /api/desk/register` — Register desk manager
  - `POST /api/desk/configure` — Update trader mandate
  - `POST /api/desk/approve` — Approve/reject big deal
  - `POST /api/trader/create` — Mint ERC-8004 NFT + register trader
  - `POST /api/trader/pause` — Pause agent loop
  - `POST /api/trader/resume` — Resume agent loop
  - `GET /api/trader/[id]/activity` — Activity feed
  - `POST /api/prompt/suggest` — AI deal prompt suggestions

- **Smart contract**: Single `MarginCallEscrow.sol` on Base. Manages deal pots, trader escrow balances, fund distribution, platform fees. ERC-8004 registries are existing infrastructure (not built by us).

- **Schema (Supabase)**: `desk_managers`, `traders`, `deals`, `deal_outcomes`, `assets`, `agent_activity_log`, `deal_approvals`, `system_prompts` — mirrors on-chain state for fast reads. On-chain is source of truth for balances and reputation.

- **Auth**: Privy (wallet connect, embedded wallets, server-side token verification)

- **Money flow**: All USDC flows through the escrow contract. Desk managers interact with the contract directly from the frontend (wagmi). Server calls `resolveEntry()` as whitelisted operator.

- **Agent identity**: ERC-8004 NFTs on Base Identity Registry. ERC-6551 Token Bound Accounts as trader wallets. Reputation posted to ERC-8004 Reputation Registry after every deal.

- **ERC-8004 contract addresses**:
  - Base Sepolia (testnet):
    - IdentityRegistry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
    - ReputationRegistry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
  - Base Mainnet:
    - IdentityRegistry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
    - ReputationRegistry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

- **LLM**: OpenAI GPT-5 mini with structured outputs (Zod schemas). Correction flow rewrites narrative when validation modifies outcome.

- **Agent runtime**: Vercel Workflow — durable steps, sleep, hooks for approval pauses.

---

## Phase 0: Cleanup

**User stories**: N/A — housekeeping to align codebase with contract-based architecture

### What to build

Remove code from the x402 facilitator payment approach that is no longer needed. The PRD specifies all money flows through the escrow contract, not x402.

Files to delete:

- `src/lib/x402/middleware.ts` — x402 payment wrapping
- `src/lib/x402/payment-validation.ts` — x402 price formatting
- `src/lib/x402/__tests__/payment-validation.test.ts` — x402 tests
- `src/hooks/use-send-usdc.ts` — raw ERC-20 transfer (funding goes through escrow)
- `src/app/wallet/page.tsx` — standalone wallet page (funding/withdrawing goes through escrow)
- `src/app/api/deal/create/route.ts` — deal creation API route (moves to direct contract call)

Files to update:

- `src/hooks/use-deals.ts` — remove `useCreateDeal` hook and all x402/Privy payment imports
- `src/app/deals/create/page.tsx` — remove x402 payment confirmation modal and `useCreateDeal` usage (keep form structure and prompt suggestions)
- `src/app/settings/page.tsx` — remove Fund/Withdraw wallet links (will be rewired to escrow later)
- `src/components/providers/base-network-guard.tsx` — remove x402 mention from copy
- `src/app/api/deal/enter/route.ts` — remove x402 TODO comment
- `package.json` — remove `@x402/core`, `@x402/evm`, `@x402/next` dependencies

### Acceptance criteria

- [ ] All x402 code removed, no imports referencing `x402` anywhere
- [ ] `use-send-usdc` hook and wallet page deleted
- [ ] Deal create API route deleted
- [ ] `pnpm build` passes with no errors
- [ ] `pnpm lint` passes

---

## Phase 1: Escrow Contract

**User stories**: Deal creation with USDC pot, trader balance management, fund distribution after resolution, platform fee collection

### What to build

Write and deploy the `MarginCallEscrow.sol` contract on Base Sepolia. This is the single custom contract — the financial backbone of the game. It holds all USDC (deal pots, trader balances, platform fees) and enforces authorization via ERC-8004 NFT ownership. The ERC-8004 IdentityRegistry is already deployed on Base Sepolia at `0x8004A818BFB912233c491871b3d84c89A494BD9e`.

Scaffold using LazerForge (`github.com/LazerTechnologies/LazerForge`) in a `contracts/` directory. Write Foundry tests covering all functions and edge cases.

Contract state: `deals[dealId]`, `balances[traderId]`, `platformFees`.

Contract functions:

- `createDeal(prompt, potAmount, entryCost)` — transfers USDC into pot, deducts 5% fee
- `closeDeal(dealId)` — creator withdraws remaining pot (requires 0 pending entries)
- `depositFor(traderId, amount)` — fund trader's escrow balance (requires NFT ownership)
- `withdraw(traderId, amount)` — withdraw from trader's escrow balance (requires NFT ownership)
- `resolveEntry(dealId, traderId, pnl, rake)` — server distributes funds based on LLM outcome
- `withdrawFees()` — platform owner withdraws accumulated fees

Authorization: desk manager functions check `ownerOf(traderId)` on ERC-8004 Identity Registry. `resolveEntry` restricted to whitelisted operator address.

Set up operator wallet via Coinbase CDP server wallet for the server to call `resolveEntry`.

Add frontend contract interaction hooks (wagmi) for read operations (deal state, balances).

### Acceptance criteria

- [ ] `MarginCallEscrow.sol` compiles and all Foundry tests pass
- [ ] Contract deployed to Base Sepolia testnet
- [ ] Can create a deal and verify pot + fee deduction on-chain
- [ ] Can deposit and withdraw for a trader balance
- [ ] `resolveEntry` correctly moves funds based on positive/negative PnL
- [ ] Operator wallet configured and can call `resolveEntry` from server
- [ ] Wagmi hooks can read deal state and trader balances from contract

---

## Phase 2: ERC-8004 Trader Identity

**User stories**: Mint a trader agent as an NFT, derive its wallet, display traders in the frontend

### What to build

Integrate with the existing ERC-8004 Identity Registry on Base Sepolia (`0x8004A818BFB912233c491871b3d84c89A494BD9e`). When a desk manager creates a trader, mint an ERC-8004 NFT and deterministically derive the ERC-6551 Token Bound Account (the trader's wallet). Use direct contract interaction (not the Registry Broker SDK) for tight control over minting and wallet derivation.

Build the `POST /api/trader/create` route, `traders` Supabase table migration, and the `/traders` + `/traders/[id]` pages showing owned traders with their NFT identity and derived wallet address.

Trader metadata (name, mandate, capabilities) stored as `tokenURI` pointing to JSON.

### Acceptance criteria

- [ ] `POST /api/trader/create` mints ERC-8004 NFT to desk manager's wallet
- [ ] ERC-6551 Token Bound Account derived and stored in Supabase
- [ ] `traders` table migration applied
- [ ] `/traders` page lists desk manager's trader NFTs
- [ ] `/traders/[id]` page shows trader detail (name, wallet, status)
- [ ] Trader appears on Base block explorer as standard ERC-721

---

## Phase 3: Deal Creation (On-Chain)

**User stories**: Create a deal by calling the escrow contract directly from the frontend, browse deals

### What to build

Rewire the `/deals/create` page to call `createDeal()` on the escrow contract via wagmi (replacing the deleted API route). The frontend handles USDC approval + contract write. An event listener (or indexer) syncs new deals from contract events to the Supabase `deals` table so they appear in the deal list.

Keep the existing AI prompt suggestion flow. Update the `/deals` listing page to read from Supabase (already done) and the `/deals/[id]` detail page.

### Acceptance criteria

- [ ] `/deals/create` page calls escrow contract directly (USDC approve + createDeal)
- [ ] 5% fee deducted on-chain, visible in contract state
- [ ] New deals sync from contract events to Supabase `deals` table
- [ ] `/deals` page shows on-chain deals
- [ ] `/deals/[id]` shows deal detail with correct pot and entry cost
- [ ] AI prompt suggestions still work on create page

---

## Phase 4: Trader Funding & Withdrawal

**User stories**: Fund a trader's escrow balance, withdraw USDC from escrow back to wallet

### What to build

Add frontend flows for `depositFor(traderId, amount)` and `withdraw(traderId, amount)` on the escrow contract. Display escrow balance on the trader detail page. Update the `/settings` page to link to trader funding instead of the removed wallet page.

### Acceptance criteria

- [ ] Desk manager can deposit USDC into a trader's escrow balance from `/traders/[id]`
- [ ] Desk manager can withdraw USDC from a trader's escrow balance
- [ ] Escrow balance displayed on trader detail page (reads from contract)
- [ ] Settings page updated with new funding flow
- [ ] Requires NFT ownership (`ownerOf` check enforced by contract)

---

## Phase 5: Deal Entry + LLM Resolution + On-Chain Settlement

**User stories**: Trader enters a deal, GPT-5 mini resolves the outcome, funds settle on-chain, reputation posted

### What to build

Wire the existing `POST /api/deal/enter` route to the escrow contract. After GPT-5 mini resolves the outcome (already implemented), the server calls `resolveEntry(dealId, traderId, pnl, rake)` on the contract to settle funds. Then post the outcome to the ERC-8004 Reputation Registry (score, tags, outcome link). Mirror the result to Supabase.

Update the deal detail page to show on-chain settlement status (tx hash) alongside the existing narrative display.

### Acceptance criteria

- [ ] Deal entry triggers LLM resolution (already working)
- [ ] Server calls `resolveEntry()` on escrow contract after resolution
- [ ] Win: funds move from pot to trader balance (minus rake)
- [ ] Loss: funds move from trader balance to pot
- [ ] Rake credited to platform fees in contract
- [ ] Outcome posted to ERC-8004 Reputation Registry on Base Sepolia (`0x8004B663056A597Dffe9eCcC1965A193B7388713`)
- [ ] Outcome mirrored to Supabase with `on_chain_tx_hash`
- [ ] Correction flow still works (second LLM call if outcome was capped)
- [ ] Deal detail page shows tx hash for each outcome

---

## Phase 6: Agent Runtime (Autonomous Trade Loop)

**User stories**: Trader agent autonomously scans deals, evaluates against mandate, enters deals, logs activity

### What to build

Implement the `agent-trade-cycle` Vercel Workflow. Each active trader runs as an independent workflow instance that loops: scan deals → evaluate against mandate → check approval threshold → verify escrow balance → enter deal (calls `/api/deal/enter` internally) → log to `agent_activity_log` → sleep 30s → repeat.

Build the deal evaluator (mandate matching: risk tolerance, deal size filters, bankroll rules). Add `POST /api/trader/pause` and `POST /api/trader/resume` routes.

### Acceptance criteria

- [ ] Vercel Workflow `agent-trade-cycle` runs for an active trader
- [ ] Workflow scans open deals and filters by mandate
- [ ] Workflow skips deals that exceed balance or don't match filters
- [ ] Workflow enters eligible deals and logs to `agent_activity_log`
- [ ] Workflow sleeps 30s between cycles
- [ ] Workflow ends when trader is wiped out
- [ ] Pause/resume controls work (`/api/trader/pause`, `/api/trader/resume`)
- [ ] Activity logged to Supabase for each step

---

## Phase 7: Desk Manager Controls

**User stories**: Configure trader mandate, approve/reject big deals, close deals

### What to build

Build `POST /api/desk/configure` for updating trader mandate (risk tolerance, deal filters, approval threshold, bankroll rules). Implement the approval flow: when a deal exceeds the trader's approval threshold, the workflow pauses and creates a `deal_approvals` record. The desk manager approves/rejects via `POST /api/desk/approve`, which resumes the workflow.

Build the `/approvals` page showing pending approval requests. Add `closeDeal` flow from frontend (calls contract directly).

### Acceptance criteria

- [ ] Desk manager can configure trader mandate from `/traders/[id]`
- [ ] Mandate changes take effect on next agent cycle
- [ ] Deals above approval threshold pause the workflow
- [ ] `deal_approvals` record created with expiration
- [ ] Desk manager can approve/reject from `/approvals` page
- [ ] Approved deal resumes workflow; rejected deal skips
- [ ] Expired approvals auto-reject
- [ ] Desk manager can close their deal from `/deals/[id]` (contract call)
- [ ] Close deal requires 0 pending entries (enforced by contract)

---

## Phase 8: Dashboard + Realtime

**User stories**: Portfolio overview, live activity feed, realtime deal updates, approval notifications

### What to build

Build the `/` dashboard page with portfolio value, P&L chart (portfolio over time), and per-deal breakdown. Enable Supabase Realtime subscriptions on `deals`, `deal_outcomes`, `agent_activity_log`, `deal_approvals`, and `traders` tables.

Add a live agent activity feed to `/traders/[id]`. Real-time deal status updates on `/deals` and `/deals/[id]`. Approval queue with realtime updates on `/approvals`. On-chain reputation display (score, win/loss record) on trader pages.

### Acceptance criteria

- [ ] Dashboard shows total portfolio value across all traders
- [ ] P&L chart renders portfolio value over time
- [ ] Agent activity feed updates in realtime on trader detail page
- [ ] Deal list and detail pages update in realtime (new entries, pot changes)
- [ ] Approval queue updates in realtime (new requests, status changes)
- [ ] Trader pages show on-chain reputation score and win/loss record
- [ ] No polling — all updates via Supabase Realtime subscriptions

---

## Phase 9: Assets + Wipeout System

**User stories**: Traders gain/lose assets from deals, traders get wiped out when balance reaches 0

### What to build

Implement the asset system: deal outcomes can grant or remove assets (insider tips, contacts, SEC immunity, etc.) stored in the `assets` table. Assets are included in the LLM prompt for future deal resolutions (already partially in the message builder).

Implement wipeout conditions: when a trader's escrow balance reaches 0, the contract transfers any remaining value to the deal pot. Wipeout reasons (margin call, SEC bust, burnout, heart attack, prison) come from the LLM. The trader NFT remains as a permanent record of failure. Desk manager must mint a new trader to continue.

### Acceptance criteria

- [ ] Assets gained from deal outcomes stored in `assets` table
- [ ] Assets lost removed from trader's inventory
- [ ] Assets included in LLM prompt for deal resolution
- [ ] Trader wiped out when escrow balance reaches 0
- [ ] Wipeout transfers remaining value to deal pot (contract logic)
- [ ] Wipeout reason displayed on trader page
- [ ] Wiped-out trader's workflow ends permanently
- [ ] Trader NFT remains on-chain (permanent failure record)
- [ ] Desk manager can mint a new trader after wipeout

---

## Phase 10: AI Deal Prompt Suggestions

**User stories**: AI suggests deal prompts based on a theme

### What to build

Polish the existing `POST /api/prompt/suggest` flow and integrate it cleanly into the contract-based `/deals/create` page from Phase 3. The core LLM suggestion logic is already built — this phase ensures it works well with the new on-chain deal creation flow and refines the prompts/UX.

### Acceptance criteria

- [ ] Theme input generates 3 vivid 1980s Wall Street scenario prompts
- [ ] Selecting a suggestion populates the deal prompt field
- [ ] Works seamlessly with the contract-based deal creation flow
- [ ] System prompt in Supabase produces high-quality, varied suggestions
