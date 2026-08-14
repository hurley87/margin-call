# Live Contracts

Margin Call Crash is live on **Base Sepolia** (`84532`).

Addresses below match the curated deployment record in the repository. Always confirm BaseScan if you are sending transactions outside the app.

---

## Core Addresses

| Contract              | Address                                      | BaseScan                                                                                       |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Desk Dollars (`tUSD`) | `0x4Ff4a2d64C53BE0b6f0B77B191579E7CEC026d56` | [Token](https://sepolia.basescan.org/address/0x4Ff4a2d64C53BE0b6f0B77B191579E7CEC026d56#code)  |
| Faucet                | `0x16434C92223baEDE8301b2F117DeD0F56147Bb99` | [Faucet](https://sepolia.basescan.org/address/0x16434C92223baEDE8301b2F117DeD0F56147Bb99#code) |
| BankrollVault         | `0x75Db0b7865060c0d59a9801c4396ebfc430A740a` | [Vault](https://sepolia.basescan.org/address/0x75Db0b7865060c0d59a9801c4396ebfc430A740a#code)  |
| MarginCallCrash       | `0x2E7eb3B6Ac8E1ebF0C4B90067F584B21F22C2b3d` | [Game](https://sepolia.basescan.org/address/0x2E7eb3B6Ac8E1ebF0C4B90067F584B21F22C2b3d#code)   |
| Inco Lightning        | `0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624` | —                                                                                              |

---

## Round Parameters

| Parameter      | Value                    |
| -------------- | ------------------------ |
| Round duration | `60` seconds             |
| Entry window   | `45` seconds             |
| Expiry delay   | `900` seconds after lock |

---

## Frontend

Production Floor: [https://margincall.fun](https://margincall.fun)

{% hint style="info" %}
These are testnet contracts. Desk Dollars and vault shares have no real value. Do not treat BaseScan balances as dollars.
{% endhint %}

For builders wiring wallets or bots, see [Direct Contract Access](../developers/direct-contract-access.md).
