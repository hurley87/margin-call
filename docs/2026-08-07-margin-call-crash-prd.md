# Product Requirements Document: Margin Call — Crash

**Created:** August 7, 2026 · **Updated:** August 9, 2026 · **Status:** Game Jam MVP specification

**Network:** Base Sepolia (`84532`) · **Settlement asset:** Desk Dollars (`tUSD`), a project-deployed testnet token · **Privacy:** Inco Lightning

**Audience:** Summer Game Jam judges and public testnet players

Terminology follows the canonical glossary in [CONTEXT.md](../CONTEXT.md).

Implementation details are defined in the [technical design](./2026-08-08-margin-call-crash-technical-design.md). Deferred product and token decisions are tracked in the [roadmap](./2026-08-08-margin-call-crash-roadmap.md).

## 1. Product summary

**Margin Call — Crash** is a 1980s Wall Street-themed crash game. A new shared round is available every minute on a fixed epoch grid; round state is created on demand by the first entry, so the game is always playable without requiring an operator heartbeat. Players post Desk Dollars (`tUSD`) as margin and choose an **Arcade Leverage** tier before the round locks. The market multiplier rises from `1.00x` to a confidential crash point. If it reaches the selected multiple first, the ticket closes automatically and pays margin multiplied by that value. If the market crashes first, the player's posted margin is liquidated.

The crash point is generated onchain as encrypted state with Inco Lightning before entry closes. Players, the operator, and chain observers cannot inspect it while entries are open. After lock, an Inco covalidator attestation reveals the result for public verification and permissionless settlement.

The game is shared but asynchronous. A player can enter, leave, and return later to claim. A delayed round never prevents later rounds from opening.

All game liquidity is held in a community-funded tUSD vault. Player margin enters that vault directly. A separate game contract coordinates rounds and may only ask the vault to reserve, release, refund, or pay the bounded liability for a specific ticket; it never takes custody of a general bankroll. Liquidity providers receive vault shares and participate in realized game gains and losses.

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
- Demonstrate the full settlement lifecycle: faucet, approve, enter, resolve, and claim or refund.
- Make Inco's role visible and understandable in the interface and demo.
- Support delayed settlement without blocking later rounds.
- Give players trustworthy global and wallet-specific history.
- Let community LPs fund capacity while clearly seeing utilization, risk, realized performance, and withdrawable liquidity.

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
- A constrained LP withdrawal queue; MVP withdrawals are limited to free liquidity
- LP reward emissions, including the deferred Margin Call (`$CALL`) token
- Laddered tickets, persistent desk runs, market regimes, analyst reports, or AI phone appeals
- A mainnet token or externally funded multi-token rewards program

Those deferred ideas are recorded without becoming MVP commitments in the [roadmap](./2026-08-08-margin-call-crash-roadmap.md).

## 5. Target users

The primary user is a crypto-aware casual player who wants a short game, may arrive mid-round, is comfortable with a testnet wallet, and wants proof that the operator could not inspect or change the result after seeing entries. No knowledge of Inco or crash-game mathematics is required.

The secondary user is a testnet liquidity provider who wants to fund game capacity, observe vault performance, and withdraw when capital is not reserved for player liabilities.

## 6. Player experience

### Core loop

1. Connect a wallet on Base Sepolia.
2. Obtain test ETH if needed and claim `tUSD` from the in-app faucet.
3. Approve the configured vault spender — by default a bounded `1,000 tUSD` allowance that covers many entries, or an exact per-entry amount for the cautious. The spender, cap, and contract address are always displayed, and an unlimited allowance is never requested.
4. Choose `1`, `5`, or `10` tUSD of margin.
5. Choose one of the six Arcade Leverage tiers.
6. Confirm entry before lock. The margin is transferred directly into the vault and the ticket's maximum payout is reserved atomically.
7. Leave the page or watch the trading-floor animation.
8. After finalization, view the verified crash point and outcome.
9. Claim a winning payout or, if finalization irreversibly fails, reclaim the original margin after expiry.
10. Enter later rounds without waiting for an earlier claim.

One wallet may hold at most one ticket per round. Watching the animation never changes the result or claim.

### Round cadence

