# Rounds & Replay

A **Round** is the onchain state for one 60-second **Epoch**: encrypted Crash Point, Tickets, status, and timing.

An Epoch exists on the grid whether or not anyone plays it. A Round only materializes when someone opens it — the first entry of the epoch, or a permissionless pre-open ahead of demand.

---

## Cadence

| Phase      | Nominal timing   | What happens                                                |
| ---------- | ---------------- | ----------------------------------------------------------- |
| Open       | `:00–:45`        | Entry allowed; encrypted Crash Point already exists         |
| Locked     | `:45`            | Entry closes onchain                                        |
| Reveal     | `:45+`           | Encrypted handle becomes eligible for attested reveal       |
| Finalized  | Target `:50–:55` | Verified plaintext Crash Point stored                       |
| Claimable  | After finalize   | Winning Tickets can be claimed                              |
| Next Round | `:60`            | Next epoch is available even if an earlier Round is delayed |

Timing comes from contract timestamps, not only the browser clock. Duration and entry window are immutable for the deployment.

---

## Why the Climb Is a Replay

The Crash Point is committed as encrypted Inco state **before** any Ticket is accepted, and revealed only **after** lock.

So nothing climbs live while entries are open. That would be a lie.

After finalization, the Floor runs a short dramatized climb from `1.00x` to the verified Crash Point — roughly four to twelve seconds, scaling with the result. As the curve passes each Arcade Leverage Tier, Tickets at that Tier close. When the curve dies, every Ticket still open takes the margin call.

That climb is a **Replay**.

{% hint style="info" %}
Watching, skipping, or replaying never decides, changes, or gates settlement. The attested Crash Point already did.
{% endhint %}

---

## What You See on the Floor

- **Open** — giant countdown, live Ticket chips, Enter CTAs
- **Locked / awaiting** — honest waiting state, never a stalled fake climb
- **Player with Ticket** — Replay starts after **Verify and settle** confirms
- **Spectator** — Replay available once the Round is finalized
- **Reduced motion** — same information as a static result card or countdown

Delayed attestation shows as awaiting attestation. The Floor never invents a multiplier to keep the animation moving.

---

## Lazy Rounds, Optional Keeper

Rounds are created on demand. A keeper may pre-open epochs during busy sessions so phone-login players (who cannot fund round creation) always see an Enter form.

If pre-opening stalls, the UI shows a waiting state. Any ETH-holding wallet can still open the current Round permissionlessly. Settlement never depends on the keeper.
