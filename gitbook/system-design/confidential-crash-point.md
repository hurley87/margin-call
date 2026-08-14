# Confidential Crash Point

The Crash Point is the verified multiplier at which a Round's market dies.

It is capped at `10.00x`.

It is shared by every Ticket in the Round.

And while entry is open, nobody — not players, not the operator, not chain tourists — can read the plaintext.

---

## The Promise

1. The game creates **one** Inco confidential-randomness handle for a Round **before** accepting any of its Tickets
2. That handle cannot be replaced
3. Reveal is allowed only after entry locks
4. Finalization verifies an Inco covalidator attestation against that **exact** stored handle
5. Claims use only the verified plaintext result

If a valid reveal never arrives before expiry, the game does not invent a Crash Point. Ticket owners reclaim exact original Margin.

---

## Why It Matters

A crash game without pre-commitment is a storytelling problem wearing a multiplier costume.

With pre-commitment, the Floor can run a dramatic Replay without asking you to trust that the climb was "fair in spirit." The attested number was already locked in before anyone posted Margin.

{% hint style="info" %}
Only the random value and resulting Crash Point are confidential during Open. Everything else about the Round is public by design.
{% endhint %}

---

## What You Can Verify

On the Rounds / Record views you can follow:

- the encrypted handle
- the attestation / finalization transaction
- the stored Crash Point
- BaseScan links for the lifecycle

Spectators and Ticket holders see the same verified number. The Replay is a rendering of that number — not a second source of truth.
