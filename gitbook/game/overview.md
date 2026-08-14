# Overview

Margin Call is a shared-round crash game on Base Sepolia.

Every minute a new **Round** opens on a fixed epoch grid. Players post **Margin**, pick one **Arcade Leverage** Tier, and receive a **Ticket**. One confidential **Crash Point** decides every Ticket in that Round.

If the Crash Point reaches your Tier, your Ticket closes and pays Margin times that Tier.

If the market dies first, you get the margin call.

---

## What You Are Playing

This is not a PvP lobby.

It is not a reflex cashout.

It is not a simulation of real leveraged trading.

It is an arcade Floor where the only decision that matters is the one you make before entry locks: how much Margin, which Tier.

Everyone in a Round is playing the same Crash Point. You do not need to stay on the page. You can enter, leave, and come back to claim.

---

## The Feeling

Picture a trading pit that never sleeps for more than a minute.

During the Open window, Tickets drift onto the stage as chips. A giant countdown owns the room. You commit. Entry locks. The encrypted handle waits for attestation. Then the Floor runs a short **Replay** — a climbing curve from `1.00x` to the verified Crash Point.

Tiers that clear pop closed. Tickets still open when the curve dies take the margin call.

{% hint style="info" %}
The Replay is theater. Settlement already lives onchain. Watching, skipping, or replaying never changes your Ticket.
{% endhint %}

---

## The Three Moves

### Enter

Post `1`, `5`, or `10` Desk Dollars and choose one of six Arcade Leverage Tiers. One Ticket per wallet per Round.

### Verify

After lock, an Inco attestation finalizes the Crash Point. Players with Tickets press **Verify and settle**. Spectators can watch the Replay as soon as the Round is finalized.

### Claim or walk

Winners pull the reserved payout. Losers settle at zero. If a Round expires without a verified Crash Point, every Ticket owner can reclaim exactly their original Margin.

---

## Who It Is For

Casual players who want a short game, phone-only login, and proof the operator could not peek at the Crash Point while entries were open.

Liquidity providers who fund the vault, watch utilization, and withdraw free liquidity when it is available.

Builders who want the contracts, the attestation trail, and the permissionless settlement path.

---

## Design Principles

### One decision

Margin and Arcade Leverage. That is the whole play.

### Pre-committed confidentiality

The Crash Point exists as encrypted state before any Ticket is accepted. Nobody decrypts it while entry is open.

### Full reservation

Every accepted Ticket reserves its maximum payout in the vault before the Round locks.

### Permissionless recovery

Claims, refunds, reveals, and finalizations do not depend on a keeper. Later Rounds never wait on earlier ones.
