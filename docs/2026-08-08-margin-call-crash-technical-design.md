# Technical Design: Margin Call — Crash Game Jam MVP

**Created:** August 8, 2026 · **Status:** Implementation specification · **Network:** Base Sepolia (`84532`)

This document defines how to implement the product guarantees in the [Crash MVP PRD](./2026-08-07-margin-call-crash-prd.md). Deferred modes and post-MVP token work belong in the [roadmap](./2026-08-08-margin-call-crash-roadmap.md), not in the MVP contracts unless explicitly promoted through a later design review.

## 1. Design invariants

1. Circle Base Sepolia tUSDC is the only MVP settlement and bankroll asset.
2. `BankrollVault` is the only contract that holds LP deposits and player margin.
3. `MarginCallCrash` owns game state but never holds a general tUSDC balance.
4. Every accepted ticket has a ticket-scoped vault reservation sufficient for its maximum payout.
5. The game can ask the vault only to accept and reserve an entry, release a reservation, pay a bounded claim, or refund bounded original margin.
6. A crash-randomness handle is created once before entries and cannot be replaced.
7. Only an attestation bound to that exact handle can finalize the round.
8. Later rounds do not depend on settlement of earlier rounds.
9. LP withdrawals cannot consume reserved liabilities or the safety buffer.
10. `$MARGIN` accounting is separate from vault asset accounting and cannot create a tUSDC claim.

## 2. Contract architecture

### `MarginCallCrash`

Responsibilities:

- Derive deterministic 60-second round epochs.
- Open rounds and create Inco confidential randomness before entry.
- Store round and ticket state.
- Enforce the 45-second entry window and one-ticket-per-wallet rule.
- Coordinate ticket-scoped vault entry and reservation.
- Request public reveal after lock and verify the Inco attestation.
- Derive and store the crash point.
- Coordinate claim, loss settlement, and expiry refund.

It has no function to transfer an arbitrary vault amount, choose a recipient unrelated to a ticket, or replace a result.

### `BankrollVault`

An ERC-4626-compatible vault over Circle tUSDC. Responsibilities:

- Receive LP deposits and mint proportional shares.
- Receive player margin directly from the player during entry.
- Track ticket-scoped and round-scoped reserved liability.
- Enforce live solvency, safety-buffer, per-round, per-ticket, and minimum-assets rules.
- Pay a ticket claim or expiry refund only when instructed by the authorized game and within that ticket's reservation.
- Release reservations after a confirmed loss or completed payment.
- Limit immediate redemption to free liquidity.
- Escrow and process constrained withdrawals in deterministic FIFO order.
- Checkpoint LP reward accounting around every eligible share-balance change.

Only the authorized game can invoke game-settlement methods. A game-address replacement is event-emitting, affects future entries only, and cannot strand or reassign existing reservations; migration of an active game requires an explicit separately reviewed procedure.

### `MarginToken`

A capped 18-decimal Base Sepolia ERC-20 named `Margin`, symbol `MARGIN`. The complete MVP allocation is minted once to `MarginRewards` or transferred to it at deployment. No distributor has unrestricted mint authority.

### `MarginRewards`

Responsibilities:

- Hold the fixed `$MARGIN` allocation.
- Lazily account for time-weighted rewards over eligible vault shares.
- Pause allocation consumption when eligible supply is zero.
- Checkpoint affected wallets before eligible balances change.
- Transfer only a caller's accrued amount on claim.

It never holds tUSDC, vault shares, or player liabilities.

## 3. Core state

Representative layouts may be optimized without changing behaviour.

```solidity
enum RoundStatus {
    Uninitialized,
    Open,
    RevealRequested,
    Finalized,
    Expired
}

struct Round {
    uint256 id;
    uint64 openAt;
    uint64 lockAt;
    uint64 expiresAt;
    EncryptedHandle crashRandom;
    uint256 crashPointBps;
    uint256 totalMargin;
    uint256 reservedPayout;
    RoundStatus status;
}

struct Ticket {
    uint256 id;
    address player;
    uint256 roundId;
    uint256 margin;
    uint256 leverageBps;
    uint256 reservedPayout;
    bool settled;
    bool claimed;
    bool refunded;
}

struct WithdrawalRequest {
    uint256 id;
    address owner;
    address receiver;
    uint256 shares;
    uint64 requestedAt;
    bool cancelled;
    bool processed;
}
```

