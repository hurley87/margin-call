# Replace Privy with Coinbase Smart Wallet

## Context

Privy currently handles user auth (wallet login, embedded wallets, JWT tokens) across ~30 files. Replacing it with Coinbase Smart Wallet gives users passkey-based ERC-4337 wallets natively on Base — aligning the user wallet stack with the trader agent wallets (already CDP smart accounts). The approach: **wagmi + `coinbaseWallet` connector** (headless, keeps terminal UI) + **SIWE + httpOnly cookies** for server auth.

## Decisions

- **Frontend:** wagmi's native `coinbaseWallet` connector with `preference: "smartWalletOnly"` — no Privy wrapper
- **Server auth:** SIWE (Sign-In With Ethereum) with EIP-1271 verification for smart contract wallets, httpOnly JWT cookie sessions
- **Migration:** Single PR — Privy and Smart Wallet can't coexist as auth providers, and the surface is contained

---

## Phase 1: New Auth Infrastructure

### 1.1 `src/lib/auth/session.ts` (new)

Server-side session management replacing `src/lib/privy/server.ts`:

- `createSessionCookie(walletAddress)` — signs a JWT (`jose` library, Edge-compatible) with `{ sub: walletAddress, iat, exp: 7d }`, returns `Set-Cookie` header value (`session` cookie, httpOnly, secure, sameSite=lax)
- `verifySession(request: NextRequest)` — reads `session` cookie, verifies JWT, returns `{ walletAddress }`. Direct replacement for `verifyPrivyToken()` + `getPrivyWalletAddress()`
- `clearSessionCookie()` — returns `Set-Cookie` header that expires the cookie
- Signing key: `process.env.SESSION_SECRET` (new env var)

### 1.2 `src/app/api/auth/nonce/route.ts` (new)

- `GET` → generates random nonce, stores in Supabase `auth_nonces` table (nonce TEXT PK, expires_at TIMESTAMPTZ, TTL 5 min), returns `{ nonce }`

### 1.3 `src/app/api/auth/verify/route.ts` (new)

- `POST { message, signature }` → parses SIWE message (`siwe` package), verifies signature with EIP-1271 support (pass viem publicClient as provider — **critical** for Smart Wallet signatures), consumes nonce, calls `createSessionCookie()`, sets cookie on response, returns `{ address }`

### 1.4 `src/app/api/auth/logout/route.ts` (new)

- `POST` → clears session cookie, returns `{ ok: true }`

### 1.5 `src/app/api/auth/me/route.ts` (new)

- `GET` → reads session cookie, returns `{ address }` or 401. Used by the client on page load to restore session state.

### 1.6 `src/hooks/use-auth.ts` (new)

Central hook replacing all `usePrivy()` usage. Interface:

```ts
interface UseAuth {
  ready: boolean; // wagmi not reconnecting + session check done
  authenticated: boolean; // wallet connected AND session cookie valid
  walletAddress: string | null;
  login: () => Promise<void>; // connect + SIWE sign + verify
  logout: () => Promise<void>; // POST /auth/logout + disconnect
}
```

Implementation:

- `useAccount()` for wallet connection state
- `useConnect({ connector: coinbaseWallet(...) })` for connecting
- `useSignMessage()` for SIWE signing
- React state for `sessionAddress` (initialized from `GET /api/auth/me` on mount)
- `login()`: connect → fetch nonce → construct SIWE message → sign → POST verify → set sessionAddress
- `logout()`: POST logout → disconnect → clear sessionAddress

### 1.7 Supabase migration: `auth_nonces` table

```sql
CREATE TABLE auth_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_auth_nonces_expires ON auth_nonces (expires_at);
```

---

## Phase 2: Replace Provider Stack

### 2.1 Rewrite `src/components/providers/privy-provider.tsx` → `wallet-provider.tsx`

```
WagmiProvider (standard wagmi createConfig)
  └── QueryClientProvider
       └── AuthProvider (context from use-auth)
            └── BaseNetworkGuard
                 └── {children}
```

wagmi config:

- `createConfig` from `wagmi` (not `@privy-io/wagmi`)
- Connector: `coinbaseWallet({ appName: "MARGIN CALL", preference: "smartWalletOnly" })`
- Chains + transports: same as current

### 2.2 Update `src/app/layout.tsx`

- Change import from `PrivyProvider` to `WalletProvider`

---

## Phase 3: Replace Client-Side Privy Usage (14 files)

Mechanical: swap `import { usePrivy } from "@privy-io/react-auth"` → `import { useAuth } from "@/hooks/use-auth"`

