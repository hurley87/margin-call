# Margin Call: Contract + Convex + App Review Findings

Audit of the escrow contract, Convex agent/runtime layer, and MCP/API boundary. The on-chain FIFO ordering bug in `resolveEntry` is documented separately in [contract-fifo-fix.md](./contract-fifo-fix.md) and is **not** repeated here.

Findings are ranked by severity. Each item includes location, description, suggested fix, and verification.

---

## High

### A1 — Double on-chain entry on HTTP retry

**Location:** `src/app/api/deal/enter/route.ts` ~231–266; `convex/deals.ts` `recordVerifiedEntry` ~402–444; `contracts/src/MarginCallEscrow.sol` `enterDeal` ~146–158

**Issue:** The route calls `enterDeal` on-chain before `recordVerifiedEntry` in Convex. If the mutation fails (500), a retry finds no Convex row and calls `enterDeal` again — debiting `entryCost` twice. The contract has no same-deal dedup.

**Fix:** Record a pending entry in Convex keyed on `(traderId, dealId)` before the chain call; add uniqueness enforcement on `dealEntries.byTraderAndDeal`; add contract `_pendingEntry` dedup (coordinate with FIFO fix).

**Verify:** Unit test: simulate Convex failure after chain success → retry must not call `enterDeal` again. `forge test` for duplicate entry revert.

---

### A2 — `ensure-depositor` is unauthenticated

**Location:** `src/app/api/trader/[id]/ensure-depositor/route.ts` ~18–76

**Issue:** Anyone who knows a trader id can trigger operator-key `setDepositorOnChain` writes (gas griefing / unsolicited on-chain state changes).

**Fix:** Require Privy auth + `ownerSubject` match (mirror `sync-balance/route.ts`); add rate limiting.

**Verify:** Unauthenticated POST returns 401; wrong owner returns 403; owner succeeds.

---

### M1 — fund/withdraw confirm doesn't verify tx semantics

**Location:** `convex/mcp/tradersEscrow.ts` `fundConfirmForMcp` ~279–298, `withdrawConfirmForMcp` ~420–439

**Issue:** Confirm only checks `verifyTxSucceeded(txHash)` then resyncs balance. It never decodes receipt logs to prove the tx was the expected `depositFor`/`withdraw` for the intent's `tokenId` and amount. Contrast with `createConfirmForMcp` event binding in `convex/mcp/dealsEscrow.ts`.

**Fix:** Decode escrow `Deposit`/`Withdrawal` events from the receipt; require `traderId` and amount match intent payload before `markConfirmed`.

**Verify:** Confirm with unrelated successful txHash must fail; confirm with correct tx succeeds.

---

### M2 — `/mcp/desks/sync-wallet` trusts caller-supplied balance

**Location:** `convex/http.ts` ~267–328; `convex/deskManagers.ts` `syncWalletBalance` ~164–171

**Issue:** Convex sync accepts caller-supplied `balanceUsdc` with no on-chain re-read. If `MCP_SERVICE_TOKEN` leaks, an attacker can inflate `walletBalanceUsdc` and pass the `create_trader` funding gate without real USDC.

**Fix:** Re-read USDC `balanceOf(desk.walletAddress)` server-side in a `"use node"` action; ignore client-supplied balance for the authoritative write.

**Verify:** POST with inflated `balanceUsdc` but empty wallet → stored balance matches chain, not body.

---

### R1 — PnL idempotency is global, not per-outcome

**Location:** `convex/traders.ts` `applyOutcomeBalance` ~799–804

**Issue:** Idempotency uses `trader.lastOutcomeId === outcomeId`. Re-applying an _older_ outcome after a newer one re-adds its PnL.

**Fix:** Add `balanceAppliedAt` on `dealOutcomes`; skip apply when already set; set on first apply.

**Verify:** Apply outcome A, then B, then replay A → balance unchanged.

---

### R2 — `queue_not_head` early return skips `applyOutcomeBalance`

**Location:** `convex/agent/cycle.ts` ~920–939, ~430–486

**Issue:** On FIFO mismatch the outcome is persisted but the cycle returns before applying PnL. The retry path (3c) re-resolves on-chain but also never calls `applyOutcomeBalance`.

**Fix:** After successful on-chain resolve in 3c, call `applyOutcomeBalance`; add `findUnappliedBalanceOutcome` recovery query.

**Verify:** Simulate queue_not_head → next cycle applies balance without re-LLM.

---

## Medium

### C1 — Operator can drain any trader via `setDepositor`

**Location:** `contracts/src/MarginCallEscrow.sol` ~119–123

**Issue:** `setDepositor` can re-point at any address anytime, even with a live balance; the new depositor can `withdraw` everything.

**Fix:** Only allow first bind, or re-bind only when `balances[traderId] == 0`; emit old/new depositor.

