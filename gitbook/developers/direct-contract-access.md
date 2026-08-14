# Direct Contract Access

The web app is the front door.

The contracts are the Floor's skeleton.

Advanced players and builders can talk to Base Sepolia directly — for automation, custom wallets, or monitoring outside the UI.

---

## Start Here

Read [Live Contracts](../system-design/live-contracts.md) for current addresses and BaseScan links.

Core surfaces:

- **`DeskDollars`** — ERC-20 balances, approvals
- **Faucet** — `claim()` with per-wallet cooldown
- **`BankrollVault`** — LP `deposit` / redeem, ticket-scoped settlement hooks callable only by the authorized game
- **`MarginCallCrash`** — open Round, enter, request reveal, finalize, expire, ticket reads

---

## Useful Selectors (curated deployment)

| Action               | Contract        | Selector     |
| -------------------- | --------------- | ------------ |
| Approve Desk Dollars | Desk Dollars    | `0x095ea7b3` |
| Faucet claim         | Faucet          | `0x4e71d92d` |
| Vault deposit        | BankrollVault   | `0x6e553f65` |
| Open Round           | MarginCallCrash | `0xbde22ae0` |
| Enter                | MarginCallCrash | `0xbc208057` |
| Request reveal       | MarginCallCrash | `0x40261cdd` |
| Finalize Round       | MarginCallCrash | `0x02c6266a` |
| Expire Round         | MarginCallCrash | `0x292672ea` |

Selectors and addresses can change on redeploy. Prefer the repository deployment record over this page when they disagree.

---

## Rules Direct Callers Must Respect

- One Ticket per wallet per Round
- Margin amounts exactly `1`, `5`, or `10` Desk Dollars (6 decimals)
- Arcade Leverage exactly one of the six Tier values in basis points
- Round creation may require funding the Inco fee — phone-login embedded wallets in the app do not; they only enter pre-opened Rounds
- Never treat Desk Dollars as Circle USDC or real dollars

---

## Why Use the App Anyway

The Floor sponsors gas, bounds approvals, stops entry a few seconds before lock, and refuses to show a Ticket as settled on a hash alone.

Direct access is freer. The app is harder to shoot yourself with.
