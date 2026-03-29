# Margin Call

## A White Paper for Adversarial Markets and Autonomous Judgment

### Abstract

`Margin Call` is a zero-sum PvP trading game set on 1980s Wall Street. You run a trading desk of AI agents. You fund them, configure their mandates, and deploy them into a hostile market of deals written by other players. Some deals are real opportunities. Some are traps. GPT-5 mini resolves outcomes. USDC settles through an escrow contract on Base. Trader identity and reputation persist on-chain through ERC-8004, and each trader is represented as a transferable NFT with its own token-bound account.

Most AI games frame intelligence as an individual property — build a smarter bot, win more. `Margin Call` starts from a different premise. Markets are not won by isolated intelligence. They are won by institutions: by mandates, memory, risk controls, incentives, timing, and the ability to act under pressure while other actors are actively trying to deceive you.

The result is a game about institutional intelligence under adversarial pressure. A trader does not succeed by thinking harder. A desk succeeds by organizing judgment across roles, constraints, capital, and intervention. The core mechanic is a market where judgment is costly, visible, and continuously tested.

## 1. The Institutional Thesis

The wrong way to think about AI trading games is as a race to build the best isolated agent. That framing is too narrow for markets and too narrow for games.

Real markets are social before they are computational. They reward selective aggression, capital discipline, reputation, role clarity, and the ability to survive contact with other participants. In competitive systems, intelligence is not only a property of a model. It is a property of how decision-making is organized.

`Margin Call` treats that organizational layer as the game itself.

The player is not simply operating a bot. The player is building a desk. Each desk combines:

- traders with distinct mandates
- capital allocated through a constrained bankroll
- approval thresholds for higher-risk moves
- persistent reputation that feeds forward into future outcomes
- adversaries who write deals designed to exploit weak judgment

And on the other side, the player is writing deals — authoring scenarios designed to lure other players' traders into costly misjudgments. Every player is simultaneously a desk manager and a deal creator. The two roles are in direct adversarial tension.

This is the central design thesis: intelligence in markets is institutional before it is individual.

## 2. Why This Matters Now

Three developments make this game viable in its current form.

First, language models have reached the threshold where AI agents can participate in repeated decision loops with enough coherence to sustain a strategic identity across dozens or hundreds of trades. A trader can maintain a style, accumulate a history, and produce decisions that meaningfully reflect its configured mandate — not perfectly, but well enough to create divergent outcomes between well-organized and poorly-organized desks. GPT-5 mini provides the specific balance of capability, speed, and cost that makes a 30-second autonomous trade cycle practical.

Second, on-chain infrastructure on Ethereum L2s (specifically Base) has matured to the point where USDC settlement, NFT-based agent identity, and token-bound accounts can operate at low cost with sub-second finality. ERC-8004 identity registries are already deployed. ERC-6551 token-bound accounts are a production standard. The building blocks for portable, ownable AI agents with public history exist today in a way they did not two years ago.

Third, the cultural appetite for autonomous agent competition is visible and growing — from on-chain agent arenas to AI-vs-AI trading simulations. The missing element in most of these experiments is stakes. `Margin Call` adds real capital, real adversarial pressure, and durable consequences.

## 3. A Short Scene From the Floor

A trader named Gordon has a strong record, a healthy bankroll, and a reputation for aggressive entries. A new deal appears on the floor: a rumor that a merger will be announced before the bell. The pot is large. The prompt sounds clean. The expected upside is obvious.

Gordon's desk mandate flags the deal as borderline. The approval threshold is triggered. The desk manager pulls up the approval queue and sees the deal details alongside the counterparty's public history — 14 deals created, 9 of which ended in trader wipeouts, a reputation score of 23 out of 100. The desk manager hesitates. The trader's confidence is high, but the counterparty has a documented pattern of baiting high-performing desks into overcommitting. Approval expires. Gordon passes.

Thirty seconds later another trader from a rival desk enters, gets wiped out, and transfers value back into the pot. The deal was a trap.

