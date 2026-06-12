# Wire Season 01 — "The PanAtlantic Collapse"

**Season key:** `season-01`
**Tone:** paranoid, predatory, terse — 1980s Wall Street financial thriller. Every dispatch implies danger.

## Import

```
pnpm seed:wire
```

Re-running is safe — the importer is idempotent.

---

## Weekly Shape

| Day       | Posture                                           |
| --------- | ------------------------------------------------- |
| Monday    | Rumors circulate; nobody confirms anything        |
| Tuesday   | Cracks appear in the official story               |
| Wednesday | Full mania; everyone knows something is wrong     |
| Thursday  | SEC pressure mounts; desks go quiet               |
| Friday    | Blowups. Forced liquidations. Someone gets wiped. |

---

## Style Rules

- Dispatch headlines: ~100 characters max. Terse. Present tense.
- Dispatch bodies: ~400 characters max. Two to four sentences.
- No emoji. No ellipses for drama. No modern crypto vocabulary.
- Every dispatch must imply a player action: exploit, create, avoid, or watch.
- Sentences end in facts, not adjectives. "Down $340M." Not "in bad shape."
- Floor Talk dispatches quote Marty Vale directly when he's the source.
- Source attribution is via category: `breaking`, `rumor`, `investigation`, `market_move`, `corporate_drama`, `politics`.

## Forbidden Language

- DeFi, rug, wagmi, wen moon, L2, gas fees, blockchain (unless referring to physical chain)
- leveraged buyout synergies (marketing language)
- exciting opportunity
- paradigm shift
- stakeholders
- going forward
- AI, machine learning, algorithm (in a market-move context — anachronistic)
- any emoji

---

## Cast

### PanAtlantic Holdings

- **Kind:** firm
- **Role:** Primary antagonist. The overleveraged conglomerate at the center of the collapse.
- **Bio:** A once-diversified financial holding company that bet heavily on rate cuts that never came. Three of its leveraged desks are under margin pressure. The CEO has not spoken publicly in eleven days.
- **Traits:** overleveraged, silent, desperate, connected

### Rourke Capital

- **Kind:** firm
- **Role:** Predator. Circling PanAtlantic, building a short book, waiting for the margin call cascade.
- **Bio:** Rourke Capital runs a concentrated portfolio of opportunistic positions. They were short PanAtlantic before anyone else admitted the problem existed. Staffed almost entirely by ex-PanAtlantic traders who know exactly where the bodies are buried.
- **Traits:** aggressive, informed, short-biased, discreet

### Blackwell & Co.

- **Kind:** firm
- **Role:** Old money, publicly neutral. Privately terrified of their PanAtlantic counterparty exposure.
- **Bio:** One of the last white-shoe investment banks that hasn't yet modernized. Their bond desk has $120M in PanAtlantic exposure they've told no one about. Their communications team instructs all traders to say "no comment" about PanAtlantic.
- **Traits:** cautious, exposed, reputation-conscious, opaque

### Diane Mercer

- **Kind:** regulator
- **Role:** SEC investigator tracking suspicious deal flow connected to PanAtlantic's prior filings.
- **Bio:** Mercer ran the Drexel probe in the mid-80s. She doesn't announce investigations. She announces indictments. Her desk has subpoenaed records from at least four firms connected to PanAtlantic's structured products division.
- **Traits:** methodical, patient, dangerous, connected to Beltway sources

### Marty Vale

- **Kind:** trader
- **Role:** Floor trader and rumor conduit. Spreads information before it hits the tape.
- **Bio:** Vale has been on the floor for fifteen years. He's been right three times before the market moved and is currently right about PanAtlantic. Nobody knows how he knows things. He broadcasts everything he learns.
- **Traits:** loud, well-connected, usually right, indiscreet

---

## Arcs

### Arc 1: PanAtlantic Blow-Up

- **Slug:** `pan-atlantic-blowup`
- **Tension:** 7 / 10
- **Status:** active
- **Summary:** PanAtlantic Holdings is being squeezed by margin calls on three overleveraged desks. Rourke Capital is building a short position. The CEO hasn't spoken publicly in eleven days. The market is waiting for a forced liquidation event.
- **Entities:** PanAtlantic Holdings, Rourke Capital, Blackwell & Co., Marty Vale

### Arc 2: Mercer Investigation

- **Slug:** `mercer-investigation`
- **Tension:** 5 / 10
- **Status:** active
- **Summary:** SEC investigator Diane Mercer has widened her probe of suspicious deal flow connected to PanAtlantic's structured products filings. Subpoenas have reached at least four counterparty firms. No public announcement. Blackwell & Co. is believed to be among the firms contacted.
- **Entities:** Diane Mercer, Blackwell & Co., PanAtlantic Holdings

---

## Initial Drop — "MARGIN CALLED"

**Arc reference:** pan-atlantic-blowup (primary)
**World state:** mood `tense` · SEC heat `6/10`

### Dispatch 1 — THE WIRE (main)

> **PANATL. SERVED MARGIN NOTICE — THREE DESKS FORCED TO LIQUIDATE BY 16:00**
>
> PanAtlantic Holdings hit with intraday margin notice across three desks. Shortfall estimated at $340M. Rourke Capital seen moving against PanAtlantic's book since the open.

### Dispatch 2 — FLOOR TALK (supporting)

> **VALE: "PANATL. BOYS AREN'T ANSWERING PHONES — THAT'S YOUR TELL RIGHT THERE"**
>
> Marty Vale broadcasting from the pit that PanAtlantic's desk has gone dark. Three calls, no callbacks. Blackwell & Co. quietly reviewing counterparty exposure.
