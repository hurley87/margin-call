# Login is phone-number-only with embedded smart wallets and sponsored gas

The earlier draft assumed an external testnet wallet: connect, acquire test ETH, approve, transact. The decision replaces that with Privy SMS login as the only method — a successful login provisions an embedded smart wallet on Base Sepolia, and every app transaction executes as a sponsored user operation through a paymaster scoped to the deployed contracts. Players and LPs share the same path; the retired SIWA signature/nonce scaffolding is removed with it.

Three reasons:

1. **The 30-second onboarding goal is unreachable with wallet setup.** A phone number and an SMS code are the entire barrier to entry; no extension, seed phrase, or faucet-hunting for gas.
2. **Gasless needs this anyway.** Sponsorship requires smart accounts and a paymaster; embedded wallets are the shortest path, and batching approve+enter into one sponsored confirmation collapses the entry flow to a single decision.
3. **The phone number is the margin call.** The roadmap's AI risk-manager call after a liquidation needs a delivery channel; the login number — with explicit, separately obtained opt-in consent — is that channel. The MVP itself never contacts a player beyond the login code.

Consequences:

- A paymaster sponsors gas but cannot supply `msg.value`, so an embedded wallet cannot be a round creator (ADR 0006 unchanged). The interface offers entry only into initialized rounds, which narrows ADR 0002's guarantee (amended there): **the keeper is required for entry availability, optional for settlement**. A funded pre-opening mechanism was considered and rejected — a game-held fee balance reintroduces the ETH-drain surface ADR 0006 removed. Outage behaviour is documented rather than papered over: a stalled pre-opener triggers the stale-pre-open alert, the interface shows an honest waiting state instead of an entry form, everything in flight settles permissionlessly, and any ETH-holding wallet restores entry availability with one `openRound` call (technical design §11).
- The app never stores, logs, or transmits phone numbers. Privy's client session object does expose the linked number in the browser, so the guarantee is scoped precisely: server identity is the access-token DID only, the app persists only DID and wallet address, and phone/auth-header redaction from app-controlled logs, analytics, and error reporting is verified by telemetry-payload tests. The embedded wallet address is the only onchain identity.
- The sponsorship policy is scoped to the deployed contract addresses and monitored; a drained policy degrades to a clear user-facing error.
- The deployment record includes the Privy app identifier and paymaster policy configuration (identifiers only, never secrets).