**Verify:** `forge test`: re-bind with non-zero balance reverts.

---

### M3 — `set_desk_wallet` rebind without proof of control

**Location:** `convex/mcp/desks.ts` `setWalletForMcp` ~120–141

**Issue:** Stolen `mc_live_*` key can overwrite `walletAddress`; future prepares target attacker wallet.

**Fix:** One-way bind after first set, or require signature over `deskManagerId + wallet`.

**Verify:** Second `set_desk_wallet` with different address rejected when already bound.

---

### R3 — `syncEscrowBalance` never reconciles wipeout status

**Location:** `convex/traders.ts` ~864–876

**Issue:** Chain sync can set balance to 0 while `status` stays `"active"`. Wipeout email only fires in `applyOutcomeBalance`.

**Fix:** When synced balance `<= 0`, transition to `wiped_out` via same idempotent email path.

**Verify:** Sync zero balance → status `wiped_out`, email notification queued once.

---

### R4 — Approval consumed before entry confirmed

**Location:** `convex/agent/cycle.ts` ~658–661

**Issue:** `consume` runs before `callDealEnter`. Non-409/423 entry failure throws with approval already spent.

**Fix:** Consume only after verified entry (`recordVerifiedEntry` success or `already_entered`).

**Verify:** Entry failure → approval still `approved`; successful entry → consumed.

---

### R5 — Query hygiene (`Date.now()`, unbounded collects, filter-after-index)

**Location:** `convex/dealApprovals.ts`, `convex/agent/internal.ts`, `convex/dealOutcomes.ts`, `convex/deals.ts`, `convex/portfolio.ts`

**Issue:** `Date.now()` in query handlers breaks Convex caching; several unbounded `.collect()` and post-index `.filter()` paths.

**Fix:** Pass `now` as arg from actions; add composite indexes; paginate hot lists.

**Verify:** Queries compile; scheduler passes `now`; no functional regressions in vitest.

---

## Low (documented; fix as capacity allows)

| ID  | Summary                                                     | Location                          |
| --- | ----------------------------------------------------------- | --------------------------------- |
| C2  | `identityRegistry` stored but never read                    | `MarginCallEscrow.sol`            |
| C3  | No ownership transfer / renounce                            | `MarginCallEscrow.sol`            |
| C4  | `OperatorUpdated` event ambiguous (add vs remove)           | `MarginCallEscrow.sol`            |
| C5  | `enterDeal` no same-deal dedup (paired with A1)             | `MarginCallEscrow.sol`            |
| —   | Convex `potUsdc` drifts from on-chain pot                   | `convex/dealOutcomes.ts`          |
| —   | `assetsGained`/`assetsLost` never written to `assets` table | `convex/agent/cycle.ts`           |
| —   | `portfolio.forDesk` counts `pnl === 0` as loss              | `convex/portfolio.ts`             |
| —   | `traderTransactions` table never written                    | `convex/schema.ts`                |
| —   | Float USDC conversions risk sub-cent drift                  | `convex/agent/cycle.ts`           |
| —   | SIWA nonce mint / MCP key issuance unrate-limited           | `src/app/api/siwa/nonce/route.ts` |

---

## Implementation status

Fixes implemented in this branch:

| ID    | Status                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| A1    | `beginEntryRecording` + `recordVerifiedEntry` pair guard; route calls claim before `enterDeal`                                    |
| A2    | Privy auth on `ensure-depositor`                                                                                                  |
| C1–C5 | Contract: FIFO removed, `_pendingEntry` dedup, `setDepositor` lock, 2-step ownership, `OperatorUpdated(authorized)`               |
| M1    | Fund/withdraw confirm decode `Deposit`/`Withdrawal` events                                                                        |
| M2    | `syncWalletFromChainForMcp` reads chain balance authoritatively                                                                   |
| M3    | One-way `set_desk_wallet` bind                                                                                                    |
| R1    | Per-outcome `balanceAppliedAt` idempotency                                                                                        |
| R2    | `findUnappliedBalanceOutcome` + apply in cycle 3c; ghost-resolve stamps `reconciled:*` on `already_resolved` / `No pending entry` |
| R3    | `syncEscrowBalance` reconciles wipeout status                                                                                     |
| R4    | Approval consume deferred until verified entry                                                                                    |
| R5    | Partial: `now` args on internal queries, `take()` limits on hot scans                                                             |

**Contract redeploy:** Changes C1–C5 and the FIFO fix ship together. See [contract-fifo-fix.md](./contract-fifo-fix.md) for migration steps.

**Validation checklist after fixes:**

- `forge test` in `contracts/`
- `pnpm exec vitest run` (especially `tests/convex/cycle-idempotency.test.ts`)
- `pnpm lint`
