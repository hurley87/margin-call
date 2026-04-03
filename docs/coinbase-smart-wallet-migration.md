# Replace Privy with Base Account

## Goal

Replace Privy auth with the **Base Account recommended authentication flow** from Base docs:

1. Fetch or generate a fresh nonce before sign-in
2. Switch to the target Base chain
3. Call `wallet_connect` with the `signInWithEthereum` capability
4. Send `{ address, message, signature }` to the server
5. Verify on the server with `viem` and create an httpOnly session cookie

This keeps the existing terminal-style UI and cookie-based app sessions, but changes the auth transport to match Base's guide instead of using wagmi's `coinbaseWallet` connector for login.

## Why The Original Draft Was Off

The previous draft used:

- wagmi `coinbaseWallet(...)` as the auth entry point
- `useSignMessage()` for login
- `siwe.verify()` as the main smart-wallet verification step

That can be made to work, but it is **not** the flow Base recommends in [Authenticate Users](https://docs.base.org/base-account/guides/authenticate-users). The recommended path is `@base-org/account` + `wallet_connect` on the client and `publicClient.verifyMessage()` on the server.

## Decisions

- **Frontend auth:** use `@base-org/account` as the login entry point
- **UI:** keep the current custom terminal login button, but wire it to the Base Account flow; optionally swap to `SignInWithBaseButton` later if product wants Base branding
- **Server auth:** parse the SIWE message for field validation, but use `viem` `verifyMessage()` for cryptographic verification
- **Session model:** keep httpOnly JWT cookie sessions
- **Nonce strategy:** prefetch a nonce on page load and rotate it after each login attempt to match Base guidance and avoid popup-blocker issues
- **Network:** bind auth to the app's current payment chain, which is Base Sepolia today; Base's docs use Base mainnet in examples, so the code here must parameterize the chain id instead of hardcoding `8453`
- **Migration shape:** split into two logical slices
  - Slice 1: auth replacement
  - Slice 2: transaction signing cleanup for existing wagmi write flows

---

## Phase 0: Extract Chain Constants

Before removing Privy, move the shared chain constants out of `src/lib/privy/config.ts`.

### New file: `src/lib/chain.ts`

Export:

- `PAYMENT_CHAIN`
- `PAYMENT_CHAIN_ID`
- `PAYMENT_CHAIN_ID_HEX`
- `PAYMENT_CHAIN_NAME`
- `isPaymentChain()`

Notes:

- `PAYMENT_CHAIN` should remain `baseSepolia` for now unless the app is intentionally moving to Base mainnet in the same PR
- `PAYMENT_CHAIN_ID_HEX` should be derived from the numeric id and used by `wallet_switchEthereumChain`

This lets auth, wagmi, and server verification share one source of truth after Privy is gone.

---

## Phase 1: Base Account Auth Infrastructure

### 1.1 Add dependencies

```bash
pnpm add @base-org/account @base-org/account-ui siwe jose
```

`@base-org/account-ui` is optional if we keep the terminal-styled button, but adding it now keeps the official button available for experiments and testing.

### 1.2 `src/lib/auth/session.ts` (new)

Server-side session helpers replacing `src/lib/privy/server.ts`:

- `createSessionCookie(walletAddress)` returns a signed JWT cookie
- `verifySession(request)` reads and verifies the cookie and returns `{ walletAddress }`
- `clearSessionCookie()` expires the cookie

Cookie shape:

- name: `session`
- `httpOnly: true`
- `secure: true` in production
- `sameSite: "lax"`
- `path: "/"`
- expiry: 7 days

Env:

- `SESSION_SECRET` required, 32-byte minimum

### 1.3 `src/lib/auth/base-account.ts` (new)

Create a thin client-side wrapper around the Base SDK:

```ts
import { createBaseAccountSDK } from "@base-org/account";

export function createBaseAuthProvider() {
  return createBaseAccountSDK({
    appName: "MARGIN CALL",
  }).getProvider();
}
```

Keep this isolated so the rest of the app never imports the SDK directly.

### 1.4 `src/app/api/auth/nonce/route.ts` (new)

`GET /api/auth/nonce`

- generate a cryptographically random nonce
- store it in Supabase with a 5-minute expiry
- return `{ nonce }`

Use a server-issued nonce instead of client-only generation because the app already has Supabase and a replay-protection table.

### 1.5 `src/app/api/auth/verify/route.ts` (new)

`POST /api/auth/verify`

Request body:

```ts
{
  address: string;
  message: string;
  signature: string;
}
```

Server behavior:

1. Validate body shape with Zod
2. Parse the message with `siwe`
3. Verify:
   - parsed message address matches `address`
   - `domain` matches app domain
   - `uri` matches app URL
   - `chainId` matches `PAYMENT_CHAIN_ID`
   - nonce exists and is not expired
   - `issuedAt` is fresh
4. Atomically consume the nonce
5. Verify the signature with `publicClient.verifyMessage({ address, message, signature })`
6. Set the session cookie and return `{ address }`

Important:

- Use `viem` `verifyMessage()` for the actual signature check
- Do **not** make `siwe.verify()` the primary cryptographic verifier
- This follows Base guidance for smart-wallet signatures and ERC-6492 handling

### 1.6 `src/app/api/auth/logout/route.ts` (new)

`POST /api/auth/logout`

- clear the session cookie
- return `{ ok: true }`

### 1.7 `src/app/api/auth/me/route.ts` (new)

`GET /api/auth/me`

- return `{ address }` when the cookie is valid
- return `401` otherwise

This keeps restore-on-refresh simple.

### 1.8 Supabase migration: `auth_nonces`

```sql
CREATE TABLE auth_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_auth_nonces_expires
  ON auth_nonces (expires_at);
```

If desired, add a scheduled cleanup job later, but it is not required to complete the migration.

---

## Phase 2: `useAuth` And Auth Provider

### 2.1 `src/hooks/use-auth.ts` (new)

Replace `usePrivy()` with a repo-local auth hook:

```ts
interface UseAuth {
  ready: boolean;
  authenticated: boolean;
  walletAddress: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshNonce: () => Promise<void>;
}
```

Implementation notes:

- on mount:
  - fetch `/api/auth/me`
  - prefetch `/api/auth/nonce`
- `login()`:
  - ensure a nonce is already present
  - call `wallet_switchEthereumChain` with `PAYMENT_CHAIN_ID_HEX`
  - call `wallet_connect` with `signInWithEthereum: { nonce, chainId }`
  - extract `address`, `message`, and `signature`
  - `POST /api/auth/verify`
  - store `walletAddress` in React state
  - fetch a fresh nonce for the next attempt
- `logout()`:
  - call `/api/auth/logout`
  - clear local auth state
  - fetch a fresh nonce

Do **not** rely on `useSignMessage()` for authentication.

### 2.2 `src/components/providers/wallet-provider.tsx` (new)

Recommended tree:

```txt
QueryClientProvider
  └── AuthProvider
       └── WagmiProvider
            └── BaseNetworkGuard
                 └── {children}
```

Notes:

- `AuthProvider` owns Base Account login state
- `WagmiProvider` remains available for read-only contract hooks and transitional write flows
- use plain `wagmi` `createConfig`, not `@privy-io/wagmi`

### 2.3 Update `src/app/layout.tsx`

- replace `PrivyProvider` import with `WalletProvider`

---

## Phase 3: Replace Client-Side Privy Usage

Mechanical swap:

- `import { usePrivy } from "@privy-io/react-auth"` -> `import { useAuth } from "@/hooks/use-auth"`

Files that should move first:

| File                                | Current Privy usage                         | New source  |
| ----------------------------------- | ------------------------------------------- | ----------- |
| `src/app/page.tsx`                  | `ready`, `authenticated`, `login`, `logout` | `useAuth()` |
| `src/components/nav.tsx`            | `logout`                                    | `useAuth()` |
| `src/hooks/use-desk.ts`             | `authenticated`                             | `useAuth()` |
| `src/hooks/use-traders.ts`          | wallet address + auth state                 | `useAuth()` |
| `src/hooks/use-portfolio.ts`        | `authenticated`                             | `useAuth()` |
| `src/hooks/use-activity-feed.ts`    | `authenticated`                             | `useAuth()` |
| `src/hooks/use-usdc-balance.ts`     | wallet address                              | `useAuth()` |
| `src/hooks/use-create-trader.ts`    | wallet address                              | `useAuth()` |
| `src/hooks/use-escrow.ts`           | wallet address                              | `useAuth()` |
| `src/components/wire/wire-feed.tsx` | `authenticated`                             | `useAuth()` |
| `src/app/deals/[id]/page.tsx`       | wallet address                              | `useAuth()` |

Copy updates:

- `SECURE LINK VIA PRIVY` -> `SECURE LINK VIA BASE`

If product wants stronger alignment with Base branding later, replace the custom login button with `SignInWithBaseButton` from `@base-org/account-ui/react`.

---

## Phase 4: Transaction Signing Strategy

This is the part the previous draft glossed over.

Replacing Privy auth does **not** automatically preserve these existing wagmi write flows:

- `src/hooks/use-escrow.ts`
- `src/hooks/use-create-deal.ts`
- `src/app/deals/[id]/page.tsx`

Those paths currently depend on a connected wallet client, not just an authenticated session cookie.

### Option A: Keep wagmi writes with a dedicated wallet connector

Pros:

- smaller surface-area change in write hooks
- familiar `useWriteContract()` ergonomics

Cons:

- auth and transaction state come from different abstractions
- easier to drift away from the Base Account guide
- may require syncing two wallet connection layers

### Option B: Build a wallet client from the Base Account provider

Pros:

- one provider for both auth and writes
- closest to Base's recommended SDK flow
- avoids mixing `wallet_connect` login with separate wagmi connection state

Cons:

- requires touching the write flows directly

### Recommendation

Use **Option B** unless there is a strong reason to preserve `useWriteContract()` immediately.

Implementation shape:

- `src/lib/auth/wallet-client.ts` (new)
  - wrap the Base Account provider with `viem` `createWalletClient({ transport: custom(provider), chain: PAYMENT_CHAIN })`
- update write call sites to use imperative action helpers instead of `useWriteContract()`
- keep wagmi `useReadContract()` for read-only data during the transition

This is more maintainable because auth and signing share the same underlying provider.

---

## Phase 5: Simplify `authFetch`

`src/lib/api.ts` should stop asking Privy for bearer tokens.

Replace that behavior with cookie-based fetches:

```ts
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: "include",
  });
}
```

This matches the new session model and reduces client auth complexity.

---

## Phase 6: Replace Server-Side Auth Checks

Mechanical swap across API routes:

```ts
const { walletAddress } = await verifySession(request);
```

That replaces:

```ts
const { user } = await verifyPrivyToken(request);
const walletAddress = getPrivyWalletAddress(user);
```

Routes to migrate:

- `desk/register`
- `desk/configure`
- `desk/approve`
- `desk/portfolio`
- `desk/activity`
- `desk/approvals`
- `desk/settings`
- `trader/create`
- `trader/list`
- `trader/[id]`
- `trader/[id]/history`
- `trader/[id]/transactions`
- `trader/[id]/balance`
- `trader/[id]/outcomes`
- `trader/[id]/activity`
- `trader/[id]/assets`
- `trader/[id]/resume`
- `trader/[id]/revive`
- `trader/[id]/pause`
- `deal/my`
- `deal/enter`
- `deal/sync`
- `deal/list`
- `prompt/suggest`

---

## Phase 7: Cleanup

### Remove packages

```bash
pnpm remove @privy-io/react-auth @privy-io/server-auth @privy-io/wagmi
```

### Delete files after migration

- `src/lib/privy/server.ts`
- `src/lib/privy/config.ts`

### Env changes

- remove `NEXT_PUBLIC_PRIVY_APP_ID`
- remove `PRIVY_APP_SECRET`
- add `SESSION_SECRET`

### Test updates

- mock `@/lib/auth/session` instead of `@/lib/privy/server`
- update any auth-related tests to expect cookie sessions
- add verification tests for nonce replay, chain mismatch, and invalid signature cases

---

## Critical Technical Notes

1. **Use `wallet_connect`, not `useSignMessage()`, for login.** That is the main client-side alignment point with Base's guide.

2. **Use `verifyMessage()` for signature verification.** Base explicitly calls out ERC-6492 support for undeployed smart wallets through `viem`.

3. **Still parse the SIWE message server-side.** `verifyMessage()` proves signature validity, but the app still needs to validate `domain`, `uri`, `chainId`, `nonce`, and freshness.

4. **Prefetch the nonce.** Base recommends fetching or generating the nonce before the user clicks sign-in to reduce popup-blocker problems.

5. **Do not assume "logout" disconnects the wallet itself.** App logout should clear the session cookie and local state; wallet-level connection semantics may persist across sessions.

6. **Keep chain ids configurable.** Base docs show Base mainnet; this repo currently points at Base Sepolia, so auth must use shared chain constants instead of hardcoded example values.

7. **Fallback only if needed.** If `wallet_connect` throws `method_not_supported`, add a compatibility path using `eth_requestAccounts` + `personal_sign`. Treat that as fallback behavior, not the default.

---

## Verification

1. `pnpm build` completes with no Privy imports in app auth paths
2. `pnpm dev` -> click `CONNECT_WALLET` -> Base Account popup opens -> sign-in succeeds
3. Server receives `{ address, message, signature }` from `wallet_connect`
4. Refresh page -> session persists via cookie -> `/api/auth/me` restores auth state
5. Reuse the same nonce -> server rejects the request
6. Tamper with `domain`, `chainId`, or `signature` -> server rejects the request
7. Transaction flows still work for:
   - create deal
   - escrow approve/deposit
   - deal actions page
8. `pnpm test` passes after auth mocks and server verification tests are updated
