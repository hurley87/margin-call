# Product Requirements Document: Margin Call — Crash

**Created:** August 7, 2026 · **Updated:** August 8, 2026 · **Status:** Game Jam MVP specification

**Network:** Base Sepolia (`84532`) · **Settlement asset:** Circle testnet USDC (`tUSDC`) · **Privacy:** Inco Lightning

**Audience:** Summer Game Jam judges and public testnet players

Implementation details are defined in the [technical design](./2026-08-08-margin-call-crash-technical-design.md). Deferred product and token decisions are tracked in the [roadmap](./2026-08-08-margin-call-crash-roadmap.md).

## 1. Product summary

**Margin Call — Crash** is a continuously available, 1980s Wall Street-themed crash game. Every minute, a new shared round opens. Players post Circle testnet USDC as margin and choose an **Arcade Leverage** multiple before the round locks. The market multiplier rises from `1.00x` to a confidential crash point. If it reaches the selected multiple first, the position closes automatically and pays margin multiplied by that value. If the market crashes first, the player's posted margin is liquidated.

The crash point is generated onchain as encrypted state with Inco Lightning before entry closes. Players, the operator, and chain observers cannot inspect it while entries are open. After lock, an Inco covalidator attestation reveals the result for public verification and permissionless settlement.

The game is shared but asynchronous. A player can enter, leave, and return later to claim. A delayed round never prevents later rounds from opening.

All game liquidity is held in a community-funded tUSDC vault. Player margin enters that vault directly. A separate game contract coordinates rounds and may only ask the vault to reserve, release, refund, or pay the bounded liability for a specific ticket; it never takes custody of a general bankroll. Liquidity providers receive vault shares, participate in realized game gains and losses, and accrue a separate testnet `$MARGIN` reward while their shares remain eligible.

All assets are testnet-only and have no financial value.

## 2. Product proposition

> Post margin. Choose your leverage. Walk away. If the market reaches your number before the red phone rings, you clear the trade. If it crashes first, you get the margin call.

The MVP promises:

- One understandable decision: margin and Arcade Leverage
- A new shared entry opportunity every 60 seconds
- No opponent, lobby, or synchronous attendance requirement
- Automatic, publicly verifiable settlement
- A crash point that is committed before entries and confidential until lock
- Vault custody and full reservation of accepted player liabilities
- An immediately recognizable trading-floor presentation

## 3. Goals

### Product goals

- Let a first-time player understand and enter a round in under 30 seconds.
- Demonstrate the full tUSDC lifecycle: approve, enter, resolve, and claim or refund.
- Make Inco's role visible and understandable in the interface and demo.
- Support delayed settlement without blocking later rounds.
- Give players trustworthy global and wallet-specific history.
- Let community LPs fund capacity while clearly seeing utilization, risk, realized performance, rewards, and withdrawable liquidity.
- Keep tUSDC vault performance separate from testnet `$MARGIN` emissions.

### Game Jam goals

- Provide a public Base Sepolia prototype with a reliable one-minute demo loop.
- Make confidential state essential to the shared round.
- Show the encrypted handle and subsequent attested reveal in the round record.
- Let a judge enter, leave the page, return, verify the result, and claim.

## 4. Non-goals

The MVP does not include:

- Real-money or mainnet wagering
- Limitless Exchange integration
- Player-versus-player pools, matchmaking, private rooms, teams, or chat
- Manual reflex-based cashout
- Encrypted player margin or leverage selections
- Real borrowing, debt, negative balances, or liquidation cascades
- Multiple game assets, user-created rounds, or independent crash markets
- NFTs, collectibles, referrals, rakeback, or jackpots
- Administrative control over an individual round outcome
- Laddered positions, persistent desk runs, market regimes, analyst reports, or AI phone appeals
- A mainnet token or externally funded multi-token rewards program

Those deferred ideas are recorded without becoming MVP commitments in the [roadmap](./2026-08-08-margin-call-crash-roadmap.md).