| File                                | What it uses from `usePrivy()`        | New usage                      |
| ----------------------------------- | ------------------------------------- | ------------------------------ |
| `src/app/page.tsx`                  | `ready, authenticated, login, logout` | `useAuth()` same destructure   |
| `src/components/nav.tsx`            | `logout`                              | `useAuth()`                    |
| `src/hooks/use-desk.ts`             | `authenticated`                       | `useAuth()`                    |
| `src/hooks/use-traders.ts`          | `user.wallet.address, authenticated`  | `walletAddress, authenticated` |
| `src/hooks/use-portfolio.ts`        | `authenticated`                       | `useAuth()`                    |
| `src/hooks/use-activity-feed.ts`    | `authenticated`                       | `useAuth()`                    |
| `src/hooks/use-usdc-balance.ts`     | `user.wallet.address`                 | `walletAddress`                |
| `src/hooks/use-create-trader.ts`    | `user.wallet.address`                 | `walletAddress`                |
| `src/hooks/use-escrow.ts`           | `user.wallet.address`                 | `walletAddress`                |
| `src/components/wire/wire-feed.tsx` | `authenticated`                       | `useAuth()`                    |
| `src/app/deals/[id]/page.tsx`       | `user.wallet.address`                 | `walletAddress`                |

Also update `src/app/page.tsx` text: "SECURE LINK VIA PRIVY" → "SECURE LINK VIA COINBASE"

---

## Phase 4: Replace `use-base-network.ts`

Rewrite using native wagmi hooks:

- `useAccount()` for `chainId` (replaces `useActiveWallet()` + `useWallets()`)
- `useSwitchChain()` for network switching (replaces `wallet.switchChain()`)
- Same `UseBaseNetworkResult` interface, drop all Privy imports

---

## Phase 5: Simplify `authFetch` (`src/lib/api.ts`)

Replace:

```ts
import { getAccessToken } from "@privy-io/react-auth";
// Bearer token logic
```

With:

```ts
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}
```

---

## Phase 6: Replace Server-Side Auth (25 API routes)

Mechanical: swap `verifyPrivyToken(request)` → `verifySession(request)` in every route.

**Old pattern:**

```ts
const { user } = await verifyPrivyToken(request);
const walletAddress = getPrivyWalletAddress(user);
```

**New pattern:**

```ts
const { walletAddress } = await verifySession(request);
```

Routes (all in `src/app/api/`):

- `desk/register`, `desk/configure`, `desk/approve`, `desk/portfolio`, `desk/activity`, `desk/approvals`, `desk/settings`
- `trader/create`, `trader/list`, `trader/[id]`, `trader/[id]/history`, `trader/[id]/transactions`, `trader/[id]/balance`, `trader/[id]/outcomes`, `trader/[id]/activity`, `trader/[id]/assets`, `trader/[id]/resume`, `trader/[id]/revive`, `trader/[id]/pause`
- `deal/my`, `deal/enter`, `deal/sync`, `deal/list`
- `prompt/suggest`

---

## Phase 7: Cleanup

### Remove packages

```bash
pnpm remove @privy-io/react-auth @privy-io/server-auth @privy-io/wagmi
```

### Add packages

```bash
pnpm add siwe jose
```

### Delete files

- `src/lib/privy/server.ts`
- `src/lib/privy/config.ts` — move chain constants (`PAYMENT_CHAIN`, `BASE_CHAIN_ID`, `isChainIdBase`) to `src/lib/chain.ts`

### Env vars

- Remove: `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`
- Add: `SESSION_SECRET` (256-bit random hex)

### Update tests

- `src/app/api/deal/my/__tests__/route.test.ts` — mock `@/lib/auth/session` instead of `@/lib/privy/server`
- `src/lib/siwa/__tests__/verify-binding.test.ts` — update import if it references `getPrivyWalletAddress`

---

## Critical Technical Notes

1. **EIP-1271 (must not skip):** Smart Wallets are contracts, not EOAs. The `siwe` package's `verify()` must receive a viem `publicClient` as provider to call `isValidSignature` on-chain. Without this, ALL server auth fails.

2. **Smart Wallet creates wallets automatically:** Replaces Privy's `createOnLogin: "users-without-wallets"`. When users connect, they get a passkey-based Smart Wallet via Coinbase's UI — no extra logic needed.

3. **wagmi `coinbaseWallet` connector:** Ships with `wagmi/connectors`. No additional SDK install for the wallet connection itself.

---

## Verification

1. `pnpm build` — confirm no Privy imports remain
2. `pnpm dev` → click CONNECT_WALLET → Coinbase Smart Wallet popup → passkey creation → SIWE sign → dashboard loads
3. Refresh page → session persists via cookie → `GET /api/auth/me` restores state
4. Create a trader → verify API auth works (cookie-based)
5. Check USDC balance displays (wagmi `useReadContract` still works)
6. Click LOGOUT → session cleared, redirected to login
7. `pnpm test` — all tests pass with updated mocks