The Game Jam deployment uses a deterministic 60-second epoch with a 45-second entry window. Rounds are created lazily: the first entry of an epoch creates the round and its encrypted crash point in the same transaction, before the ticket is accepted, and a keeper may pre-open rounds ahead of demand during active sessions. An epoch nobody enters creates no onchain state.

| Phase      | Nominal timing     | Behaviour                                                                          |
| ---------- | ------------------ | ---------------------------------------------------------------------------------- |
| Open       | `:00–:45`          | Players may enter; the encrypted crash point exists before any ticket is accepted. |
| Locked     | `:45`              | Entry closes onchain.                                                              |
| Reveal     | `:45+`             | The stored encrypted handle becomes eligible for attested reveal.                  |
| Finalized  | Target `:50–:55`   | The verified plaintext crash point is stored.                                      |
| Claimable  | After finalization | Winning tickets can be claimed permissionlessly.                                   |
| Next round | `:60`              | The next epoch becomes available even if an earlier round is delayed.              |

The interface derives timing from contract timestamps, not only the browser clock. The deployed duration and entry window are immutable and publicly shown.

### Round theater

The main screen renders the round as a climbing multiplier curve in the style of established crash games, with one honest difference: the climb is a **replay**. The crash point is committed before entry and revealed only after lock, so nothing can climb live while entries are open.

- During Open, the curve area shows the contract-derived countdown, a live ticket tape of public entries, and the previous round's replay as ambiance. The interface stops offering new entries roughly five seconds before lock so a submitted transaction cannot straddle the lock; a late entry that reverts is a normal, clearly messaged outcome.
- All player transactions happen in the Open phase. Posting margin is the anticipation phase, exactly like placing a bet between rounds in a live crash game. There is no mid-climb action.
- After finalization, the round plays a short dramatized climb — roughly four to twelve seconds, scaling with the crash point — from `1.00x` to the verified result. As the curve passes each Arcade Leverage tier, tickets at that tier visibly close with their payouts; when the curve dies at the crash point, every ticket still open takes the margin call.
- The replay is explicitly labelled as a rendering of an attested onchain result and links to the verification record. A delayed round shows an honest awaiting-attestation state, never a stalled climb.
- Reduced-motion clients receive the identical information as a static result card, and watching, skipping, or replaying the theater never changes settlement.

### Game rules

- Margin options are exactly `1`, `5`, or `10` tUSD.
- Arcade Leverage is exactly one of six tiers: `1.25x`, `1.50x`, `2.00x`, `3.00x`, `5.00x`, or `10.00x`. No other value is accepted.
- Tier reach probabilities are approximately `79.2%`, `66.0%`, `49.5%`, `33.0%`, `19.8%`, and `9.9%` respectively.
- The selected multiple is both the automatic close threshold and the gross payout multiple.
- This is an arcade abstraction, not a simulation of real leveraged trading or trading education.
- One encrypted crash point applies to every ticket in a round and is generated before entry.
- A ticket wins when the crash point reaches or exceeds its selected multiple. Equality wins.
- A winner receives `floor(margin × selected multiple)`, including returned margin. A losing ticket receives zero.
- The transparent distribution has an approximately 1% house edge, caps the displayed and payable result at `10.00x`, and does not make previous rounds predictive.
- Roughly 1% of rounds crash below `1.00x` and display as an instant `1.00x` crash, and roughly one round in five crashes below the lowest tier, so every ticket in that round loses. This is part of the disclosed distribution, not an error.

