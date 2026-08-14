# Roadmap

This roadmap is direction, not a promise sheet.

Nothing here weakens the live MVP guarantees around Desk Dollars, vault custody, bounded reservations, Inco integrity, or permissionless recovery.

---

## Shipped — Game Jam Floor

- Shared-round Crash on Base Sepolia
- Phone login with sponsored embedded wallets
- Desk Dollars faucet and bounded vault approvals
- Six Arcade Leverage Tiers and `1` / `5` / `10` Margin sizes
- Pre-committed confidential Crash Point via Inco Lightning
- Immersive Floor Replay that never gates settlement
- Record, Rounds history, and LP Desk
- Permissionless claim, refund, reveal, finalize, and expire paths

---

## Deferred Strategy Modes

Ideas that need their own design review before they touch product scope:

- **Laddered Tickets** — split Margin across up to three Tiers against one Crash Point
- **Persistent desk runs** — virtual career score over independently settled Tickets (non-redeemable score, not an ERC-20)
- **Public market regimes** — announced conditions with separately documented math (never a cosmetic label on unchanged odds)
- **Confidential analyst report** — imperfect private hint that must never disclose the exact Crash Point

---

## Deferred Experience

- **AI broker margin call / appeal** — optional 1980s risk-manager voice after a finalized loss; must stay independent of core settlement and LP funds
- Richer analytics, cadence experiments, and presentation polish

No refund probabilities, budgets, or appeal mechanics are committed.

---

## Deferred LP Mechanics

- Constrained FIFO withdrawal queue for moments when free liquidity is tight
- Testnet **Margin Call (`$CALL`)** LP reward token and distributor

Neither ships in the current MVP. Withdrawals today are free-liquidity only; there are no LP reward emissions.

---

## Mainnet Direction

After the Base Sepolia Game Jam:

- Intended settlement asset: real Circle USDC
- Intended brand token path: externally issued ERC-20 via Bankr (separate from deferred testnet `$CALL`)

Supply, allocation, utility, governance, and launch mechanics are undecided. This page does not imply a claim on vault assets, Desk Dollars, protocol revenue, or ownership.

Mainnet wagering and jurisdictional availability require dedicated legal, security, economic, and deployment review.
