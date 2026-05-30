# PRD: Margin Call as a Farcaster Mini App

## Problem Statement

Margin Call is a web-based PvP trading game. Today, the only way to play is to visit the website in a browser, sign in with an email one-time password, get a Privy embedded wallet provisioned, and fund it with test USDC from a faucet. That funnel is high-friction for the audience most likely to enjoy an onchain trading game — people already inside Farcaster clients (Farcaster, the Base App, etc.), who have a wallet and social identity in-app and expect to launch apps with a single tap from their feed.

As the desk manager (player), I want to open and play Margin Call directly inside my Farcaster client — without creating a new account, switching apps, or manually copying a wallet address into a faucet — so that I can go from seeing a cast to running a trading desk in one click, using the wallet I already have.

## Solution

Ship a Farcaster Mini App build of Margin Call that runs the existing app inside Farcaster clients with a native-feeling launch and sign-in, while preserving the existing browser experience unchanged.

From the player's perspective:

- They see Margin Call shared in a Farcaster feed (or find it in a Mini App store) and tap a button to launch it.
- A splash screen shows briefly, then the trading desk loads.
- They are signed in automatically using their Farcaster identity — no email, no OTP, no separate signup.
- The wallet they already use in their Farcaster client becomes their desk wallet. There is no separate embedded wallet to create or fund from scratch.
- They can fund the desk, hire a trader, create deals, and approve trades exactly as they can on the web — using the same mobile single-column layout the site already supports.
- On-chain actions (e.g., funding a deal) are signed by their in-client wallet.

The Mini App and the standard web app share one codebase. Behavior diverges only at three seams: how the app boots (splash dismissal), how the player authenticates, and which wallet signs transactions. Everything server-side (game logic, agent runtime, trader wallets, deal resolution, payments) is unchanged.

## User Stories

### Discovery and launch

1. As a Farcaster user, I want to launch Margin Call from a cast embed, so that I can start playing without leaving my client.
2. As a Farcaster user, I want Margin Call to appear correctly in Mini App discovery surfaces (name, icon, description), so that I can recognize and trust it before launching.
3. As a Farcaster user, I want a branded splash screen while the app loads, so that the launch feels intentional and native rather than like a raw webview.
4. As a Farcaster user, I want the splash to disappear as soon as the desk is ready, so that I am not stuck staring at a loading screen.
5. As a player sharing the game, I want a rich preview image and a clear call-to-action button when I cast the app link, so that my followers are enticed to launch it.

### Authentication

6. As a player opening the app inside a Farcaster client, I want to be signed in automatically with my Farcaster account, so that I do not have to enter an email or one-time password.
7. As a player, I want my Farcaster identity to map to a persistent desk manager record, so that my desk, traders, and history are the same each time I return.
8. As a returning player, I want my session to resume without re-authenticating every launch, so that the experience is fast.
9. As a player on the regular website (not in a Farcaster client), I want to keep signing in by email exactly as before, so that the web experience is unchanged.
10. As a player, I want a clear, graceful error if Farcaster sign-in fails, so that I understand what happened and can retry.

### Wallet and funding

11. As a player in the Mini App, I want my existing in-client Base wallet to be used as my desk wallet, so that I do not have to create or manage another wallet.
12. As a player, I want my desk wallet balance and identity to display the same way they do on web, so that the UI is consistent across surfaces.
13. As a player on testnet, I want guidance to fund my desk wallet with test USDC, so that I can try the game without spending real money.
14. As a player on mainnet, I want funding guidance appropriate to real USDC (not a testnet faucet), so that I am not given irrelevant or misleading instructions.
15. As a player, I want the app to clearly indicate which network it is running on, so that I understand whether I am using test or real funds.

### Gameplay parity

16. As a player, I want to hire traders, configure mandates, create deals, and approve trades inside the Mini App, so that I have the full game, not a stripped-down version.
17. As a player, I want on-chain actions (funding deals, treasury operations) to be signed by my in-client wallet, so that I stay in control of my funds.
18. As a player, I want the dense desktop layout to collapse into a usable single-column mobile view inside the Mini App webview, so that the game is playable on a phone.
19. As a player, I want live activity, the wire, the trading floor, and approvals to work in the Mini App, so that I do not miss any part of the game loop.

### Operability

20. As the product owner, I want the Mini App manifest to be hosted and cryptographically associated with our domain, so that Farcaster clients verify and trust the app.
21. As the product owner, I want the Mini App build to be togglable by network (test vs. real), so that I can demo safely and launch publicly from the same codebase.
22. As a developer, I want the web and Mini App paths to share one codebase with minimal branching, so that maintenance cost stays low.
23. As a developer, I want to preview and validate the Mini App against Farcaster's developer tooling before launch, so that I catch manifest, embed, and sign-in issues early.

## Implementation Decisions

### Surface detection and boot

- The app detects whether it is running inside a Farcaster client at runtime and branches behavior accordingly. The default (browser) path is unchanged.
- When running as a Mini App, the app signals readiness to the host after the desk UI is ready, which dismisses the host splash screen. This is the only required host handshake at boot.
- A dedicated, lightweight bootstrap module owns Mini App context detection and the readiness handshake, so the rest of the app can ask a simple question ("are we in a Mini App?") without knowing host details.