## 5. Target users

The primary user is a crypto-aware casual player who wants a short game, may arrive mid-round, is comfortable with a testnet wallet, and wants proof that the operator could not inspect or change the result after seeing entries. No knowledge of Inco or crash-game mathematics is required.

The secondary user is a testnet liquidity provider who wants to fund game capacity, observe vault performance, accrue `$MARGIN`, and withdraw only when capital is not reserved for player liabilities.

## 6. Player experience

### Core loop

1. Connect a wallet on Base Sepolia.
2. Obtain test ETH and Circle tUSDC if needed.
3. Approve the configured vault spender for an exact tUSDC amount.
4. Choose `1`, `5`, or `10` tUSDC of margin.
5. Choose an Arcade Leverage multiple from `1.10x` through `10.00x`.
6. Confirm entry before lock. The margin is transferred directly into the vault and the ticket's maximum payout is reserved atomically.
7. Leave the page or watch the trading-floor animation.
8. After finalization, view the verified crash point and outcome.
9. Claim a winning payout or, if finalization irreversibly fails, reclaim the original margin after expiry.
10. Enter later rounds without waiting for an earlier claim.

One wallet may hold at most one ticket per round. Watching the animation never changes the result or claim.

### Round cadence

The Game Jam deployment uses a deterministic 60-second epoch with a 45-second entry window.

| Phase      | Nominal timing     | Behaviour                                                         |
| ---------- | ------------------ | ----------------------------------------------------------------- |
| Open       | `:00–:45`          | Players may enter; the encrypted crash point already exists.      |
| Locked     | `:45`              | Entry closes onchain.                                             |
| Reveal     | `:45+`             | The stored encrypted handle becomes eligible for attested reveal. |
| Finalized  | Target `:50–:55`   | The verified plaintext crash point is stored.                     |
| Claimable  | After finalization | Winning tickets can be claimed permissionlessly.                  |
| Next round | `:60`              | A new round opens even if an earlier round is delayed.            |

The interface derives timing from contract timestamps, not only the browser clock. The deployed duration and entry window are immutable and publicly shown.

### Game rules

- Margin options are exactly `1`, `5`, or `10` tUSDC.
- Arcade Leverage ranges from `1.10x` to `10.00x`; presets are `1.25x`, `1.50x`, `2.00x`, `3.00x`, `5.00x`, and `10.00x`.
- The selected multiple is both the automatic close threshold and the gross payout multiple.
- This is an arcade abstraction, not a simulation of real leveraged trading or trading education.
- One encrypted crash point applies to every ticket in a round and is generated before entry.
- A ticket wins when the crash point reaches or exceeds its selected multiple. Equality wins.
- A winner receives `floor(margin × selected multiple)`, including returned margin. A losing ticket receives zero.
- The transparent distribution has an approximately 1% house edge, caps the displayed and payable result at `10.00x`, and does not make previous rounds predictive.

