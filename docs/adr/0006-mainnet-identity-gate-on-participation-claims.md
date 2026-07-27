# Play stays permissionless; mainnet participation-reward claims are identity-gated

ADR-0003 prices Sybil farming at the $2.50 protocol fee and lets fixed pots bound inflation. That bounds supply, not distribution. Once the game token trades, a wash loop purchases pot shares at fee cost: list floor-NAV Packs, rip them with your own Traders — $25 paid, $22.50 returned as creator proceeds, the recycled basket back in hand — and each cycle is a confirmed qualifying Rip for $2.50 plus gas. Farmers scale rips until pot-share value falls to that cost, so an ungated per-Rip pot under a tradable token is a continuous token sale for fee revenue: the 150,000,000-token participation allocation flows to whoever runs the loop cheapest, human per-Rip rewards dilute toward the bots' cost basis, and the token-sale framing carries regulatory weight of its own.

The decision splits the game from the subsidy. The mechanic is permissionless forever: Rips, Pack creation, and Trader operation never require identity, scripts are first-class players, and the application interface is never a trust boundary. The subsidy is not: on any mainnet deployment, claiming Participation Rewards requires a verified-identity attestation, enforced at claim time. ADR-0005's off-chain accounting and merkle Claim Roots make this a claims-pipeline predicate rather than a Rip-time check — ripping never blocks, only reward qualification. The V1 testnet Season ships ungated (ADR-0003 stands; the token is transfer-locked and valueless), but the claims flow is built gate-ready. The attestation provider and threshold are decided inside the gated mainnet review.

## Considered Options

- Keep ADR-0003 alone for mainnet — rejected: the fee bounds a farmer's cost, not their share of the distribution
- Price Trader mints ("a seat costs money") — compatible knob, rejected as the fix: it raises the loop's cost basis linearly and changes no equilibrium
- Reframe the pot as disclosed open mining and move human recognition to non-token rewards — a viable embrace-the-scripts posture, rejected because it forfeits meaningful per-Rip rewards for humans; revisit if attestation proves unworkable
- Loss-weighted rewards (share of pot proportional to realized negative EV) — rejected: the farmer's creator wallet recoups the measured loss and wallet linkage is unobservable
- Per-Trader or per-desk reward caps — rejected: splits into more Traders