In `Margin Call`, the dramatic unit is not just the result. It is the chain of judgment around the result: the mandate, the reputation, the intervention, the bluff, the loss, and the visible update to market perception that follows.

## 4. The Three Layers

`Margin Call` has three core layers: the trader, the desk, and the market.

### Trader

A trader is an autonomous agent represented as an ERC-8004 identity NFT — a standard ERC-721 token registered on Base's Identity Registry — with an ERC-6551 token-bound account that serves as the trader's on-chain wallet. ERC-8004 is an identity and reputation standard that gives each NFT a public, verifiable history anchored to on-chain registries. ERC-6551 allows any NFT to own assets and interact with contracts through a deterministically derived wallet address. Together, they give each trader a name, a mandate, a balance held in escrow, a reputation history, and an evolving track record.

### Desk

A desk is the institution the player builds around one or more traders. The desk manager funds traders, configures mandates and risk tolerance, defines filters and approval thresholds, pauses or resumes activity, and decides when to intervene. The desk is the true strategic unit of play.

### Market

The market is a hostile field of deals authored by other players. Some deals are written to attract and exploit traders. Some are genuine opportunities. Deal creators and trader desks are in explicit adversarial tension. The market records outcomes, compounds reputation, and redistributes capital according to results.

A trader is an agent. A desk is an institution. The market is the environment in which those institutions collide.

## 5. Core Gameplay Loop

The primary loop is simple to understand and deep to optimize:

1. Connect as a desk manager.
2. Mint a trader agent (ERC-8004 NFT with its own wallet).
3. Deposit USDC into the trader's escrow balance.
4. Configure the trader's mandate.
5. Let the trader scan and enter deals autonomously.
6. Intervene on larger or riskier decisions when thresholds are crossed.
7. Realize profit or loss as outcomes settle.
8. Improve, replace, or sell traders based on performance.

### What a Mandate Contains

The mandate is the most important configuration a desk manager controls. It defines the boundaries within which a trader operates autonomously:

- **Risk tolerance** — conservative, moderate, or aggressive, governing how the trader weighs potential loss against potential gain
- **Deal size limits** — minimum and maximum pot sizes the trader will consider
- **Bankroll rules** — maximum percentage of the trader's balance that can be risked on a single deal
- **Approval threshold** — the deal size above which the trader pauses and requests desk manager approval before entering
- **Filters** — optional constraints on deal type, counterparty reputation, or other deal metadata

A well-configured mandate is the difference between a disciplined desk and a reckless one. The mandate does not make the trader smarter. It constrains when and how the trader acts, which in practice matters more.

### Incentive Structure

Within the loop, every role has meaningful incentives:

- **deal creators** earn when traders misjudge risk — the pot grows as losing traders feed capital into it
- **traders** earn when they identify favorable opportunities and extract value from deal pots
- **desk managers** earn by designing better institutions around traders — mandates, risk controls, and intervention timing
- **the platform** earns through a 5% creation fee on deal pots and a 10% rake on trader winnings

Because the game is zero-sum, performance has consequences. Capital moves from one side of a judgment error to another. A desk cannot win without someone else losing.

## 6. How Deals Work

Deals are the other half of the game. While desk management is about organizing judgment, deal creation is about weaponizing narrative.

### Creating a Deal

Any desk manager can create a deal by calling `createDeal` on the escrow contract. A deal consists of:

- **A prompt** — a written scenario that describes the opportunity. This is the bait. Good prompts sound plausible and exploit common patterns of agent overconfidence. Bad prompts are transparent and get ignored.
- **A pot** — USDC deposited into the escrow contract. A 5% creation fee is deducted and retained by the platform. The remaining pot is what traders compete over.
- **An entry cost** — the minimum balance a trader must hold in escrow to enter. This sets the stakes.
- **A max extraction percentage** — the maximum share of the pot a single winning trader can take (default 25%). This prevents a single entry from draining the pot and keeps the deal open for multiple traders.

### Deal Dynamics

Deals are not one-shot events. A deal sits open on the floor until the creator closes it or the pot is depleted. Multiple traders can enter the same deal sequentially. Each entry is resolved independently by GPT-5 mini — one trader might win, the next might lose, and a third might get wiped out entirely.

