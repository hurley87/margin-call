# Architecture

Margin Call should feel like a trading pit.

The money should feel like a vault.

Those two jobs stay separate on purpose.

---

## The Stack

- **Floor (web app)** — phone login, sponsored gas, immersive Round theater, Record / Rounds / LP
- **`MarginCallCrash`** — epochs, Tickets, entry window, reveal, finalize, expire
- **`BankrollVault`** — Desk Dollars custody, reservations, LP shares, claims, refunds
- **`DeskDollars` (`tUSD`)** — testnet ERC-20 + rate-limited faucet
- **Inco Lightning** — confidential randomness handle and covalidator attestation

Network today: **Base Sepolia** (`84532`).

---

## Money Path

```text
Player wallet
    │  Margin on enter
    ▼
BankrollVault  ◄── LP deposits / withdrawals (free liquidity only)
    │
    │  ticket-scoped reserve / release / pay / refund
    ▼
MarginCallCrash (coordinates; never holds general bankroll)
```

Player Margin never parks in a free-floating game balance. The vault is the only general custody layer.

---

## Trust Split

| Public while Open               | Confidential while Open              |
| ------------------------------- | ------------------------------------ |
| Round id, timestamps, wallets   | Crash Point plaintext                |
| Margin, Tier, Ticket ownership  | Encrypted randomness handle's secret |
| Vault balances and reservations |                                      |

After lock and attestation, the Crash Point is public and verifiable. Claims use only that verified plaintext plus public Ticket data.

---

## Operator Limits

Administrative actions are public. They cannot:

- regenerate or substitute a Round's encrypted handle
- rewrite a finalized Crash Point
- pull arbitrary vault funds through the game contract

If attestation never arrives before expiry, Tickets refund original Margin. The Floor does not invent an outcome to keep the theater moving.

See [Live Contracts](live-contracts.md) for addresses and [Settlement](settlement-flow.md) for the permissionless path.
