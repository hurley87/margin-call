# Keeper + monitoring runbook

The Crash keeper is a Convex scheduled action (`crash-keeper`, every 20s) that drives **permissionless** round transitions from onchain state. It chooses no outcome, receives no early decryption access, and never becomes settlement authority.

## Why the keeper exists

Under phone-only login (ADR 0008), players use Privy embedded wallets with sponsored gas. A paymaster sponsors gas but **cannot supply `msg.value`**, so embedded wallets cannot call payable `openRound` / create rounds (ADR 0006).

**The keeper is required for entry availability and optional for settlement.**

- Phone-login players can only enter rounds some ETH-holding wallet has already opened.
- Settlement, claim, refund, expiry, and LP operations remain fully permissionless with the keeper stopped.
- If pre-opening stalls while players are active, the UI shows an honest waiting state (no fake countdown); the stale-pre-open alert fires.

## Duties (priority order)

1. **Expire** eligible exposed rounds (`Open` | `RevealRequested` past `expiresAt`) — highest priority; clears reveal-window freeze.
2. **`requestReveal`** for locked rounds that have tickets.
3. **Fetch attestation** + **`finalizeRound`** (plaintext comes only from Inco covalidators).
4. **Pre-open** current and next epochs while a session is active (`KEEPER_PREOPEN_ENABLED=true` or recent onchain demand).
5. Emit **monitoring alerts** (never gate transactions).

Idle deployments emit **zero transactions**.

## Credentials (Convex dashboard only)

Set these on the Convex deployment — never in client code or the repo:

| Variable                                                                          | Purpose                                                                            |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `KEEPER_PRIVATE_KEY`                                                              | Funded EOA that pays gas + Inco fees                                               |
| `BASE_SEPOLIA_RPC_URL`                                                            | Base Sepolia RPC                                                                   |
| `KEEPER_PREOPEN_ENABLED`                                                          | `true` to keep current+next initialized during demo/judged sessions                |
| `KEEPER_ATTESTATION_URL`                                                          | App origin for `POST /api/crash-attestation` (falls back to `NEXT_PUBLIC_APP_URL`) |
| `KEEPER_ALERT_WEBHOOK_URL`                                                        | Optional webhook for alert fan-out                                                 |
| `KEEPER_PAYMASTER_SPEND_BUDGET_WEI`                                               | Optional spend budget for paymaster alerts                                         |
| `MARGIN_CALL_CRASH_ADDRESS` / `BANKROLL_VAULT_ADDRESS` / `INCO_LIGHTNING_ADDRESS` | Optional overrides (defaults from the curated Base Sepolia deployment record)      |

Missing credentials → keeper no-ops and records a `missing_credentials` alert (cron does not crash).

## Manual failover (pre-open)

Any ETH-holding wallet can restore entry availability:

```bash
# Funded key with Base Sepolia ETH; addresses default from deployments/base_sepolia.json
export BASE_SEPOLIA_RPC_URL=…
export OPERATOR_PRIVATE_KEY=0x…

# Open current (+ next) via the lifecycle smoke helper, or call openRound directly:
cast send "$MARGIN_CALL_CRASH_ADDRESS" "openRound(uint256)" "$ROUND_ID" \
  --value "$(cast call "$INCO_LIGHTNING_ADDRESS" "getFee()(uint256)")" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$OPERATOR_PRIVATE_KEY"
```

Redundant keeper: run a second Convex deployment (or operator bot) with the same permissionless calls — first successful receipt wins; transitions are idempotent / safely retryable.

## Settlement with the keeper stopped (drill)

1. Stop the Convex cron / unset `KEEPER_PRIVATE_KEY` so the keeper no-ops.
2. Drive reveal → attest → finalize (or expire) from any wallet — the product UI already offers these permissionless paths for tickets and LP freeze recovery.
3. Confirm claims/refunds still complete.
4. Confirm phone-login **entry** stays blocked until some ETH wallet opens the current epoch (expected).

## Alerts

Alerts append to the `keeperAlerts` table and `console.error`; they **do not** authorize or block settlement.

| Kind                                    | Trigger                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `delayed_reveal`                        | Ticketed `Open` still past `lockAt + 90s`                          |
| `failed_attestation`                    | Attestation fetch failed for a finalize attempt                    |
| `expiry_eligibility`                    | Exposed round past `expiresAt` not yet expired                     |
| `freeze_outliving_expiry`               | Share freeze still on after oldest blocking round's `expiresAt`    |
| `low_free_liquidity`                    | `freeLiquidity < 5,000 tUSD`                                       |
| `entry_floor_approach`                  | `grossAssets < 12,500 tUSD` (entry floor is 10,000)                |
| `low_keeper_eth`                        | Keeper balance `< 0.005 ETH`                                       |
| `stale_preopen`                         | Active session + current epoch uninitialized                       |
| `paymaster_failure` / `paymaster_spend` | Sponsorship samples via `keeperSponsorship.reportSponsorshipEvent` |
| `missing_credentials`                   | Required env unset                                                 |

## Active session heuristic

Session is active when `KEEPER_PREOPEN_ENABLED=true` **or** any of the current / prior-1 / prior-2 rounds has `totalMargin > 0`. Pre-open runs only while active; settlement work always runs when onchain state requires it.