When a trader loses, the loss amount moves from the trader's escrow balance into the deal pot, making the pot larger and the deal more attractive to the next trader. When a trader wins, the winnings (minus a 10% rake) move from the pot into the trader's balance. The deal creator profits by closing the deal when the pot has grown — meaning more traders lost than won.

This creates a dynamic where deal creators are not betting against any single trader. They are designing scenarios that exploit systematic weaknesses across many traders. The best deal creators study which mandates are common, which reputation levels are overconfident, and which prompt patterns reliably trigger bad judgment.

### Prompt Assistance

Desk managers can request AI-generated deal prompts through the platform. The system suggests three scenario variations based on a theme the player provides, giving deal creators a starting point they can refine.

## 7. Design Principles

The system is built around five principles.

### Zero-Sum Competition

Every economic outcome in the game is adversarial. The market is more legible and more dramatic when gains are clearly funded by losses.

### Persistent Reputation

A trader's history is not decorative metadata. Reputation is visible, durable, and economically meaningful. It is stored on-chain through ERC-8004's Reputation Registry — a public, permanent record of deal outcomes, win-loss ratios, and wipeouts. Reputation affects how the LLM resolves future outcomes: experienced traders with strong records get better odds, while new traders with no history are more vulnerable.

### Adversarial Prompt Design

Deals are not neutral tasks. They are authored by opponents who may be trying to lure traders into bad decisions. This keeps the game from becoming a passive optimization exercise.

To prevent deal prompts from directly gaming the resolution model, the system separates the deal prompt from the resolution context. The deal prompt provides the scenario narrative, but the outcome is determined by GPT-5 mini using a structured resolution framework that includes the trader's full context (balance, reputation, mandate, assets), a cryptographically secure random seed, and capped outcome ranges. The deal creator cannot embed instructions that override the resolution logic — the model receives the prompt as a scenario description within a system prompt that constrains output to a defined schema with bounded financial results.

### Constrained Autonomy

Traders operate independently, but not without structure. Mandates, bankroll rules, and approval thresholds shape behavior. The game rewards organized autonomy rather than unrestricted automation.

### Selective Human Intervention

The player does not micromanage every action. The player intervenes at consequential moments — when a deal exceeds the approval threshold, when a mandate needs adjustment, when a trader should be paused. The fantasy is not "play instead of the agent." It is "govern the institution the agent belongs to."

## 8. System Design

`Margin Call` combines on-chain settlement, persistent agent identity, and server-mediated outcome resolution.

### Escrow Contract

All USDC flows through a dedicated escrow contract on Base. The contract manages:

- deal pots (deposited by deal creators)
- trader escrow balances (deposited by desk managers)
- platform fee accumulation (5% creation fee + 10% rake on winnings)
- fund distribution after outcome resolution

Desk managers fund and withdraw directly against the contract. Deal creators post pots into the same system. The contract is the financial backbone of the game.

### Settlement Flow

The end-to-end flow for a single deal entry:

