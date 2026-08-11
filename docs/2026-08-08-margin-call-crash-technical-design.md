# Technical Design: Margin Call — Crash Game Jam MVP

**Created:** August 8, 2026 · **Updated:** August 9, 2026 · **Status:** Implementation specification · **Network:** Base Sepolia (`84532`)

This document defines how to implement the product guarantees in the [Crash MVP PRD](./2026-08-07-margin-call-crash-prd.md). Deferred modes and post-MVP token work belong in the [roadmap](./2026-08-08-margin-call-crash-roadmap.md), not in the MVP contracts unless explicitly promoted through a later design review. Terminology follows the canonical glossary in [CONTEXT.md](../CONTEXT.md).

## 1. Design invariants

1. Desk Dollars (`tUSD`), a project-deployed Base Sepolia ERC-20, is the only MVP settlement and bankroll asset.
2. `BankrollVault` is the only contract that holds LP deposits and player margin.
3. `MarginCallCrash` owns game state but never holds a general tUSD balance.
4. Every accepted ticket has a ticket-scoped vault reservation sufficient for its maximum payout.
5. The game can ask the vault only to accept and reserve an entry, release a reservation, pay a bounded claim, or refund bounded original margin.
6. A round's crash-randomness handle is created exactly once, before any of its tickets is accepted, and cannot be replaced.
7. Only an attestation bound to that exact handle can finalize the round.
8. Later rounds do not depend on settlement of earlier rounds.
9. LP withdrawals cannot consume reserved liabilities or the safety buffer.
10. No lifecycle transition depends on the keeper: rounds are created on demand and every transition is permissionless.
11. Share pricing excludes pending obligations from verified outcomes: a publicly known result is reflected in share value before anyone can trade against it.

## 2. Contract architecture

### `MarginCallCrash`

Responsibilities:

- Derive deterministic 60-second round epochs.
- Create rounds lazily on an epoch's first entry, or ahead of demand via permissionless pre-open, generating Inco confidential randomness before any ticket is accepted.
- Store round and ticket state.
- Enforce the 45-second entry window and one-ticket-per-wallet rule.
- Coordinate ticket-scoped vault entry and reservation.
- Request public reveal after lock and verify the Inco attestation.
- Derive and store the crash point.
- Coordinate claim, loss settlement, and expiry refund.

It has no function to transfer an arbitrary vault amount, choose a recipient unrelated to a ticket, or replace a result.

### `BankrollVault`

An ERC-4626-compatible vault over `tUSD`. Responsibilities:

- Receive LP deposits and mint proportional shares.
- Receive player margin directly from the player during entry.
- Track ticket-scoped and round-scoped reserved liability.
- Enforce live solvency, safety-buffer, per-round, per-ticket, and minimum-assets rules.
- Pay a ticket claim or expiry refund only when instructed by the authorized game and within that ticket's reservation.
- Release reservations after a confirmed loss or completed payment.
- Limit redemption to free liquidity.

Only the authorized game can invoke game-settlement methods. A game-address replacement is event-emitting, affects future entries only, and cannot strand or reassign existing reservations; migration of an active game requires an explicit separately reviewed procedure.

The previously drafted Margin Call (`$CALL`) reward token and distributor contracts, and the constrained FIFO withdrawal queue, are deferred to the [roadmap](./2026-08-08-margin-call-crash-roadmap.md) and are not part of the MVP.

### `DeskDollars`

A project-deployed 6-decimal ERC-20 named Desk Dollars, symbol `tUSD`. Deployment mints the `25,000 tUSD` bankroll seed for the initial LP deposit. A public faucet function lets any wallet claim `100 tUSD` with a one-hour per-wallet cooldown; no other unrestricted mint authority exists. The token never presents itself as Circle USDC and must never be deployed to mainnet.

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

```

Round transitions are:

```text
Uninitialized → Open → RevealRequested → Finalized
                  └─────────┴──────────→ Expired
