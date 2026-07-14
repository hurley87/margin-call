# BLOW & Floor Access

`$BLOW` decides how much operating capacity a trader has on the floor.

It does not replace USDC. It does not make a trader luckier. It buys the desk more room to operate.

{% hint style="warning" %}
**Stake affects capacity, never outcome probability.**
{% endhint %}

---

## The Floor Ladder

Every trader starts in the Gallery. A desk can post `$BLOW` principal against an individual trader to take a Seat or a Corner Office.

- **Gallery** — 0 `$BLOW`; 10-minute cadence; at most 1 unresolved entry.
- **Seat** — 10,000 `$BLOW`; 5-minute cadence; at most 1 unresolved entry.
- **Corner Office** — 50,000 `$BLOW`; 5-minute cadence; at most 2 unresolved entries.

The cadence is an eligibility window, not a promise that a trade happens every five or ten minutes. Market hours, mandate filters, approvals, available deals, leases, and settlement checks still apply.

An unresolved entry is a trade that has entered the on-chain flow but has not finished settlement. Gallery and Seat traders can carry one at a time. A Corner Office trader can carry two.

Deal creation stays unlimited for every tier.

---

## What BLOW Does Not Do

Posting more `$BLOW` does **not** change:

- deal selection or ranking
- mechanical win probability
- payout size or extraction caps
- platform rake or creation fees
- the ability to create deals
- the story the outcome model is instructed to tell

The vault pays no yield or rewards. It has no dividend, fee rebate, slashing, or bonus-payout path. Principal is held for floor capacity and returned through the unstaking flow.

USDC remains the only settlement asset for trader bankrolls, deal pots, wins, losses, and platform fees.

---

## Posting Principal

Open a trader you control and use the **Floor seat** panel.

1. Fund the trader's escrow so the desk treasury is recorded as its depositor.
2. Choose Seat, Corner Office, or enter a custom `$BLOW` amount.
3. Approve the SeatVault to move the required token amount.
4. Confirm the stake transaction.
5. Wait for the chain receipt and reconciliation; the new credential then appears across the floor.

Only the trader's current escrow depositor can post new principal. The stake belongs to that original staker; it is not transferred to the trader or mixed with USDC.

The product shows the connected desk's `$BLOW` balance in the top status bar. There is currently no in-app purchase, reward, faucet, or official distribution flow for `$BLOW`.

---

## Pulling Principal

Unstaking happens in two steps:

1. **Initiate the pull.** The amount immediately leaves active principal and enters the cage. If that crosses a threshold, capacity drops immediately.
2. **Complete the pull.** After the 24-hour cooldown, the pending principal can be returned to the original staker.

Changing a trader's depositor also drops its effective tier to Gallery. It does not strand the former staker: principal in current or previous vault versions remains withdrawable through its normal cooldown path.

If the chain, RPC, configuration, or ownership check cannot prove a higher tier, the game fails closed to Gallery capacity.

---

## Current Testnet Contracts

`$BLOW` capacity is live on **Base Sepolia** only.

- **Test `$BLOW` token:** [`0x0d930…60d7`](https://sepolia.basescan.org/address/0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7)
- **Active SeatVault:** [`0xA901…2C95`](https://sepolia.basescan.org/address/0xA901DFC8C46faF3A24F4002849dE98dFE9722C95)

The product calls the token `$BLOW`; the current Sepolia ERC-20 reports the on-chain name **Margin Call** and symbol `MARGINCALL`.

This is testnet infrastructure with no promised market value. A Base mainnet token address, supply, distribution method, liquidity venue, and expanded token economics have not launched and should not be inferred from the Sepolia token.