Exact integer math and boundary rules are specified in the [technical design](./2026-08-08-margin-call-crash-technical-design.md#5-crash-and-payout-math).

### Main screen and history

The main screen shows the current and next available round, contract-derived countdown, margin and leverage selectors, expected payout, entry status, verified ticker animation, recent crash points, latest tickets, and claim or refund actions. It always labels Base Sepolia, tUSDC, and the assets' lack of real value.

Global history shows at least 20 recent finalized rounds and distinguishes delayed or expired rounds without inventing a multiplier. Round detail includes timestamps, aggregate margin and payouts, the encrypted handle, attested reveal, lifecycle transactions, and BaseScan links.

Personal history shows each ticket's margin, leverage, crash point when known, payout, transaction state, and any claim or refund action. Contract reads and events are the settlement source of truth; an indexer may only improve retrieval speed.

Every wallet action moves through awaiting confirmation, submitted, waiting for receipt, confirmed, or failed with retry. A transaction hash alone never changes displayed ownership or settlement state.

## 7. Trust and confidentiality

Only the random value and resulting crash point are confidential while entry is open. Round identifiers, timestamps, wallets, margin, leverage, ticket ownership, the final result, payouts, and claims are public.

For every round:

1. The game creates one Inco confidential-randomness handle before accepting entry.
2. Neither players nor administrators receive early decryption access.
3. Reveal is allowed only after the round locks.
4. Finalization verifies an Inco covalidator attestation against that round's exact stored handle.
5. Claims use only the verified plaintext result and public ticket data.

The result cannot be regenerated, substituted, or administratively edited. If a valid reveal never arrives before expiry, the game does not invent an outcome; each player can pull back exactly their original margin.

## 8. Money, custody, and LP experience

### Circle tUSDC

- Network: Base Sepolia (`84532`)
- Token: Circle testnet USDC
- Address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Decimals: `6`
- Value: no real financial value or claim on real US dollars

The application uses **Test USDC** or **tUSDC** everywhere and never presents balances as real USD winnings. The MVP does not replace Circle tUSDC with a mock settlement asset.

### Shared bankroll vault

An ERC-4626-compatible `BankrollVault` is the single custody layer for LP deposits and player margin. Losing margin remains in the vault; winning payouts leave it. LP share value can therefore rise or fall with realized game results.

The separate `MarginCallCrash` contract owns round and ticket state. It can invoke only ticket-scoped vault operations bounded by an accepted reservation. It cannot pull a general pot of tUSDC or use vault assets for another purpose.

An entry succeeds only if the vault can atomically receive the player's margin, preserve the safety buffer and exposure limits, and reserve the ticket's maximum payout. Otherwise the transaction reverts without retaining player funds.

The LP Desk shows:

- Wallet tUSDC and vault-share balances
- Share price and realized vault gain or loss
- Reserved liabilities, safety buffer, free liquidity, and utilization
- Estimated player capacity by leverage tier
- Immediately withdrawable assets and queued withdrawal status
- Accrued and claimed `$MARGIN` rewards
- An explicit warning that vault-share value can decline

### LP withdrawals and rewards

LPs may withdraw immediately only from free liquidity. Shares that would consume reserved liabilities or the safety buffer enter a deterministic queue. Queued shares stop earning `$MARGIN`; an unprocessed request can be cancelled, restoring future eligibility without retroactive rewards.

`$MARGIN` is a separately funded, capped Base Sepolia reward token for active LP shares. It is not a player asset, cannot be wagered or used as collateral, and carries no right to tUSDC, vault assets, revenue, or ownership. The UI never presents it as APR or guaranteed yield and keeps it visually separate from tUSDC vault performance.

The exact reservation, queue, settlement, and reward-accounting mechanics are defined in the [technical design](./2026-08-08-margin-call-crash-technical-design.md).

## 9. Safety and recovery promises

- Accepted player liabilities are fully collateralized and reserved until ticket settlement or expiry refund.
- A safety buffer of at least 20% of vault assets remains after every accepted entry.
- One round may reserve at most 25% of vault assets.
- One ticket may reserve at most the lower of `100 tUSDC` or 1% of vault assets.
- No entries are accepted while vault assets are below `1,000 tUSDC`.
- Owner and LP withdrawals cannot consume reservations or the safety buffer.
- Later rounds continue while an earlier round is revealing, delayed, claimable, or refundable.
- Any wallet can advance permissionless round transitions if the primary automation stops.
- A round that cannot finalize by 15 minutes after lock expires irreversibly and becomes refundable.
- Claims and refunds are pull-based, retryable, non-replayable, and marked complete only with a successful atomic token transfer.
- Queue processing is deterministic and cannot grant first-withdrawer preference during constrained liquidity.
- Administrative actions are public and cannot change a round's encrypted or finalized result.
- Token movement uses safe transfers, checks-effects-interactions, and reentrancy protection.
- Secrets and administrative credentials never enter the browser bundle or repository.

## 10. Creative brief

Present a heightened 1980s Wall Street trading floor: green CRT numerals, amber terminal accents, paper-ticket textures, ticker tape, a closing bell, and a red desk phone for the margin call. Keep the primary action legible on mobile. Audio is optional and muted by default; reduced-motion and text equivalents must preserve the full experience without animation, colour, or sound.

## 11. Acceptance criteria

The Game Jam MVP is complete when:

1. The contracts and public frontend are deployed on Base Sepolia with Circle's documented tUSDC address.
2. The bankroll is funded for the demo and the interface clearly says all tokens have no real value.
3. A player can approve and post `1`, `5`, or `10` tUSDC, select supported Arcade Leverage, and receive one ticket in an open round.
4. Player margin is received directly by `BankrollVault`; `MarginCallCrash` never holds general bankroll custody.
5. An accepted entry atomically reserves its maximum payout, and an undercollateralized or exposure-breaking entry reverts without retaining funds.
6. The encrypted crash handle exists before the first entry and cannot be publicly read while entry is open.
7. Entry closes onchain after 45 seconds of the 60-second round.
8. Finalization verifies an Inco attestation bound to the exact stored handle.
9. Crash and payout boundary and distribution tests pass, including equality and the `10.00x` cap.
10. A winner can claim the exact payout once; a loser receives zero and cannot replay settlement.
11. An irreversibly expired round lets every player pull back exactly the original margin.
12. At least three consecutive one-minute rounds can overlap in open, revealing, delayed, claimable, or refundable states without blocking one another.
13. A judge can enter, leave, return, verify the round, and claim without watching the animation.
14. Global history shows at least 20 rounds; personal history makes every claim or refund visible.
15. Contract addresses, transaction hashes, encrypted handles, attestations, and finalized results are visible from the demo.
16. A second wallet can deposit tUSDC and receive the correct proportional vault shares.
17. Deterministic tests prove that losing player margin raises vault value and a winning payout lowers it.
18. Reserved liabilities and the safety buffer prevent conflicting owner or LP withdrawals.
19. An LP can immediately withdraw free liquidity or create, cancel, and permissionlessly process a constrained FIFO withdrawal request.
20. `$MARGIN` accrues only to eligible time-weighted shares, pauses with zero eligible supply, survives share transfers correctly, excludes queued shares, and cannot exceed its funded allocation.
21. The LP Desk clearly separates tUSDC performance, `$MARGIN` rewards, reservations, liquidity, and possible LP loss.
22. All wallet actions remain pending until a successful receipt and expose a recovery path after failure.
23. Contract unit tests and a Base Sepolia end-to-end smoke test cover entry, reveal, finalization, claim, expiry refund, LP deposit, reservation, withdrawal, queue, and reward claim.

## 12. Deployment summary

The release record includes:

- Git commit SHA and frontend URL
- Base Sepolia chain ID and Circle tUSDC address
- `MarginCallCrash`, `BankrollVault`, vault-share token, `MarginToken`, and `MarginRewards` addresses
- `$MARGIN` cap, funded allocation, emission rate, start time, and any reduction-only safety authority
- Inco package and covalidator versions
- Keeper and contract-owner addresses
- Initial bankroll and LP-share mint transaction hashes
- One verified complete-round transaction set
- Immutable 60-second round and 45-second entry-window values

Environment-specific values are explicit. No production or mainnet address is used as a silent fallback.

## 13. Source references

- [Inco Incasino](https://docs.inco.org/games/incasino) — confidential randomness and play-then-settle reference
- [Inco operations](https://docs.inco.org/guide/operations) — encrypted arithmetic, comparison, and randomness
- [Inco attestation verification](https://docs.inco.org/guide/verifying-attestations) — binding settlement to an expected handle
- [Base network configuration](https://docs.base.org/base-chain/quickstart/connecting-to-base) — Base Sepolia information
- [Base faucets](https://docs.base.org/base-chain/network-information/network-faucets) — test ETH and assets
- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) — canonical Base Sepolia tUSDC address