Round transitions are:

```text
Uninitialized → Open → RevealRequested → Finalized
                           └────────────→ Expired
```

Finalized rounds cannot expire. Expired rounds cannot finalize. A ticket reaches exactly one terminal path: winning claim, settled loss, or expiry refund.

## 4. Time and round lifecycle

The Game Jam deployment uses immutable constructor values:

```text
roundDuration = 60 seconds
entryWindow = 45 seconds
expiryDelay = 15 minutes after lockAt
```

`openRound` derives the next epoch's `openAt` and `lockAt`, rejects duplicate initialization, pays the required Inco fee, and stores exactly one new encrypted randomness handle before setting the round to `Open`. Timing checks use `block.timestamp`.

`requestReveal` is permissionless after `lockAt`, idempotent at the workflow level, and changes only `Open` to `RevealRequested`. It marks the stored handle for public reveal; it does not accept a replacement handle.

`finalizeRound` verifies the covalidator signatures, expected chain and contract context, and exact stored handle before deriving plaintext. It stores the crash point and makes claims permissionless. Failure leaves the round retryable.

If the round remains unfinalized at `expiresAt`, a permissionless expiry transition marks it `Expired`. This is irreversible. Each ticket owner then pulls a refund separately.

## 5. Crash and payout math

The contract requests an encrypted integer `r` uniformly in `[0, 10000)`. After attested reveal:

```text
rawCrashBps = floor(9900 × 10000 / (10000 − r))
crashPointBps = min(rawCrashBps, 100000)
```

Leverage uses basis points, where `10000 = 1.00x`. Supported player values are `11000` through `100000`.

Ticket outcome:

```text
win = leverageBps <= crashPointBps

if win:
    payout = floor(margin × leverageBps / 10000)
else:
    payout = 0
```

The payout includes returned margin. The UI displays a raw result below `1.00x` as an immediate `1.00x` crash without changing settlement math. Arithmetic uses full-width multiplication/division or equivalent overflow-safe math and rounds down.

Tests cover `r = 0`, `r = 9999`, the cap boundary, leverage bounds, equality as a win, six-decimal margins, rounding, and deterministic distribution samples consistent with approximately `0.99 / m` reach probability.

## 6. Entry and reservation

### Atomic sequence

1. The player grants an exact or clearly bounded tUSDC allowance to `BankrollVault`.
2. The player calls `MarginCallCrash.enter(roundId, margin, leverageBps)`.
3. The game validates round, time, supported margin, leverage, and duplicate-entry rules.
4. The game derives `maximumPayout` and calls a game-only vault method with the player, round, ticket, margin, and maximum payout.
5. The vault transfers `margin` directly from the player into itself.
6. Using the post-transfer live tUSDC balance, the vault validates all capacity and exposure limits and records the ticket reservation.
7. The game stores the ticket and emits entry only after the vault call succeeds.

Any failure reverts the whole transaction, including the tUSDC transfer and reservation. Neither the game nor an intermediate adapter retains player margin.

### Capacity math

```text
maximumPayout = floor(margin × leverageBps / 10000)
additionalBackingRequired = maximumPayout − margin

assetsAfterTransfer = live vault tUSDC balance
reservedAfterEntry = reservedLiabilities + maximumPayout
safetyBufferAfterEntry = ceil(assetsAfterTransfer × 20%)
freeLiquidityAfterEntry = assetsAfterTransfer
                        − reservedAfterEntry
                        − safetyBufferAfterEntry
```

The intuitive pre-transfer admission check is that existing free backing covers `additionalBackingRequired`, but the authoritative check uses post-transfer live balances and all restrictions atomically.

Entry rejects when any condition fails:

