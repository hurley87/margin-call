# Desk Dollars

Desk Dollars are the only settlement asset in the Game Jam MVP.

Onchain symbol: `tUSD`.

Player-facing ticker in the app: `USDC`.

Never Circle USDC. Never real dollars. Base Sepolia only.

---

## What They Are For

- Posting Margin when you enter a Round
- Receiving winning payouts
- LP deposits into the bankroll vault

That is the whole job.

---

## Faucet

Any wallet can claim `100` Desk Dollars from the in-app faucet, with a one-hour cooldown per wallet.

Gas for the claim is sponsored in the app. You do not need test ETH.

{% hint style="info" %}
Desk Dollars and vault shares have no real financial value and no claim on real US dollars. The disclosure on every page is not decoration.
{% endhint %}

---

## Approvals

Before your first entry, you approve a **bounded** `1,000` Desk Dollars allowance for the vault spender. The Floor always shows the spender, the cap, and the contract address.

Unlimited allowances are never requested. Later entries reuse the bounded approval when it still covers the Margin.

---

## Mainnet Intent

The long-term settlement asset is real Circle USDC. Desk Dollars are a Game Jam stand-in and must never ship to mainnet as a real-dollar claim. See the [Roadmap](../roadmap.md).