```

Finalized rounds cannot expire. Expired rounds cannot finalize. A round past `expiresAt` may expire from `Open` or `RevealRequested`, so a round is never stranded by a missing reveal request. A ticket reaches exactly one terminal path: winning claim, settled loss, or expiry refund.

## 4. Time and round lifecycle

The Game Jam deployment uses immutable constructor values:

```text
epochOrigin = deployment-configured Unix timestamp
roundDuration = 60 seconds
entryWindow = 45 seconds
expiryDelay = 15 minutes after lockAt
```

Round ids are zero-based relative to `epochOrigin`. Calls before that origin revert. At or after the origin, timing is derived without mutable scheduling state:

```text
currentRoundId = floor((block.timestamp - epochOrigin) / roundDuration)
openAt(roundId) = epochOrigin + roundId × roundDuration
lockAt(roundId) = openAt(roundId) + entryWindow
expiresAt(roundId) = lockAt(roundId) + expiryDelay
```

At any timestamp only `currentRoundId` and `currentRoundId + 1` may be initialized; past or farther-future ids revert. Entry is open strictly while `block.timestamp < lockAt`. Interface phase is derived from these contract timestamps and is distinct from stored lifecycle status: for example, a round may retain stored status `Open` after `lockAt` until a later transition while the interface correctly displays that entry is locked.

A round is created in one of two equivalent ways: permissionless `openRound(roundId)` initializes an explicitly named valid epoch, or the epoch's first `enter` creates the round inline. Both creation paths require the caller to supply the Inco fee (`msg.value >= inco.getFee()`), consume exactly the fee, refund any excess in the same transaction, and store exactly one encrypted randomness handle before any ticket is accepted. The encrypted handle is public ciphertext and remains inspectable onchain; confidentiality means that no player, opener, operator, or administrator receives permission to decrypt its plaintext while entry is open. Solidity visibility is not a confidentiality boundary.

`openRound` rejects an already-initialized epoch. `enter` is race-tolerant instead: if the epoch was concurrently initialized between a player's simulation and inclusion — by a keeper pre-open or a competing first entry — it refunds the entire `msg.value` and proceeds with the entry, so losing the creation race never costs a player the 45-second window. The game contract sponsors no fees: fee accounting uses only the current call's `msg.value`, never pre-existing contract balance, and successful flows retain no caller-supplied ETH. ETH forced in from outside (for example via `SELFDESTRUCT`) is inert — it can neither fund a round nor change any refund. Permissionless pre-opening therefore cannot drain operator funding: whoever materializes a round — keeper, player, or stranger — pays its randomness fee. An untouched epoch — no pre-open and no entry — creates no round state; a pre-opened round that never receives a ticket carries no vault exposure, requires no maintenance, and may be expired purely for hygiene. Timing checks use `block.timestamp`.

`requestReveal` is permissionless after `lockAt`, idempotent at the workflow level, and changes only `Open` to `RevealRequested`. It marks the stored handle for public reveal; it does not accept a replacement handle.

`finalizeRound` verifies the covalidator signatures, expected chain and contract context, and exact stored handle before deriving plaintext. It stores the crash point and makes claims permissionless. Failure leaves the round retryable.

The expiry boundary is strict and exclusive: `requestReveal` and `finalizeRound` require `block.timestamp < expiresAt`, and `expireRound` requires `block.timestamp >= expiresAt`, so at any instant exactly one terminal path is available and a round past `expiresAt` is deterministically a refund even before anyone marks it `Expired`.

If the round remains unfinalized at `expiresAt`, a permissionless expiry transition marks it `Expired` from `Open` or `RevealRequested`. This is irreversible. Each ticket owner then pulls a refund separately; a pre-opened round with no tickets can be expired the same way purely for hygiene.

## 5. Crash and payout math

The contract requests an encrypted integer `r` uniformly in `[0, 10000)`. After attested reveal:

```text
rawCrashBps = floor(9900 × 10000 / (10000 − r))
crashPointBps = min(rawCrashBps, 100000)
```

Leverage uses basis points, where `10000 = 1.00x`. Supported values are exactly the six tiers `12500`, `15000`, `20000`, `30000`, `50000`, and `100000`; any other value reverts. With the distribution above, tier reach probabilities are exactly `7920`, `6600`, `4950`, `3300`, `1980`, and `990` per `10000`, giving every tier the same expected gross return of `0.99 × margin`.

Ticket outcome:

```text
win = leverageBps <= crashPointBps