- Vault assets after transfer are below `10,000 tUSDC` (below this floor, 1% of assets would cap tickets under the full `10 tUSDC × 10.00x` matrix).
- Total reserved liability would exceed assets net of the safety buffer.
- The round's reserved payout would exceed 25% of vault assets.
- The ticket reservation exceeds the lower of `100 tUSDC` or 1% of vault assets.
- The ticket or reservation key already exists.

The vault records reservation by ticket and aggregate reservation by round. `reservedLiabilities` is the sum of unresolved ticket reservations, not merely projected profit exposure.

## 7. Settlement and recovery

### Winning claim

1. The caller invokes `claim`; the recipient is the ticket owner or an owner-selected receiver covered by authorization.
2. The game requires a finalized round, winning comparison, and an unsettled ticket.
3. The game computes the payout and invokes the ticket-scoped vault payment.
4. The vault verifies the caller is the authorized game, the reservation matches the ticket and round, and `payout <= reservedPayout`.
5. State marks the reservation consumed and ticket settled before safe transfer.
6. The vault transfers the exact payout from its tUSDC balance.

The transaction is atomic. A failed transfer rolls back both game and vault state, so the claim remains retryable. Any reservation excess created by rounding is released in the same transaction.

### Losing settlement

A permissionless `claim` or `settleLoss` verifies the finalized loss, marks the ticket settled, and tells the vault to release the full reservation. No tUSDC moves; the posted margin already remains in vault assets. A losing ticket cannot later claim or refund.

### Expiry refund

For an `Expired` round, only the ticket owner can pull exactly the original margin. The game calls a ticket-scoped vault refund bounded by the existing reservation. The vault consumes the reservation and transfers the refund atomically. No payout is derived from an unavailable or partially revealed result.

### Reservation lifecycle

```text
entry accepted → reservation active
win claimed    → payout sent, reservation consumed
loss settled   → reservation released, no transfer
round expired  → original margin refunded, reservation consumed
```

No generic administrative release is available for live tickets. Recovery calls are permissionless where safe, idempotent through explicit state, and emit enough information for an indexer to reconstruct unresolved obligations.

## 8. LP accounting and withdrawals

### ERC-4626 accounting

LP deposits use standard proportional ERC-4626 conversion against live vault assets and outstanding shares. Player margin and payouts change `totalAssets`, so share value participates in realized game results. Reserved liabilities constrain liquidity but are not removed from `totalAssets` until paid.

Views expose at least:

```text
totalAssets
totalSupply
assetsPerShare
reservedLiabilities
safetyBuffer
freeLiquidity
roundExposure(roundId)
realizedGamePnl
maxWithdraw(owner)
maxRedeem(owner)
```

Free liquidity is never negative and is calculated from live assets less reservations and the required buffer. Client estimates are advisory; the transaction-time vault check is authoritative.

### Immediate withdrawal

`withdraw` and `redeem` follow ERC-4626 semantics but cap execution at the owner's proportional free liquidity. A request that cannot fully execute immediately does not partially drain reserved capital. The UI offers the queue path.

Before share burn, `BankrollVault` checkpoints the owner in `MarginRewards`. The burn and tUSDC transfer are atomic.

### FIFO queue

`requestWithdrawal(shares, receiver)`:

- Checkpoints the owner and global reward accumulator.
- Moves the exact shares into non-eligible vault escrow.
- Creates the next monotonically increasing request ID.
- Removes those shares from eligible reward supply immediately.
- Does not promise a fixed tUSDC amount; conversion occurs when processed at then-current share value.

Only the oldest live request is processable. Cancelled requests are skipped. If free liquidity cannot satisfy the head request in full, it stays queued; a later request cannot bypass it.

`processWithdrawal(requestId)` is permissionless. It verifies FIFO position and sufficient free liquidity, checkpoints global rewards, converts the escrowed shares using current ERC-4626 accounting, marks the request processed, burns the shares, advances the queue head, and transfers tUSDC atomically.

`cancelWithdrawal(requestId)` is owner-only while unprocessed. It marks the request cancelled, returns the escrowed shares, advances the head if applicable, and restores reward eligibility only from the cancellation checkpoint forward. Time in queue earns no retroactive reward.