### Manifest and embed

- A signed Mini App manifest is published at the well-known manifest path on the production domain. It includes app identity (name, icon, home URL, splash image/background), the required chain(s), and the host capabilities the app uses (sign-in, wallet provider access).
- The manifest's account association is signed for the production domain so Farcaster clients can verify authorship.
- The home page advertises a Mini App embed (preview image plus a launch button/action) via page metadata, so the app is launchable and shareable from feeds. This sits alongside the existing app-identity metadata already present in the app's root metadata.

### Authentication

- Authentication remains Privy-based. The existing email login is preserved for the web path.
- In the Mini App path, the app uses Privy's Mini App login flow: it requests a nonce, asks the host to produce a Sign-In-With-Farcaster signature, and completes login through Privy. This is automatic on launch when the user is not already authenticated.
- The Farcaster login method is enabled in Privy configuration in addition to email. Automatic embedded-wallet creation is disabled for the Mini App path (the host injects the wallet); embedded-wallet creation remains as-is for the web path.
- The desk manager record continues to be keyed off the authenticated identity, so downstream game state is unaffected by how the user signed in.

### Wallet resolution

- A single "current desk wallet address" concept is introduced that resolves differently by surface: the Privy embedded wallet on web, and the host-injected Base wallet inside the Mini App.
- Desk manager wallet upsert continues to use whatever address that resolver returns, so persistence and the rest of the app remain unchanged.

### On-chain writes

- The contract-write capability is unified behind one interface with two implementations: the existing Privy sponsored-transaction path for the web/embedded wallet, and a host-injected-wallet path (via the standard wallet connector) for the Mini App.
- Gas sponsorship applies only to the embedded-wallet path. In the Mini App, the user's in-client wallet pays gas. Call sites do not need to know which implementation is active.

### Network configuration

- The payment chain becomes environment-configurable so the same codebase can target the test network or the real network.
- Network-dependent UI (notably funding guidance) reads the configured network: the faucet path is shown only on the test network; real-funding guidance is shown otherwise.
- The manifest's required chain reflects the configured network for a given deployment.

### Scope of change

- Server-side systems are explicitly unchanged: backend game logic, agent scheduler/runtime, trader identity wallets, operator signing, deal resolution, and payment settlement.
- The web experience is preserved end-to-end; Mini App code activates only inside a Farcaster client.

## Testing Decisions

### What makes a good test here

- Tests should assert externally observable behavior at the decision seams (which boot path, which login path, which wallet/address is chosen, which network is configured), not the internal wiring of host SDK calls.
- Surface-dependent logic should be exercised by simulating "in Mini App" vs. "in browser" inputs and asserting the chosen branch and outputs, rather than mocking deep host internals.

### Modules to test

- The surface-detection / wallet-resolution logic: given a Mini App context with an injected wallet vs. a browser context with an embedded wallet, the resolver returns the correct desk wallet address (mirrors the existing pure-function approach used for embedded wallet address selection).
- The network configuration resolver: given each network env value, it yields the correct chain and the correct funding-UI mode; invalid/missing values fall back safely.
- The contract-write selector: given each surface, it selects the correct write implementation and forwards arguments unchanged.

### Prior art

- Existing pure-logic unit tests already cover wallet/address and chain-id helpers (e.g., the Privy chain-id tests and SIWA binding verification tests). New tests should follow that same isolated, input/output style.
- Manifest, embed rendering, and live host sign-in are validated manually against Farcaster's developer Mini App preview tooling over a public tunnel, since `localhost` is not supported by that tooling. This manual validation covers manifest resolution, splash dismissal, auto sign-in, and a deal-funding transaction signed by the injected wallet.

## Out of Scope

- Push notifications / re-engagement via the Mini App webhook (can be a fast follow once the core experience ships).
- Mini App store optimization beyond the basic manifest metadata (categories, screenshots, hero imagery, taglines).
- Any redesign of the game UI; this PRD reuses the existing responsive mobile layout as-is.
- Changes to game economics, agent behavior, deal resolution, or trader wallet management.
- A native mobile app or any non-Farcaster embedding surface.
- Cross-wallet migration tooling (e.g., moving balances from a web embedded wallet to a Farcaster-injected wallet for the same user).

## Further Notes

- The biggest behavioral consequence of using the host-injected wallet is the loss of Privy gas sponsorship inside the Mini App; the user's Base wallet pays gas. On Base this is negligible, but it should be acknowledged in funding/UX copy.
- Development and validation require a public tunnel (e.g., ngrok or Cloudflare Tunnel) because Farcaster's Mini App preview tools cannot reach `localhost`.
- The effort estimate is roughly 1-2 focused days: the shell (SDK readiness, manifest, embed) is a few hours; the auth/wallet branching and the injected-wallet write path are the bulk of the work.
- A companion implementation plan with concrete file references exists separately; this PRD intentionally avoids file paths and code so it stays durable as the codebase evolves.
