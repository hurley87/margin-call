# Issue #351 guided smoke worksheet

Fill hashes and checkboxes during the live demo. Do not record phone numbers, secrets, or session tokens.

## Deployed stack (fresh #351)

| Contract        | Address                                      |
| --------------- | -------------------------------------------- |
| tUSD            | `0x4Ff4a2d64C53BE0b6f0B77B191579E7CEC026d56` |
| Faucet          | `0x16434C92223baEDE8301b2F117DeD0F56147Bb99` |
| BankrollVault   | `0x75Db0b7865060c0d59a9801c4396ebfc430A740a` |
| MarginCallCrash | `0x2E7eb3B6Ac8E1ebF0C4B90067F584B21F22C2b3d` |
| Frontend        | https://margincall.fun                       |

Operator lifecycle already recorded: reveal `0x0eb42b…`, finalize `0x02cd6461…` (round 0).

## Privy dashboard (before player smoke)

- [ ] App Pays enabled for Base Sepolia
- [ ] Client transactions allowed
- [ ] Policy scoped to the four addresses + selectors in `base_sepolia.json` → `privySponsorship`
- [ ] Record `policyId`: ____________________
- [ ] In-policy sponsored call succeeds
- [ ] Out-of-policy call rejected (evidence): ____________________

## Fresh-phone player path (0 ETH throughout)

Wallet address (public): `0x________________________________________`

| Step                                           | Hash / evidence |
| ---------------------------------------------- | --------------- |
| ETH balance 0 before                           |                 |
| Faucet claim                                   |                 |
| Approve (bounded)                              |                 |
| Enter round A                                  |                 |
| Reveal / finalize (or keeper)                  |                 |
| Claim or settle loss                           |                 |
| Enter round B (leave unfinalized)              |                 |
| expireRound                                    |                 |
| refund                                         |                 |
| LP approve                                     |                 |
| LP deposit                                     |                 |
| LP withdraw                                    |                 |
| Over-limit withdraw rejected; fundsMoved=false |                 |
| Overlapping rounds observed                    |                 |
| Idle epoch no state                            |                 |
| Ticketless preopen no exposure                 |                 |
| Global history ≥20 finalized                   |                 |
| Pending/recovery audited                       |                 |

When complete, merge into `contracts/deployments/base_sepolia.json` `smokeTest` and run:

```bash
pnpm validate:base-sepolia-release -- --release-complete
```