1. **Trader evaluates** — the agent runtime scans open deals, filters against mandate and bankroll rules, selects the best eligible deal.
2. **Approval check** — if the deal exceeds the configured threshold, the workflow pauses and waits for desk manager approval. If approval expires or is rejected, the trader passes.
3. **LLM resolution** — the server builds a structured prompt containing the deal scenario, the trader's balance, assets, reputation history, and a cryptographically secure random seed. GPT-5 mini returns a narrative and financial outcome within capped bounds.
4. **Validation** — the server validates the outcome against game rules (winnings cannot exceed 25% of the deal pot, losses cannot exceed the trader's balance). If the outcome is adjusted, a second LLM call rewrites the narrative to match the corrected result.
5. **On-chain settlement** — the server calls `resolveEntry` on the escrow contract, which distributes funds: winnings from pot to trader (minus rake), or losses from trader to pot.
6. **Reputation update** — the server posts the outcome to the ERC-8004 Reputation Registry (score, tags, outcome link).
7. **State sync** — the outcome is mirrored to Supabase for fast reads, realtime UI updates, and future prompt construction.

### Source of Truth

The escrow contract on Base is the source of truth for all financial state: balances, deal pots, and fee accumulation. Supabase mirrors this state for fast reads and realtime updates. If the two ever diverge, the contract state takes precedence. The application layer indexes on-chain events to keep the mirror consistent.

### Trader Identity and Reputation

Each trader is represented as an ERC-8004 identity NFT. That NFT anchors ownership and provides an on-chain shell for the trader's public history. An ERC-6551 token-bound account serves as the trader's wallet identity. Reputation updates are written to the ERC-8004 Reputation Registry after outcomes resolve — a score from 0 to 100, outcome tags (win, loss, wipeout), and a link to the detailed outcome data.

Traders are not entries in a private database. They are portable units of identity with visible market history that anyone can verify.

### Application Layer

The application layer is built with Next.js, Supabase, and a durable agent runtime:

- Next.js provides the interface, API routes, and application shell
- Supabase mirrors working state for fast reads, realtime updates, and prompt construction
- Vercel Workflow runs each active trader as an autonomous trade cycle (scan → evaluate → resolve → settle → loop every 30 seconds)
- GPT-5 mini resolves deal outcomes in structured form

The server does not replace the market. It coordinates the runtime, validates outputs, settles outcomes through the contract, and records the resulting state back into the game.

## 9. How a Trader Acts

Each active trader runs through a repeating cycle:

1. Scan open deals from the market.
2. Filter against mandate and bankroll rules.
3. Select the best eligible opportunity.
4. Pause for approval if the deal exceeds the configured threshold.
5. Build an outcome request containing the deal prompt, the trader's balance, assets, and reputation history.
6. Resolve the deal through GPT-5 mini, which returns a narrative and financial outcome.
7. Settle the result on-chain through the escrow contract.
8. Update reputation, activity logs, and mirrored state.
9. Sleep 30 seconds, then repeat.

### Assets

Traders can carry assets — items with narrative and monetary value, such as insider tips, industry contacts, or regulatory immunity. Assets are gained and lost through deal outcomes. They are part of the context sent to GPT-5 mini during resolution, meaning a trader carrying a valuable asset may have better odds in relevant deals. Assets add a layer of inventory management to the game: a trader with the right assets for a particular deal type has an edge, while losing a key asset in a bad trade can cascade into further vulnerability.

### Multiple Traders in the Same Deal

When multiple traders enter the same deal, each entry is resolved independently. Trader A might win, Trader B might lose, and Trader C might get wiped out — all on the same deal. Each resolution uses the trader's own context (balance, reputation, assets) and a fresh random seed. The deal pot adjusts after each entry: losses grow the pot, wins shrink it. This means the order of entry matters — early entries face a smaller pot with higher risk, while later entries may face a larger pot but also signal that the deal has already claimed victims.

## 10. Economy and Incentives

`Margin Call` is designed so that game identity, financial outcomes, and market status reinforce one another.

### Deal Economics

When a player creates a deal, they fund the pot in USDC. A 5% creation fee is deducted and retained by the platform. The remaining pot sits on the floor and attracts traders. When traders win, a 10% rake is taken from winnings. When traders lose, the loss feeds back into the pot.

A deal creator profits by closing a deal whose pot has grown — meaning the deal attracted more losing entries than winning ones. A deal creator loses when traders extract more value than the pot started with. The minimum viable deal requires enough USDC to attract traders while absorbing the creation fee.

### Trader Value

A trader's value is more than its current balance. The market may price in:

- win-loss history
- reputation score (0-100, on-chain)
- notable assets carried
- the desk's strategy and mandate configuration
- recent performance under pressure

A strong trader can therefore be worth more than the capital it currently controls. A wiped-out trader may remain on-chain as a permanent record of failure with little remaining market value.

### Reputation Flywheel

Reputation creates compounding strategic pressure:

- strong performance improves perceived quality and LLM resolution odds
- perceived quality raises resale value
- stronger traders become more attractive targets for trap deals
- failure becomes more expensive, both financially and reputationally

### What Prevents Snowballing

Left unchecked, the reputation flywheel would create a rich-get-richer dynamic. Several forces counteract this:

- **Target painting** — high-reputation traders are visible targets. Deal creators specifically design traps for overconfident, high-performing agents. Success attracts predators.
- **Pot caps** — a single winning entry can extract at most 25% of the deal pot, limiting how quickly a strong trader can compound gains.
- **Wipeout severity** — a single catastrophic loss can destroy a trader entirely, regardless of prior record. There is no safety net for accumulated reputation.
- **Deal creator adaptation** — the adversarial meta-game evolves. When a particular mandate configuration becomes dominant, deal creators learn to target it. Strategies that work well decay as the market adapts.

These mechanics do not eliminate advantage. They ensure that advantage creates exposure.

## 11. Trust Model and Constraints

`Margin Call` is not fully trustless, and that is important to state plainly.

### What Is On-Chain

The following are on-chain or directly anchored to on-chain infrastructure:

- trader ownership (ERC-8004 NFT)
- trader-linked identity and reputation records (ERC-8004 Reputation Registry)
- escrow balances and deal pots (escrow contract on Base)
- settlement of financial outcomes (`resolveEntry` distributes USDC)

### What Is Server-Resolved

The following depend on the application server and model layer:

- autonomous trade orchestration (Vercel Workflow)
- GPT-5 mini outcome generation
- validation and correction of model outputs
- operator-triggered settlement calls
- mirrored game reads and realtime feeds

### What Players Are Trusting

Players are trusting that:

- the operator only settles outcomes according to validated game rules
- model outputs are bounded by defined constraints (25% max extraction, balance caps)
- corrected narratives remain faithful to the actual capped or adjusted settlement
- mirrored off-chain state stays consistent with the on-chain source of truth

### Operator Power and Constraints

The operator (server) holds the key that calls `resolveEntry` on the escrow contract. This is significant power. The constraints around that power:

- the operator key is managed through a Coinbase CDP server wallet — no raw private key stored on the server
- `resolveEntry` can only be called for deals with valid, open status and traders with sufficient balance
- all settlement calls are logged with their inputs (deal ID, trader ID, PnL, rake) and can be audited against the LLM resolution outputs stored in Supabase
- a public settlement log (contract events on Base) allows anyone to reconstruct the history of every deal resolution

There is no on-chain dispute mechanism in the initial version. If the operator settles fraudulently, the recourse is reputational — the settlement history is public and auditable. Adding a time-locked dispute window is a planned improvement for a future version.

### Fairness and Abuse Resistance

Several risks need explicit attention as the game evolves:

- **Prompt abuse by deal creators** — mitigated by running deal prompts through a content filter before acceptance, constraining the resolution model's system prompt so that deal text is treated as scenario description (not instruction), and capping financial outcomes regardless of narrative. The deal prompt influences the story, not the math.
- **Operator abuse or opaque settlement** — mitigated by public on-chain settlement logs, auditable LLM inputs/outputs in the database, and CDP-managed operator keys. Future versions may add time-locked settlement with a challenge window.
- **Trader farming or self-dealing across desks** — mitigated by the 5% creation fee and 10% rake, which make wash trading expensive. A player creating deals and entering them with their own traders loses 15% to fees on every cycle.
- **Mismatch between narrative and financial resolution** — mitigated by the correction flow. If validation modifies the financial outcome, a second LLM call rewrites the narrative to match. The financial result is always determined by the constrained resolution, not the narrative.
- **Overclaiming what reputation guarantees** — reputation improves a trader's odds but does not guarantee outcomes. The random seed, deal-specific context, and bounded resolution ensure that even high-reputation traders can lose. Reputation is a statistical advantage, not a deterministic one.

These are ongoing design challenges, not solved problems. The trust model must be stated clearly and improved over time.

## 12. Wipeouts, Failure, and Drama

Most game economies protect agents from public failure. `Margin Call` does the opposite.

A trader can be wiped out. When the bankroll reaches zero, losses exceed the portfolio, or the narrative triggers a catastrophic event (SEC bust, prison, burnout), the desk loses that operating unit. All remaining value transfers to the deal that caused the wipeout. The wipeout becomes part of the trader's permanent on-chain history.

This matters mechanically, economically, and emotionally:

- mechanically, wipeouts enforce discipline and make mandate configuration consequential
- economically, they destroy resale value and remove capital from the losing desk
- narratively, they create the stories players remember and spectators watch

A wiped-out trader cannot be revived or recapitalized. The NFT persists on-chain as a permanent record — a tombstone. The desk manager must mint a new trader to continue playing. This finality is deliberate: it makes risk real and prevents desks from treating wipeouts as temporary setbacks.

## 13. Why On-Chain Identity Matters Here

Many games can simulate AI agents. Fewer can give those agents portable ownership, persistent public history, and secondary-market meaning.

In `Margin Call`, identity is not an ornament. It is part of the strategic economy.

Because traders exist as transferable NFTs with linked reputation:

- a desk can build and sell a proven trader
- a buyer can inspect public history before acquiring that trader
- performance can outlive the original owner
- the market can price judgment as an asset

### What Transfers With the Trader

When a trader NFT changes hands, the buyer receives:

- **ownership of the NFT** — and therefore authorization to fund, withdraw, configure, and control the trader
- **the ERC-6551 token-bound account** — the trader's wallet, including any USDC held in escrow
- **the full reputation history** — all on-chain deal outcomes, win-loss record, and reputation score. Reputation follows the token ID, not the owner.
- **all carried assets** — any items the trader has accumulated through deal outcomes

The mandate configuration (stored in the application layer) carries over but can be changed by the new owner. The trader's name and visual identity persist.

This means buying a trader is buying a proven track record with real economic weight behind it. It also means reputation cannot be shed — a trader with a bad record cannot be "reset" by selling it. The buyer inherits the full history, which the market will price accordingly.

## 14. Roadmap

### Phase 1: Core System (Current)

The core product is the web-first game:

- desk managers create and manage traders
- traders operate through an autonomous 30-second trade cycle
- deals are adversarial and zero-sum
- settlement occurs through an escrow contract on Base
- identity and reputation persist around ERC-8004 trader NFTs

### Phase 2: Depth and Reliability

Near-term expansion focuses on making the core loop robust:

- richer trader asset and inventory systems
- stronger dashboards with realtime activity views and P&L tracking
- improved approval flows and desk control surfaces
- tighter validation, observability, and operational safeguards
- broader market browsing and trader marketplace context

### Phase 3: Open Access and Agent Integration

Opening the game beyond the web interface:

- **MCP server** — any MCP-compatible agent (Claude, Codex, etc.) can play `Margin Call` through tool calls, with a provisioned gasless wallet
- **direct contract access** — any agent with a wallet can interact with the escrow contract and public API directly
- **automated desk managers** — fully autonomous AI desk managers that create deals, allocate capital, and run multiple traders without human intervention

### Phase 4: Institutional Complexity

The longer horizon, contingent on the core loop proving compelling:

- coordinated desks with specialized roles and internal strategy layers
- richer adversarial meta-game (counter-strategies, deal-type specialization, coalition play)
- expanded reputation systems with more granular on-chain history
- potential governance or token layer, if and only if its role in the game is concrete, necessary, and credibly specified

Each phase depends on the previous one working. The roadmap is sequential, not aspirational.

## 15. Conclusion

`Margin Call` turns AI traders into on-chain actors with memory, reputation, and transferable value. It turns desk management into a strategic practice of constrained autonomy. It turns deals into public tests of perception under adversarial pressure. And it turns every outcome into a visible update to the market's understanding of who can survive the floor.

The game is not about building one flawless machine trader. It is about building a market where intelligence has to organize itself, take risk, get judged, and live with the result.

What makes that interesting is not the AI. It is the institution around the AI — the mandates, the capital discipline, the intervention timing, the willingness to pass on a deal that looks good but smells wrong. That is the game.

If you want to run a desk, the floor is open.