Permissionless queue processing and cancellation provide recovery if the LP or primary keeper is offline. Failed processing changes no ownership and can be retried when liquidity becomes free.

## 9. Reward accumulator

Representative state:

```solidity
uint256 rewardPerShareStored;
uint256 lastUpdateTime;
uint256 emissionRate;
uint256 remainingRewardAllocation;
uint256 eligibleShareSupply;

mapping(address => uint256) userRewardPerSharePaid;
mapping(address => uint256) accruedRewards;
```

Use a documented fixed-point scale, for example `1e27`, and round down.

### Global checkpoint

```text
elapsed = block.timestamp − lastUpdateTime
scheduled = min(elapsed × emissionRate, remainingRewardAllocation)

if eligibleShareSupply > 0:
    increment = floor(scheduled × SCALE / eligibleShareSupply)
    distributable = floor(increment × eligibleShareSupply / SCALE)
    rewardPerShareStored += increment
    remainingRewardAllocation -= distributable
else:
    distributable = 0

lastUpdateTime = block.timestamp
```

Rounding dust stays funded and undistributed. Aggregate claims cannot exceed the token balance or funded allocation. When eligible supply is zero, time advances but allocation is not consumed; the estimated end time moves later.

### Wallet checkpoint

```text
delta = rewardPerShareStored − userRewardPerSharePaid[account]
newReward = floor(eligibleBalance(account) × delta / SCALE)
accruedRewards[account] += newReward
userRewardPerSharePaid[account] = rewardPerShareStored
```

The vault checkpoints affected accounts immediately before every share mint, burn, transfer, queue, or queue cancellation:

- Mint/burn checkpoints the receiver/owner on the pre-change balance.
- Transfer checkpoints sender and receiver before moving shares.
- Queue checkpoints the owner before shares leave eligible supply.
- Cancellation checkpoints before shares re-enter eligible supply.
- Processing queued shares cannot create a new entitlement.

`claimMarginRewards(receiver)` advances global and caller checkpoints, reads the accrued amount, sets it to zero, and transfers exactly that amount using checks-effects-interactions. It does not alter shares or tUSDC rights.

The emission rate is immutable or may only be reduced through a disclosed, event-emitting safety control. It cannot be increased, and distribution ends when the allocation is exhausted.

## 10. External interface requirements

Exact Solidity signatures may vary, but equivalent behaviour and access boundaries are required.

### Game

- `openRound()` — permissionlessly open the next eligible epoch and create its Inco handle.
- `enter(roundId, margin, leverageBps)` — validate entry and atomically coordinate direct-to-vault margin plus reservation.
- `requestReveal(roundId)` — permissionlessly begin reveal after lock.
- `finalizeRound(roundId, plaintext, signatures)` — verify the attestation and finalize the exact stored handle.
- `claim(roundId)` — atomically pay a win or settle a loss.
- `settleLoss(roundId, player)` — optional permissionless explicit loss settlement.
- `expireRound(roundId)` — permissionlessly mark an eligible unresolved round expired.
- `refund(roundId)` — return original margin to the owner after expiry.
- Reads for current/next round, round details, ticket, claimability, refundability, and history pagination.

### Vault game-only interface

- `acceptEntry(roundId, ticketId, player, margin, maximumPayout)` — pull margin directly into the vault, enforce limits, and reserve.
- `payClaim(roundId, ticketId, recipient, payout)` — pay no more than the ticket reservation and consume it.
- `settleLoss(roundId, ticketId)` — release the reservation without transfer.
- `refundMargin(roundId, ticketId, recipient, margin)` — return no more than original margin and consume the reservation.

### Vault LP interface

- Standard `deposit`, `mint`, `withdraw`, and `redeem` with free-liquidity restrictions.
- `requestWithdrawal(shares, receiver)`.
- `cancelWithdrawal(requestId)`.
- `processWithdrawal(requestId)`.
- Reads for vault assets, shares, share price, reservations, buffer, free liquidity, exposure, queue position, and immediate withdrawal limits.

### Rewards