Exact integer math and boundary rules are specified in the [technical design](./2026-08-08-margin-call-crash-technical-design.md#5-crash-and-payout-math).

### Main screen and history

The main screen shows the current and next available round, contract-derived countdown, margin and leverage selectors, expected payout, entry status, the replayed multiplier curve, recent crash points, latest tickets, and claim or refund actions. It always labels Base Sepolia, tUSD, and the assets' lack of real value.

Global history shows at least 20 recent finalized rounds and distinguishes delayed or expired rounds without inventing a multiplier. Round detail includes timestamps, aggregate margin and payouts, the encrypted handle, attested reveal, lifecycle transactions, and BaseScan links.

Personal history shows each ticket's margin, leverage, crash point when known, payout, transaction state, and any claim or refund action. Contract reads and events are the settlement source of truth; an indexer may only improve retrieval speed.

Every wallet action moves through awaiting confirmation, submitted, waiting for receipt, confirmed, or failed with retry. A transaction hash alone never changes displayed ownership or settlement state.

## 7. Trust and confidentiality

Only the random value and resulting crash point are confidential while entry is open. Round identifiers, timestamps, wallets, margin, leverage, ticket ownership, the final result, payouts, and claims are public.

For every round:

1. The game creates one Inco confidential-randomness handle for a round before accepting any of its tickets, never afterwards.
2. Neither players nor administrators receive early decryption access.
3. Reveal is allowed only after the round locks.
4. Finalization verifies an Inco covalidator attestation against that round's exact stored handle.
5. Claims use only the verified plaintext result and public ticket data.

The result cannot be regenerated, substituted, or administratively edited. If a valid reveal never arrives before expiry, the game does not invent an outcome; each player can pull back exactly their original margin.

## 8. Money, custody, and LP experience

### Desk Dollars (tUSD)

- Network: Base Sepolia (`84532`)
- Token: **Desk Dollars**, a project-deployed ERC-20, symbol `tUSD`
- Decimals: `6`
- Supply: an owner-minted `25,000 tUSD` bankroll seed plus a rate-limited public faucet
- Faucet: any wallet can claim `100 tUSD` per hour directly from the interface
- Value: no real financial value or claim on real US dollars

The application uses **Desk Dollars** or **tUSD** everywhere, never presents balances as real USD winnings, and never presents the token as Circle USDC or any real-dollar claim. The intended mainnet settlement asset remains real Circle USDC; that swap is recorded in the [roadmap](./2026-08-08-margin-call-crash-roadmap.md).

### Shared bankroll vault

An ERC-4626-compatible `BankrollVault` is the single custody layer for LP deposits and player margin. Losing margin remains in the vault; winning payouts leave it. LP share value can therefore rise or fall with realized game results. Share value marks to market the moment a round finalizes or expires — not when winners later claim — so nobody can trade vault shares against a publicly known but unclaimed result.

The separate `MarginCallCrash` contract owns round and ticket state. It can invoke only ticket-scoped vault operations bounded by an accepted reservation. It cannot pull a general pot of tUSD or use vault assets for another purpose.

An entry succeeds only if the vault can atomically receive the player's margin, preserve the safety buffer and exposure limits, and reserve the ticket's maximum payout. Otherwise the transaction reverts without retaining player funds.

The LP Desk shows:

- Wallet tUSD and vault-share balances
- Share price and realized vault gain or loss
- Reserved liabilities, pending obligations from verified rounds awaiting claims, safety buffer, free liquidity, and utilization
- Player capacity by Arcade Leverage tier
- Immediately withdrawable assets
- An explicit warning that vault-share value can decline

### LP withdrawals

LPs may withdraw only from free liquidity. A withdrawal that would consume reserved liabilities or the safety buffer reverts without moving funds, and the LP can retry after player liabilities settle or new liquidity arrives. The LP Desk always shows the currently withdrawable amount.

A constrained-withdrawal queue and an LP reward token are deferred to the [roadmap](./2026-08-08-margin-call-crash-roadmap.md); the MVP has no LP reward emissions.

The exact reservation and settlement mechanics are defined in the [technical design](./2026-08-08-margin-call-crash-technical-design.md).

## 9. Safety and recovery promises

- Accepted player liabilities are fully collateralized and reserved until ticket settlement or expiry refund.
- A safety buffer of at least 20% of vault assets remains after every accepted entry.
- One round may reserve at most 25% of vault assets.
- One ticket may reserve at most the lower of `100 tUSD` or 1% of vault assets.
- No entries are accepted while vault assets are below `10,000 tUSD`, the level at which the per-ticket cap admits the full `10 tUSD × 10.00x` matrix.
- Owner and LP withdrawals cannot consume reservations or the safety buffer.
- Vault share pricing reflects a verified result immediately at finalization or expiry, and LP deposits and withdrawals freeze from the moment a result becomes publicly decryptable (or a refund becomes deterministic) until it is priced in, so a publicly knowable outcome cannot be traded against remaining LPs. A sustained reveal outage can extend this freeze across overlapping rounds. Entry never moves share pricing; margin is recognized as a game result only at finalization.
- Later rounds continue while an earlier round is revealing, delayed, claimable, or refundable.
- An epoch with no entries creates no round state and requires no operator transactions.
- Any wallet can advance permissionless round transitions if the optional keeper stops; no transition depends on the keeper.
- A round that cannot finalize by 15 minutes after lock expires irreversibly and becomes refundable.
- Claims and refunds are pull-based, retryable, non-replayable, and marked complete only with a successful atomic token transfer.
- Administrative actions are public and cannot change a round's encrypted or finalized result.
- Token movement uses safe transfers, checks-effects-interactions, and reentrancy protection.
- Secrets and administrative credentials never enter the browser bundle or repository.

## 10. Creative brief

Present a heightened 1980s Wall Street trading floor: green CRT numerals, amber terminal accents, paper-ticket textures, ticker tape, a closing bell, and a red desk phone for the margin call. The visual centerpiece is the replayed multiplier curve — a climbing line with smoothly rescaling axes, tier-close payout pops, and a hard stop at the margin call. Keep the primary action legible on mobile. Audio is optional and muted by default; reduced-motion and text equivalents must preserve the full experience without animation, colour, or sound.

## 11. Acceptance criteria

The Game Jam MVP is complete when:

1. The contracts, the `tUSD` token and faucet, and the public frontend are deployed on Base Sepolia at published addresses.
2. The bankroll is funded with at least `25,000 tUSD` — 2.5× the `10,000 tUSD` entry floor, so demo variance cannot freeze entries — and the interface clearly says all tokens have no real value.
3. A cold wallet can claim `tUSD` from the rate-limited in-app faucet, approve, post `1`, `5`, or `10` tUSD, select an Arcade Leverage tier, and receive one ticket in an open round.
4. Player margin is received directly by `BankrollVault`; `MarginCallCrash` never holds general bankroll custody.
5. An accepted entry atomically reserves its maximum payout, and an undercollateralized or exposure-breaking entry reverts without retaining funds.
6. The encrypted crash handle is created before any ticket is accepted and cannot be publicly read while entry is open.
7. Entry closes onchain after 45 seconds of the 60-second round.
8. Finalization verifies an Inco attestation bound to the exact stored handle.
9. Crash and payout boundary and distribution tests pass, including equality and the `10.00x` cap.
10. A winner can claim the exact payout once; a loser receives zero and cannot replay settlement.
11. An irreversibly expired round lets every player pull back exactly the original margin.
12. At least three consecutive one-minute rounds can overlap in open, revealing, delayed, claimable, or refundable states without blocking one another, and an epoch with no entries creates no round state and requires no maintenance transactions.
13. A judge can enter, leave, return, verify the round, and claim without watching the animation.
14. Global history shows at least 20 rounds; personal history makes every claim or refund visible.
15. Contract addresses, transaction hashes, encrypted handles, attestations, and finalized results are visible from the demo.
16. A second wallet can deposit tUSD and receive the correct proportional vault shares.
17. Deterministic tests prove that share value falls at the moment a winning round finalizes and rises at the moment a losing round finalizes, before any claim is pulled.
18. Reserved liabilities and the safety buffer prevent conflicting owner or LP withdrawals.
19. An LP can immediately withdraw free liquidity, and a withdrawal exceeding free liquidity reverts without moving funds.
20. The LP Desk clearly separates tUSD performance, reservations, liquidity, and possible LP loss.
21. All wallet actions remain pending until a successful receipt and expose a recovery path after failure.
22. Contract unit tests and a Base Sepolia end-to-end smoke test cover entry, reveal, finalization, claim, expiry refund, LP deposit, reservation, and withdrawal.

## 12. Deployment summary

The release record includes:

- Git commit SHA and frontend URL
- Base Sepolia chain ID, `tUSD` token address, and faucet address
- `MarginCallCrash`, `BankrollVault`, and vault-share token addresses
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
- [Base faucets](https://docs.base.org/base-chain/network-information/network-faucets) — test ETH
