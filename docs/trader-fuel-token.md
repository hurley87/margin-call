# BLOW Capacity Token

> **Status: shipped on Base Sepolia.** The original fuel-token proposal in this file has been superseded. `$BLOW` now has one narrow role: desk managers post it against individual traders to increase agent operating capacity. It does not replace USDC or influence outcomes.

## Core Invariant

> **Stake affects capacity, never outcome probability.**

No staking state may be imported, queried, or passed into deal selection, resolution prompts, probability calculations, payouts, rake calculations, or deal creation.

## Current Policy

| Tier              | Active `$BLOW` | Cycle interval | Maximum unresolved entries |
| ----------------- | -------------: | -------------: | -------------------------: |
| **Gallery**       |              0 |     10 minutes |                          1 |
| **Seat**          |         10,000 |      5 minutes |                          1 |
| **Corner Office** |         50,000 |      5 minutes |                          2 |

- Deal creation remains unlimited for every tier.
- The cycle interval controls eligibility, not guaranteed trade frequency.
- Market hours, mandate filters, approvals, leases, available deals, and settlement recovery still apply.
- RPC, configuration, malformed-tier, or depositor failures fail closed to Gallery.

## Asset Separation

The game now has three distinct asset roles:

- **USDC** — trader bankroll, deal pots, wins, losses, and platform fees.
- **Trader NFTs** — persistent identity, ownership, portraits, and reputation history.
- **`$BLOW`** — refundable principal posted for per-trader operating capacity.

The active SeatVault never holds USDC. The USDC escrow never treats `$BLOW` as bankroll.

The vault exposes no reward, yield, dividend, slashing, claim, fee-discount, or bonus-payout path. `$BLOW` is not earned from wins, and wiped-out traders cannot be revived by burning it.

## Staking Authority

Staking authority comes from `MarginCallEscrow.depositors(traderId)`.

- Only the current nonzero escrow depositor can add principal for a trader.
- Repeated stakes from the same depositor increase active principal.
- A depositor change makes the effective tier Gallery.
- The original staker retains withdrawal rights even after a depositor change.
- Principal is never redirected to a replacement depositor or administrator.

This authority model exists because trader identity NFTs are held by trader CDP accounts while the desk treasury is the party funding escrow and posting capacity principal.

## Unstaking

Unstaking is intentionally two-phase:

1. `initiateUnstake(traderId, amount)` moves principal from active to pending immediately. Tier calculations use only active principal, so capacity drops as soon as a threshold is crossed.
2. `completeUnstake(traderId)` returns the pending batch to the original staker after the 24-hour cooldown.

A pending batch keeps its recorded unlock time if policy changes later. Previous vault versions remain discoverable so former stakers can recover pending or active principal after a replacement vault is activated.

## Source Of Truth And Read Model

The active SeatVault's on-chain `tierOf(traderId)` is authoritative for scheduling capacity.

Convex indexes confirmed `Staked`, `UnstakeInitiated`, and `Unstaked` events and reconciles them against `stakeOf` and `tierOf`. That read model powers reactive credentials and owner controls; it cannot independently grant accelerated capacity.

The scheduler and cycle action read the active vault at capacity boundaries. Missing configuration, invalid values, ownership mismatch, or RPC failure returns Gallery capacity with an observable diagnostic.

## Current Base Sepolia Deployment

| Component          | Address                                      |
| ------------------ | -------------------------------------------- |
| Escrow             | `0x9A7Ca01E00be0717d28509E1fdC2a8543dE86D03` |
| Test `$BLOW` token | `0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7` |
| SeatVault          | `0xA901DFC8C46faF3A24F4002849dE98dFE9722C95` |

The product name is `$BLOW`; the current Sepolia token reports the on-chain name `Margin Call` and symbol `MARGINCALL`.

This token is testnet infrastructure. It has no promised market value, and the application currently provides no purchase, reward, faucet, or official distribution flow.

## Administration And Versioning

The SeatVault is non-upgradeable but owner-administered:

- `setPolicy` can update thresholds and the cooldown.
- Policy changes do not alter unlock times already recorded for pending batches.
- `setToken` can change the staking token only when no principal is outstanding.
- Pause controls can stop new stakes and unstake initiations, but completing an already-unlocked withdrawal remains available.

Application configuration identifies one active vault. Only that vault grants capacity. Historical vault records remain available for withdrawals.

## Mainnet Boundary

A Base mainnet `$BLOW` launch has not been completed. The following remain separate, approval-gated work:

- official mainnet token address and verified source
- supply and distribution model
- acquisition and liquidity venues
- compatibility evidence for the mainnet SeatVault
- mainnet escrow and vault deployment
- any proposed utility beyond capacity

None of those properties should be inferred from the Sepolia deployment.