- `checkpoint(account)` — vault-only balance-change checkpoint.
- `claimMarginRewards(receiver)`.
- Reads for `earned(account)`, `rewardPerShare()`, `emissionRate()`, `remainingRewardAllocation()`, `eligibleShareSupply()`, and estimated exhaustion at current supply.

## 11. Required events

Events include indexed round, ticket, request, and wallet identifiers plus amounts needed to reconstruct state:

- `RoundOpened`
- `TicketEntered`
- `RevealRequested`
- `RoundFinalized`
- `RoundExpired`
- `TicketClaimed`
- `TicketLossSettled`
- `TicketRefunded`
- `LiabilityReserved`
- `LiabilityReleased`
- `VaultDeposit`
- `VaultWithdrawal`
- `WithdrawalRequested`
- `WithdrawalCancelled`
- `WithdrawalProcessed`
- `MarginRewardsClaimed`
- `MarginEmissionRateReduced`, if the reduction-only control exists
- `AuthorizedGameChanged`, if future-game replacement is supported

No event exposes private plaintext before finalization.

## 12. Keeper and automation

Contracts do not wake on timers. A small keeper:

1. Opens the next minute's round.
2. Requests reveal after lock.
3. Fetches the covalidator's attested reveal.
4. Submits finalization.
5. Optionally expires overdue rounds and processes eligible withdrawal-queue heads.

Every keeper transition is permissionless and idempotent or safely retryable. The keeper chooses no outcome, receives no early decryption access, and cannot replace a handle. It stores credentials server-side, waits for successful receipts, and resumes from onchain state after restart.

If the keeper fails, players or another caller can perform the same transitions. Later epochs continue independently. Monitoring alerts on missed open, delayed reveal, failed attestation, expiry eligibility, queue backlog, and low free liquidity; alerts do not become settlement authority.

## 13. Client, indexing, and transaction state

- Contract reads and successful receipts are authoritative.
- Submitted hashes remain pending until a successful receipt.
- Failed or replaced transactions expose retry without optimistic ownership changes.
- Countdown and entry eligibility use contract timestamps corrected against chain time.
- An indexer may serve history but must preserve delayed and expired states and link back to raw events and transactions.
- The interface never silently changes the signed round ID after a missed lock.
- Approval completes before the timed entry decision and shows spender, cap, and contract address.
- Reduced-motion, colour-independent status, and sound-independent text are required.

## 14. Security and test plan

### Security controls

- Pin matching Inco package and covalidator versions.
- Bind attestations to chain, contract, round, and exact encrypted handle.
- Use safe transfer helpers and handle non-successful ERC-20 operations.
- Apply checks-effects-interactions and reentrancy guards to entry, settlement, deposit, reward, and withdrawal paths.
- Reject duplicate rounds, tickets, settlement, claims, refunds, and queue processing.
- Keep owner controls unable to edit outcomes or consume reservations.
- Emit every administrative change.
- Keep keys, RPC credentials, and keeper secrets out of client code and source control.

### Deterministic contract tests

- Round epoch, lock, reveal, finalization, delay, expiry, and overlapping-round state machines
- Inco handle binding and invalid/replayed attestation rejection
- Crash formula, cap, comparison equality, payout rounding, and sampled distribution
- Direct-to-vault player margin and full atomic rollback on failed admission
- Safety buffer, minimum assets, per-round, per-ticket, and total reservation limits
- Winning claim, loss release, expiry refund, failed-transfer retry, and replay rejection
- ERC-4626 deposit/share conversion and share-value change after game results
- Immediate withdrawal limits and inability to consume reserved or buffered assets
- FIFO queue creation, head blocking, cancellation, processing, current-price conversion, and recovery
- Accumulator precision, dust, zero-supply pause, allocation exhaustion, transfers, mint/burn, queue exclusion, cancellation, and claim
- Authorization boundaries and reentrancy

### Base Sepolia smoke test

Record a complete 60-second round with player approval, direct vault receipt, reservation, Inco handle, lock, attestation, finalization, and claim or loss settlement. Separately record LP deposit, constrained withdrawal request, cancellation or processing, and `$MARGIN` claim. Preserve contract addresses and transaction hashes in the deployment record.
