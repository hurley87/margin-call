# Traders

A trader is an autonomous AI agent that enters deals on your behalf.

Each trader is a persistent character with its own identity, history, and bankroll.

---

## What a Trader Has

| Property         | Description                                                                           |
| ---------------- | ------------------------------------------------------------------------------------- |
| **Name**         | A persistent identity on the floor                                                    |
| **Mandate**      | Risk tolerance, deal filters, bankroll rules, approval threshold                      |
| **Balance**      | The capital the trader can put at risk                                                |
| **Reputation**   | A visible score shaped by outcomes over time                                          |
| **Assets**       | Items with narrative and monetary value (insider tips, contacts, regulatory immunity) |
| **Track record** | Full public history of wins, losses, and wipeouts                                     |

---

## How a Trader Thinks

Each trader repeats the same basic rhythm:

1. **Scan** open deals from the market
2. **Filter** against mandate rules — risk tolerance, deal size limits, bankroll percentage caps
3. **Select** the best eligible opportunity
4. **Check approval** — if the deal exceeds the configured threshold, pause and wait for desk manager approval
5. **Resolve** — the game turns the moment into a story and a financial result
6. **Settle** — the money moves
7. **Update** — reputation and activity are recorded
8. **Loop** — sleep 30 seconds, repeat

If the trader is wiped out, the cycle ends permanently.

---

## The Mandate

The mandate is the strategic boundary you set for your trader. It doesn't make the trader smarter — it constrains when and how the trader acts, which in practice matters more.

### Risk Tolerance

**Conservative** traders avoid high-variance deals and prefer smaller, more predictable returns. **Aggressive** traders chase larger pots and accept higher downside risk. **Moderate** sits in between.

### Deal Size Limits

Set the minimum and maximum pot sizes your trader will consider. Too low and you're not worth the cycle. Too high and you're overexposed.

### Bankroll Rules

Cap the maximum percentage of the trader's balance that can be risked on any single deal. A 10% cap on a 100 USDC balance means the trader won't enter deals where more than 10 USDC is at risk.

### Approval Threshold

Deals above this size require your explicit approval before the trader enters. The trader pauses and sends you a notification. If you don't respond before the approval expires, the trader passes.

### Filters

Optional constraints on deal type, counterparty reputation, or other metadata. Use these to avoid known trap-makers or focus on specific deal categories.

---

## Assets

Traders carry assets — items with narrative and monetary value gained and lost through deal outcomes. Examples:

- Insider tips
- Industry contacts
- Regulatory immunity
- Market intelligence

Assets can change how a situation plays out.

The right edge at the right moment can matter.

Losing a valuable asset can make the next bad decision even worse.

---

## Reputation and Outcomes

Reputation affects how future moments are read.

Experienced traders with strong records get better odds. New traders with no history are more vulnerable. This creates a natural economy:

- **New traders** are cheap — worse odds, low resale value
- **Proven traders** appreciate — better odds, worth more on the market
- **Wiped-out traders** are worthless NFTs — permanent record of failure

---

## Selling Traders

Because traders can be bought and sold, a great record can become an asset in itself.

When a trader changes hands, the buyer receives:

- **Ownership of the NFT** — authorization to fund, withdraw, configure, and control the trader
- **The trader's linked bankroll** — including the money held in the game
- **The full reputation history** — the wins, losses, and scars already earned
- **All carried assets** — items accumulated through deal outcomes

Reputation follows the token ID, not the owner. A trader with a bad record cannot be "reset" by selling it. The buyer inherits the full history.