if win:
    payout = floor(margin × leverageBps / 10000)
else:
    payout = 0
```

The payout includes returned margin. The UI displays a raw result below `1.00x` as an immediate `1.00x` crash without changing settlement math. Arithmetic uses full-width multiplication/division or equivalent overflow-safe math and rounds down.

Tests cover `r = 0`, `r = 9999`, the cap boundary, rejection of non-tier leverage values, equality as a win, six-decimal margins, rounding, and deterministic distribution samples matching the exact per-tier reach probabilities.

## 6. Entry and reservation

### Atomic sequence

1. The player grants a one-time bounded `1,000 tUSD` allowance to `BankrollVault` when current allowance is below the selected margin. Subsequent entries reuse that allowance. The interface never requests an unlimited allowance and does not offer exact-per-entry approval or atomic approve+enter batching.
2. The player calls `MarginCallCrash.enter(roundId, margin, leverageBps)` as a separate sponsored transaction.
3. The game validates round, time, supported margin, leverage, and duplicate-entry rules.
4. The game derives `maximumPayout` and calls a game-only vault method with the player, round, ticket, margin, and maximum payout.
5. The vault transfers `margin` directly from the player into itself.
6. Using the post-transfer live tUSD balance, the vault validates all capacity and exposure limits, records the ticket reservation, and adds the margin to `unrecognizedMargin`, so an accepted entry leaves share pricing exactly unchanged.
7. The game stores the ticket and emits entry only after the vault call succeeds.

Any failure reverts the whole transaction, including the tUSD transfer and reservation. Neither the game nor an intermediate adapter retains player margin.

### Capacity math

```text
maximumPayout = floor(margin × leverageBps / 10000)
additionalBackingRequired = maximumPayout − margin

assetsAfterTransfer = live vault tUSD balance (grossAssets)
reservedAfterEntry = reservedLiabilities + maximumPayout
safetyBufferAfterEntry = ceil(assetsAfterTransfer × 20%)
freeLiquidityAfterEntry = assetsAfterTransfer
                        − reservedAfterEntry
                        − safetyBufferAfterEntry
```

The intuitive pre-transfer admission check is that existing free backing covers `additionalBackingRequired`, but the authoritative check uses post-transfer live balances and all restrictions atomically.

Entry rejects when any condition fails:

- Vault assets after transfer are below `10,000 tUSD` (below this floor, 1% of assets would cap tickets under the full `10 tUSD × 10.00x` matrix).
- Total reserved liability would exceed assets net of the safety buffer.
- The round's reserved payout would exceed 25% of vault assets.
- The ticket reservation exceeds the lower of `100 tUSD` or 1% of vault assets.
- The ticket or reservation key already exists.

The vault records reservation by ticket, aggregate reservation by round, and aggregate reserved payout per Arcade Leverage tier within each round. `reservedLiabilities` is the sum of unresolved ticket reservations, not merely projected profit exposure. The per-tier aggregates exist so finalization can compute the round's total winning liability in O(tiers).

## 7. Settlement and recovery

### Winning claim

1. The caller invokes `claim`; the recipient is the ticket owner or an owner-selected receiver covered by authorization.
2. The game requires a finalized round, winning comparison, and an unsettled ticket.
3. The game computes the payout and invokes the ticket-scoped vault payment.
4. The vault verifies the caller is the authorized game, the reservation matches the ticket and round, and `payout <= reservedPayout`.
5. State marks the reservation consumed, reduces `pendingObligations` by the payout, and marks the ticket settled before safe transfer.
6. The vault transfers the exact payout from its tUSD balance.

The transaction is atomic. A failed transfer rolls back both game and vault state, so the claim remains retryable. Any reservation excess created by rounding is released in the same transaction.

### Losing settlement

A permissionless `claim` or `settleLoss` verifies the finalized loss, marks the ticket settled, and tells the vault to release the full reservation. No tUSD moves; the posted margin already remains in vault assets. A losing ticket cannot later claim or refund.

### Expiry refund

For an `Expired` round, only the ticket owner can pull exactly the original margin. The game calls a ticket-scoped vault refund bounded by the existing reservation. The vault consumes the reservation and the matching `pendingObligations` amount and transfers the refund atomically. No payout is derived from an unavailable or partially revealed result.

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

The vault's live tUSD balance is exposed as `grossAssets`. The ERC-4626 `totalAssets()` function returns net assets — `grossAssets − pendingObligations − unrecognizedMargin` — so every standard `convertTo*` and `preview*` function prices on the net base with no nonstandard overrides, and share value participates in game results exactly when they are verified. Wherever this document reasons about capacity or balances it says `grossAssets`; wherever it reasons about share pricing it means the net `totalAssets()`.

Reserved payout capacity constrains liquidity but does not reduce share pricing while a round's outcome is unknown. Margin recognition is deferred: entry adds each ticket's margin to both `grossAssets` (the tokens arrive) and `unrecognizedMargin` (they are not yet earned), so accepting entries leaves share pricing exactly unchanged. Once an outcome is verified, the vault marks to market immediately:

- `finalizeRound` removes the round's `totalMargin` from `unrecognizedMargin` and sums the per-tier reserved payouts at or below the crash point — O(tiers) — into `pendingObligations`. Share value moves by exactly the round's realized result, `totalMargin − winningLiability`: it rises the moment a net-losing round finalizes and falls the moment a net-winning round finalizes, before any claim is pulled.
- Expiry moves the round's `totalMargin` from `unrecognizedMargin` to `pendingObligations`, leaving share pricing unchanged: the margins were never recognized and are now owed back as refunds.
- Each claim or refund consumes its exact amount from `pendingObligations` as it pays.

Share value therefore reflects a verified result the instant it lands rather than when winners claim, entry and expiry are pricing-neutral, and neither a redemption after finalization nor a deposit before loss settlement can trade against a publicly known outcome. Deferral also removes the one-sided option that entry-time recognition would create — with margins priced in at entry, redeeming mid-round and re-buying after finalization could never lose, because the price falls when players win and stays flat when they lose; with deferral, mid-round pricing carries no unearned margin and finalization moves it in either direction. `pendingObligations + unrecognizedMargin` never exceeds `reservedLiabilities`, so free-liquidity math is unchanged and remains the stricter constraint.

### Reveal-window freeze

Mark-to-market closes informed trading from finalization onward, but the outcome becomes publicly knowable earlier: Inco makes the plaintext obtainable offchain the moment `requestReveal` marks the handle, and the strict expiry boundary makes an unresolved exposed round past `expiresAt` a deterministic refund obligation before `expireRound` lands. Share-changing vault operations are frozen across both gaps:

> Share-changing vault operations revert while any round with nonzero player exposure is `RevealRequested`, and while any unresolved exposed round is expiry-eligible but not yet marked `Expired`. Finalization or expiry updates `pendingObligations` before atomically clearing the freeze. This prevents deposits, mints, withdrawals, or redemptions from trading against a publicly available result or deterministic refund obligation.

- Only rounds with live player exposure freeze. Revealing or expiring a ticketless pre-opened round changes round state but never touches the freeze, so nobody can lock the vault by revealing empty rounds.
- The `RevealRequested` leg is an O(1) counter: incremented once when an exposed round enters `RevealRequested`, decremented only in the transaction that marks that round's obligations into `pendingObligations` (finalization or expiry).
- The expiry-eligibility leg covers an exposed round still `Open` past `expiresAt`, which the counter alone cannot see. Because rounds sit on the fixed epoch grid, `expiresAt` is monotone in round id, so tracking the oldest unresolved exposed round gives an O(1) eligibility check; equivalently, a share operation may atomically expire eligible rounds before pricing.
- While frozen, `maxDeposit`, `maxMint`, `maxWithdraw`, and `maxRedeem` return zero, and `deposit`, `mint`, `withdraw`, and `redeem` revert with a clear custom error naming the freeze.

The freeze fails closed: share operations stay blocked until every blocking round resolves. The 15-minute expiry bounds each round's freeze contribution, not the vault's total frozen time — entries continue during a covalidator outage (handle creation does not depend on covalidators), so overlapping delayed rounds can keep LP share operations frozen indefinitely while the outage lasts, even though every individual round resolves to refunds within 15 minutes. The MVP deliberately ships no onchain new-exposure pause. The operational mitigations are prompt expiry of eligible rounds (a keeper duty, and permissionless for anyone including LPs) and interface visibility into the blocking rounds; if a hard global bound were ever required post-MVP, it would take the form of pausing new exposure, never unfreezing share pricing against a known result.

Views expose at least:

```text
grossAssets
totalAssets (net, ERC-4626)
totalSupply
assetsPerShare
reservedLiabilities
pendingObligations
unrecognizedMargin
safetyBuffer
freeLiquidity
roundExposure(roundId)
realizedGamePnl
maxWithdraw(owner)
maxRedeem(owner)
shareOperationsFrozen
frozenRoundCount
oldestBlockingRound
```

Free liquidity is never negative and is calculated from live assets less reservations and the required buffer. Client estimates are advisory; the transaction-time vault check is authoritative.

### Immediate withdrawal

`withdraw` and `redeem` follow ERC-4626 semantics but cap execution at the owner's proportional free liquidity. A request that cannot fully execute reverts and does not partially drain reserved capital. The share burn and tUSD transfer are atomic.

### Constrained withdrawals

A withdrawal exceeding the owner's proportional free liquidity reverts without moving funds. There is no MVP withdrawal queue; the deferred FIFO queue design is preserved in the [roadmap](./2026-08-08-margin-call-crash-roadmap.md). The UI shows the current free-liquidity limit so an LP can retry after reservations settle or deposits raise free liquidity.

## 9. External interface requirements

Exact Solidity signatures may vary, but equivalent behaviour and access boundaries are required.

### Game

- `openRound(roundId)` — payable; permissionlessly pre-open the explicitly named epoch, which must be the current or next epoch on the grid, creating its Inco handle with the caller supplying the fee.
- `enter` on an uninitialized epoch first creates the round identically to `openRound` — including supplying the Inco fee as `msg.value` — then proceeds with entry validation. Entering an existing round requires no ETH; a fee-bearing entry that lands after the round was concurrently created refunds the full `msg.value` and proceeds, never reverting for having lost the creation race.
- `enter(roundId, margin, leverageBps)` — validate entry and atomically coordinate direct-to-vault margin plus reservation.
- `requestReveal(roundId)` — permissionlessly begin reveal after lock and strictly before expiry.
- `finalizeRound(roundId, plaintext, signatures)` — verify the attestation and finalize the exact stored handle, strictly before expiry.
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

- Standard `deposit`, `mint`, `withdraw`, and `redeem` with free-liquidity restrictions and the reveal-window freeze.
- Reads for vault assets, shares, share price, reservations, buffer, free liquidity, exposure, and immediate withdrawal limits.

## 10. Required events

Events include indexed round, ticket, request, and wallet identifiers plus amounts needed to reconstruct state:

- `RoundOpened` includes the indexed round id, indexed opener, exact stored encrypted handle in an indexer-consumable representation, `openAt`, `lockAt`, and `expiresAt`
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
- `AuthorizedGameChanged`, if future-game replacement is supported

`RoundOpened` is sufficient to reconstruct the initialized round without transaction traces. Events may expose encrypted handles, which are public ciphertext, but no event exposes private plaintext before finalization or grants decryption access.

## 11. Keeper and automation

Contracts do not wake on timers, and no keeper is required for settlement: every transition is permissionless and any wallet can drive it. Entry availability is narrower under phone-only login (ADR 0008): embedded wallets cannot fund round creation (§12), so a playable entry window exists only while some ETH-holding wallet — in practice the keeper — pre-opens rounds. **The keeper is required for entry availability and optional for settlement.** The keeper — for example a Convex scheduled action holding a funded key — performs:

1. Pre-opens upcoming rounds during active sessions, funding each round's Inco fee from its own wallet as an operator cost.
2. Requests reveal after lock for rounds with tickets.
3. Fetches the covalidator's attested reveal.
4. Submits finalization.
5. Expires overdue rounds.

Expiring an eligible exposed round is the transition that clears that round's share-operation freeze, so any deployment that runs a keeper must treat eligible expiries as its highest-priority work and submit them promptly; without a keeper, the same call remains permissionless for anyone, including a frozen LP. Pre-opening is also UX-load-bearing: embedded wallets cannot supply the round-creation fee (§12), so the keeper keeps the current and next epochs initialized during active sessions — every transition remains permissionless, but phone-login players can only enter rounds some ETH-holding wallet has opened. The keeper skips epochs with no tickets and no-ops when there is no work, so an idle deployment emits no transactions. Every keeper transition is permissionless and idempotent or safely retryable. The keeper chooses no outcome, receives no early decryption access, and cannot replace a handle. It stores credentials server-side, waits for successful receipts, and resumes from onchain state after restart.

Keeper outage behaviour is explicit. If pre-opening stalls while players are active, the stale-pre-open alert fires and the interface replaces the entry form with an honest waiting state — no fake countdown, no unfulfillable entry offer. Everything already in flight is unaffected: locked rounds reveal, finalize, or expire permissionlessly, claims and refunds pull normally, and LP operations follow their usual rules. Failover is any ETH-holding wallet calling `openRound` — a second keeper instance, an operator's manual transaction, or a player with gas — and the runbook documents both the manual command and the redundant-keeper option. If the keeper fails, players or another caller can perform the same settlement transitions. Later epochs continue independently. Monitoring alerts on delayed reveal, failed attestation, expiry eligibility, a share-operation freeze outliving its blocking round's expiry, low free liquidity, vault assets approaching the `10,000 tUSD` entry floor (alert at `12,500`), and a low keeper-wallet ETH balance for gas and Inco fees; alerts do not become settlement authority.

## 12. Client, identity, indexing, and transaction state

### Identity, wallets, and sponsored gas

- Login is phone-number-only through Privy (SMS OTP); no other login method is enabled. A successful login provisions an embedded smart wallet on Base Sepolia. Players and LPs never install a wallet, hold a seed phrase, or acquire test ETH.
- Every app-driven transaction — faucet claim, entry, claim, refund, LP deposit and withdrawal, and permissionless recovery transitions offered by the UI — executes from the Privy embedded wallet with Privy-native sponsorship requested through `sponsor: true`. The Privy app-pays configuration enables Base Sepolia client transactions; no application-owned paymaster endpoint, proxy, or selector policy is required. Entry uses a one-time bounded `1,000 tUSD` approval when allowance is insufficient, then a separate sponsored `enter`; the interface never requests an unlimited allowance.
- Server-side identity is derived from the verified Privy access token's DID only, mapped to a Convex identity; no identity token or Privy user object is persisted or forwarded, and the app stores only the DID and wallet address. The previously scaffolded SIWA signature/nonce flow is retired and removed. Privy's client session object does expose the linked phone number in the browser, so the app-side guarantee is scoped precisely: phone numbers and auth headers are redacted from app-controlled logs, analytics, and error reporting — verified by telemetry-payload tests, not only source inspection — and never appear onchain, in app databases, or in the repository. The embedded wallet address is the only onchain identity.
- A paymaster sponsors gas but cannot supply `msg.value`, so an embedded wallet cannot be a round creator (ADR 0006). The interface offers entry only into rounds that already exist; keeper pre-opening (§11) keeps that gap to seconds, and any ETH-holding wallet can still create rounds permissionlessly.

### Transaction and indexing rules

- Contract reads and successful receipts are authoritative.
- Submitted hashes remain pending until a successful receipt.
- Failed or replaced transactions expose retry without optimistic ownership changes.
- Countdown and entry eligibility use contract timestamps corrected against chain time.
- The interface stops offering entry approximately five seconds before `lockAt`; a late transaction that reverts at lock is a normal, message-handled outcome.
- If a returning player's round is locked but not finalized, the interface offers a verify-and-settle path that drives reveal, finalization, and claim from the player's own wallet.
- While share operations are frozen, the LP interface states why, lists the blocking rounds with the earliest expiry at which the freeze can begin clearing (derived from `frozenRoundCount`, `oldestBlockingRound`, and the fixed epoch grid), and offers the permissionless finalize and expire transitions directly.
- The replay is a deterministic pure function of the finalized crash point and a fixed easing profile: a client arriving mid-replay seeks to the correct frame, and reduced-motion clients render the same data as a static result card.
- An indexer may serve history but must preserve delayed and expired states and link back to raw events and transactions. Event fan-out for the live ticket tape and replay trigger may push `TicketEntered` and `RoundFinalized` into Convex for reactive subscriptions; contract reads remain authoritative.
- The interface never silently changes the signed round ID after a missed lock.
- Entry shows spender, cap, and contract address before confirmation. When allowance is below the selected margin, the client submits a one-time bounded `1,000 tUSD` approval, waits for its receipt, then submits sponsored `enter`; later entries are enter-only. Unlimited allowance is never requested.
- The interface offers entry only into initialized rounds, so player entries never carry the Inco fee. The contract's round-creating entry path remains for ETH-holding callers, and a fee-bearing entry that loses the creation race is refunded automatically with the entry still succeeding — no user action needed.
- Reduced-motion, colour-independent status, and sound-independent text are required.

## 13. Security and test plan

### Security controls

- Pin matching Inco package and covalidator versions.
- Bind attestations to chain, contract, round, and exact encrypted handle.
- Use safe transfer helpers and handle non-successful ERC-20 operations.
- Apply checks-effects-interactions and reentrancy guards to entry, settlement, deposit, and withdrawal paths.
- Reject duplicate rounds, tickets, settlement, claims, and refunds.
- Keep owner controls unable to edit outcomes or consume reservations.
- Emit every administrative change.
- Keep keys, RPC credentials, keeper secrets, the Privy app secret, and paymaster credentials out of client code and source control.
- Use Privy's native app-pays sponsorship rather than an application-owned paymaster endpoint, proxy, or repository policy template. Enable Base Sepolia client transactions for the Crash deployment, keep sponsored call sites narrow, monitor sponsorship spend, and prove each deployed flow with a zero-ETH embedded-wallet smoke test. A drained, exhausted, or misconfigured sponsorship configuration must degrade to a clear user-facing error with retry, never to silent failure.

### Deterministic contract tests

- Round epoch, lazy first-entry creation, pre-open equivalence, duplicate-initialization rejection, rejection of `openRound` targeting an epoch that is neither current nor next, lock, reveal, finalization, delay, expiry from both `Open` and `RevealRequested`, and overlapping-round state machines
- Round-creation fee funding: `openRound` and round-creating `enter` revert when `msg.value` is below `inco.getFee()`, forward exactly the fee, and refund any excess atomically; a fee-bearing `enter` that loses the creation race refunds the full `msg.value` and completes the entry — tested with `openRound` landing before the entry in the same block, in the opposite order, and with two simultaneous round-creating entries where exactly one fee is consumed; and fee accounting draws only on the current call's `msg.value` — a forced ETH balance (e.g. via `SELFDESTRUCT`) neither funds a round nor changes any refund, and successful flows retain no caller-supplied ETH
- Inco handle binding and invalid/replayed attestation rejection
- Crash formula, cap, comparison equality, payout rounding, and sampled distribution
- Direct-to-vault player margin and full atomic rollback on failed admission
- Safety buffer, minimum assets, per-round, per-ticket, and total reservation limits
- Winning claim, loss release, expiry refund, failed-transfer retry, and replay rejection
- ERC-4626 semantics: `totalAssets()` returns net assets (`grossAssets − pendingObligations − unrecognizedMargin`), preview functions match executed conversions, and deposit/share conversion reflects share-value change after game results
- Mark-to-market: entry leaves share pricing exactly unchanged and `unrecognizedMargin` equals open rounds' total margin, finalization moves share value by exactly `totalMargin − winningLiability` — down the moment a net-winning round finalizes and up the moment a net-losing round finalizes, before any claim — expiry moves the round's margin to `pendingObligations` with no price change, share pricing from reveal request or expiry eligibility through claim admits no profitable sandwich, mid-round redemption followed by post-finalization re-deposit yields no riskless profit in either outcome, and `pendingObligations` and `unrecognizedMargin` return to zero after all claims, settlements, and refunds
- Strict expiry boundary: `requestReveal` and `finalizeRound` revert once `block.timestamp >= expiresAt`, `expireRound` reverts before it, and because every transaction in a block shares `block.timestamp`, exactly one terminal transition can succeed in any block regardless of transaction order — tested at `expiresAt − 1`, `expiresAt`, and with finalize/expire submitted in both orders in the same block
- Reveal-window freeze: revealing an exposed round zeroes `maxDeposit`/`maxMint`/`maxWithdraw`/`maxRedeem` and reverts share operations with the freeze error, revealing or expiring a ticketless round never freezes, an exposed round `Open` past `expiresAt` blocks share operations until expired, and finalization or expiry marks `pendingObligations` and clears the freeze in the same transaction
- Overlapping reveals: multiple exposed rounds in `RevealRequested` keep the vault frozen until the last blocking round resolves, and share operations unfreeze the moment it does
- Expiry cleanup: expiring a blocking round marks `totalMargin` into `pendingObligations`, decrements the freeze, and re-enables share operations in one transaction when it was the last blocker, including the `Open`-past-`expiresAt` case where no reveal was requested
- Freeze-counter recovery: every interleaving of reveals, finalizations, and expiries across overlapping rounds returns `frozenRoundCount` exactly to zero, `oldestBlockingRound` advances past resolved and unexposed rounds, and no sequence leaves a nonzero counter with no blocking round or a zero counter while one remains
- Immediate withdrawal limits and inability to consume reserved or buffered assets
- Rejection of withdrawals exceeding free liquidity, with no partial execution
- Faucet claim amount, per-wallet cooldown, and absence of other unrestricted mint paths
- Authorization boundaries and reentrancy

### Base Sepolia smoke test

Starting from a fresh phone number that logs in through SMS, receives an embedded smart wallet, and claims from the in-app faucet — with every transaction gas-sponsored from a zero-ETH wallet — record a complete 60-second round with player approval, direct vault receipt, reservation, Inco handle, lock, attestation, finalization, and claim or loss settlement. Record a second live round deliberately left unfinalized past `expiresAt`: the expiry transition followed by the ticket owner's refund, so the smoke test exercises the expiry-refund path the PRD's acceptance criterion 22 requires. Separately record an LP deposit, a free-liquidity withdrawal, and a rejected withdrawal that exceeds free liquidity. Preserve contract addresses and transaction hashes in the deployment record.
