# Margin Call — Marketing Plan

**Phase:** Slow-burn lore drip + private playtests  
**Start:** Monday, June 1, 2026  
**Platform:** X (Twitter)  
**Reveal style:** Blended — mostly atmosphere, clear a game is coming  
**Public launch:** None in this phase

---

## Summary

Run two tracks in parallel with **no public launch date**:

| Track                   | Audience               | Goal                                                                                                              |
| ----------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Public (X)**          | Cold + warm followers  | Build a cinematic 1980s Wall Street world; seed traders/desks as lore; grow an audience that asks “what is this?” |
| **Private (playtests)** | ~10 friends on testnet | Structured feedback rounds; refine mechanics before any opening                                                   |

The public account warms demand. Playtests gate quality. Best playtest moments (with permission) become lore source material.

**Reference aesthetic:** [@wallstreetmemoir](https://www.instagram.com/wallstreetmemoir/) — cinematic excess, memoir voice, no hard sell. Adapted to X (tighter copy, fewer posts). Visual direction also in workspace `assets/` screenshots.

**Related docs:** [wall-street-agent-game.md](./wall-street-agent-game.md) · [margin-call-white-paper.md](./margin-call-white-paper.md) · [growth.md](./growth.md) (Base ecosystem distribution targets)

---

## Principles

1. **No launch, no waitlist push, no paid ads** in this phase.
2. **Never break the narrator voice** with hype CTAs; scarcity and mood are the strategy.
3. **Opening is gated by playtest quality**, not a calendar date.
4. **Friends are testers, not a marketing army** — harvest moments with permission; anonymize by default.
5. **Be honest about testnet** in private channels; public posts stay in-world (blended reveal).

---

## Track 1 — Public (X)

### Account setup (Sat/Sun before June 1)

| Item             | Recommendation                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| **Handle**       | `@margincall` or closest (`@margincallgame`, `@margincall_`)                                        |
| **Display name** | `Margin Call`                                                                                       |
| **Bio**          | `Memoirs from the floor. 1980s Wall Street, run by AI traders. A game is coming. Quietly building.` |
| **Avatar**       | Film-grade Wall Street portrait or floor scene (warm grain)                                         |
| **Banner**       | Trading floor / penthouse skyline at golden hour                                                    |
| **Pin**          | Week 1 Monday manifesto post (after it ships)                                                       |
| **Link**         | None until Week 4+ soft waitlist; keep bio link empty early                                         |

**Follow / engage (genuine replies only):**

- AI agents, onchain gaming, fin-aesthetic accounts
- Base ecosystem handles in [growth.md](./growth.md) (@base, builder programs, content creator list)
- Your 10 friends (when they opt in publicly)

**Do not use yet:** green-terminal app UI as primary branding — reserve for “behind-the-glass” beats later.

---

### Content pillars

| Pillar                | Share | What it is                                                                        |
| --------------------- | ----- | --------------------------------------------------------------------------------- |
| **Atmosphere / lore** | ~50%  | wallstreetmemoir-style image + narrator caption; the world of the floor           |
| **Characters**        | ~25%  | Named AI traders and rival desks — mandate, style, record; doubles as game roster |
| **Thesis / why**      | ~15%  | Institutional intelligence, adversarial markets (from white paper)                |
| **Behind-the-glass**  | ~10%  | Blurred UI, “desks are live,” real anonymized wipeout — never “sign up now”       |

---

### Cadence

- **3–4 anchor posts/week** (image + 2–4 line caption)
- **1 thread/week** (memoir entry, 4–7 tweets, one image each)
- **2–4 genuine in-niche replies or quote-tweets/week**
- **Weekly image batch** (Sunday): generate 6–8 images in one session for the week ahead

---

### X format (vs Instagram)

| IG (wallstreetmemoir)         | X (Margin Call)                                   |
| ----------------------------- | ------------------------------------------------- |
| Carousel + long essay caption | 1 image + 2–4 tight lines; essay lives in threads |
| Daily or near-daily           | 3–4 posts/week — scarcity fits the tone           |
| Pure lifestyle, no product    | Blended: world first, traders/desks/game hinted   |

**Alt text:** One sentence, in narrator voice, for accessibility and search.

---

## Narrator voice guide

### Tone rules

- **Present tense** or immediate past — you are on the floor _now_.
- **Second person rare;** prefer “the desk,” “Gordon,” “the floor” as subjects.
- **Sensory specifics:** marble, cologne, ticker tape, bell, steam, leather, champagne, neon.
- **No hashtags** on anchor posts (optional one on thesis posts only if it feels natural).
- **No emojis** on lore/character posts; at most one on behind-the-glass if needed.
- **Never:** “excited to announce,” “link in bio,” “beta signup,” “gm,” engagement bait.
- **Game hints:** one line max — “the desks are being built,” “something is forming under the bell.”

### Sample anchor captions

**Atmosphere**

> The bell hasn’t rung yet. Somewhere above the river, a desk is already lighting cigars and reading the wire. The city is awake. The floor is not.

**Character**

> Gordon doesn’t wait for permission. Aggressive entries, thin mandate, nine wipeouts on the record. Still funded. Still hunting.

**Thesis**

> A trader is an agent. A desk is an institution. The market is what happens when both forget which one they are.

**Behind-the-glass**

> The terminals are live behind smoked glass. Ten desks. Real money on testnet. You’re not on the list yet.

---

## Image production (weekly batch)

Run one session each **Sunday** (30–45 min). Generate 6–8 images; pick 3–4 for the week; store in `assets/marketing/YYYY-MM-DD/`.

### Master prompt recipe

Append scene-specific details to this base:

```text
Cinematic photograph, 1980s Wall Street luxury, [SCENE].
Warm Kodak film tones, subtle grain, shallow depth of field,
dramatic natural light, editorial quality, no text, no logos,
no modern smartphones, period-accurate fashion and interiors.
Aspect ratio 4:5 for X portrait crop.
```

### Scene bank (rotate)

| Code        | Scene                                                               |
| ----------- | ------------------------------------------------------------------- |
| `FLOOR`     | Open-outcry trading floor, chaos, suits, paper tickets              |
| `PENTHOUSE` | Upper East Side penthouse, skyline, dawn coffee                     |
| `HELIPAD`   | Miami / Manhattan helipad, yacht bay, suits on lawn                 |
| `CAR`       | Red Ferrari Testarossa, Wall Street at night                        |
| `CLUB`      | Rooftop lunch, champagne, city backdrop                             |
| `TRAP`      | Empty deal room, single desk lamp, wire printout (for lore threads) |

### Consistency checklist

- [ ] Same warm grade across the week
- [ ] No anachronisms (phones, crypto logos, UI chrome in lore images)
- [ ] Crop safe for X (4:5 or 16:9; test on mobile)
- [ ] Filename: `pillar-scene-date.png` (e.g. `atmosphere-penthouse-2026-06-03.png`)

---

## Track 2 — Private playtests (~10 friends)

### Goal

**Feedback and fun**, not promotion. Zero-sum PvP needs **overlapping live windows** — coordinate times, don’t async-only.

### Setup

1. Create group chat: **“The Floor”** (iMessage, Telegram, or Discord).
2. Share testnet URL + one-page “first session” steps (below).
3. Target: **10/10** with wallet connected, trader minted, USDC funded before Round 1.

### Trading windows (suggest)

| Window    | Time (ET)     | Purpose                    |
| --------- | ------------- | -------------------------- |
| **Lunch** | 12:00–1:00 PM | Quick deals, US time zones |
| **Close** | 8:00–9:30 PM  | Main playtest block        |

Pick **one primary window per round** and confirm in chat 24h ahead.

### Playtest rounds (first 3 weeks)

| Round | When                          | Focus questions                                                                  |
| ----- | ----------------------------- | -------------------------------------------------------------------------------- |
| **1** | Week 1 Sat/Sun                | Can everyone onboard? Do deals get created and entered? Is zero-sum legible?     |
| **2** | Week 2 (same window)          | Fixes from Round 1; trap vs opportunity clear? Agent decisions feel intentional? |
| **3** | Week 3 (if mechanics changed) | Retention: would you come back? What’s the #1 confusion?                         |

**Week 4:** Assess only — no mandatory round unless major ship.

### Running a round (host checklist)

**T-24h:** Post in The Floor — date, window, “be funded + trader running.”

**T-1h:** Reminder + agenda (e.g. “everyone creates one deal; agents run 30 min”).

**During:** Note timestamped moments — wipeouts, clever traps, approval drama, bugs.

**T+0 (same night):** Send feedback questionnaire (below).

**T+48h:** Summarize into `docs/playtest-feedback.md` (create on first round) with prioritized fixes.

### First-session steps (send to friends)

```text
Margin Call — Founding Desk (testnet)

1. Open [YOUR_TESTNET_URL]
2. Sign in (email OTP / wallet per env)
3. Mint one trader — pick a name and mandate
4. Fund with testnet USDC (amount: $X suggested)
5. Resume trader if paused; confirm agent is scanning
6. Create ONE deal (your trap or real opportunity)
7. Be live [DATE] [TIME ET] — we need rivals on the floor at once

Reply in chat when done. DM if stuck.
```

### Post-round feedback questionnaire

Copy into chat or Google Form:

```text
Margin Call — Playtest Round [N] feedback (~3 min)

1. Onboarding (1–5): How hard was wallet + mint + fund?
2. Legibility (1–5): Did you understand deal vs trap / win vs loss?
3. Agent quality (1–5): Did your trader’s decisions match its mandate?
4. Fun (1–5): Was the session enjoyable?
5. Would you play again next week? (Y / Maybe / N)
6. Biggest confusion (one sentence):
7. Best moment (optional — OK to use anonymously on X):
8. Bug or broken flow (optional):
```

### Harvesting content from playtests

| OK                                      | Not OK                             |
| --------------------------------------- | ---------------------------------- |
| Anonymized wipeout / trap story as lore | Friend’s real name without consent |
| “Desk 7” / fictional desk names         | Screenshots with wallet addresses  |
| Blurred terminal in behind-the-glass    | Public call-out of who lost money  |

Ask in chat after each round: _“Anyone OK if we turn [moment] into a lore post (anon)?”_

---

## Week 1 — June 1–7, 2026

### Public (X)

| Day         | Post type       | Action                                                                     |
| ----------- | --------------- | -------------------------------------------------------------------------- |
| **Mon**     | Manifesto (pin) | Best image + world-establishing caption; soft “game forming” line; no link |
| **Wed**     | Character #1    | Introduce first trader (Gordon or playtest name); seed AI agents           |
| **Fri**     | Atmosphere      | Pure mood — no game mechanics                                              |
| **Ongoing** | Engagement      | 2–3 thoughtful replies in AI-agent / onchain / fin-aesthetic threads       |

### Private

| Day         | Action                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------- |
| **Sat/Sun** | Onboard all 10 friends; **Playtest Round 1** in evening window; questionnaire same night |

### Week 1 copy (ready to post)

**Mon — Manifesto (pin)**

_Image:_ `PENTHOUSE` or `FLOOR` at dawn.

```text
Before the bell, the city already owes someone.

Marble lobbies. Wire machines still warm. Desks that never sleep—only pause.

We're writing what happened on the floor. AI traders. Real stakes. A game is forming.

You’re early. Watch the wire.
```

_Alt:_ Dawn over Manhattan financial district, empty trading floor visible through penthouse windows, 1980s film aesthetic.

---

**Wed — Character #1 (Gordon)**

_Image:_ Trader archetype — aggressive young banker on floor or in car.

```text
Gordon.

Mandate: enter first, explain later. Aggressive size. Borderline deals flagged—sometimes ignored.

Nine wipeouts on the record. Still funded. Still hunting.

He isn’t human. He doesn’t need to be.
```

_Alt:_ 1980s Wall Street trader in power suit on busy trading floor, cinematic grain.

---

**Fri — Atmosphere**

_Image:_ `HELIPAD` or `CLUB`.

```text
Saturday in Miami: helicopters on the lawn, champagne before noon, deals that never touch paper.

The floor is everywhere. The bell is just a suggestion.
```

_Alt:_ 1980s bankers on luxury lawn with helicopter and yacht bay, golden hour film photo.

---

## Weeks 2–4

### Week 2 (June 8–14)

**Public**

| Day | Post                                                   |
| --- | ------------------------------------------------------ |
| Mon | Atmosphere — new scene from scene bank                 |
| Wed | Character #2 (rival desk or second trader)             |
| Fri | **Thesis** — institutional intelligence (see template) |
| Sun | **Behind-the-glass #1** — desks live, blurred terminal |

**Private:** Playtest Round 2; apply Round 1 fixes first.

---

### Week 3 (June 15–21)

**Public**

| Day | Post                                                                         |
| --- | ---------------------------------------------------------------------------- |
| Mon | **Memoir thread** (full arc — see skeleton; use anonymized Round 1–2 moment) |
| Wed | Atmosphere                                                                   |
| Fri | Rival desks intro — two desks, one sentence each                             |

**Private:** Round 3 if mechanics changed materially; else 30-min check-in + async deals.

---

### Week 4 (June 22–28)

**Public**

| Day | Post                                                          |
| --- | ------------------------------------------------------------- |
| Mon | Atmosphere                                                    |
| Wed | Character #3 or desk spotlight                                |
| Fri | **Assess post** — only if playtests pass bar (see gate below) |

**Soft open (only if gate passed):** “The floor opens soon” + quiet DM or simple waitlist — **still not public launch**.

**Private:** No required round; review `docs/playtest-feedback.md` and decide next month.

### Week 4 gate (internal)

Proceed to soft waitlist only if **all** are true:

- [ ] ≥8/10 friends would play again (“Y” or “Maybe”)
- [ ] Fun median ≥4/5 across last two rounds
- [ ] No P0 onboarding blockers open
- [ ] At least one session had ≥5 deals created and ≥3 resolved with rivals

Otherwise: extend lore drip + playtests; no waitlist.

---

## Post templates

### Anchor / atmosphere

```text
[IMAGE: scene from scene bank]

[2–4 lines: sensory, present tense, no CTA]

[Optional game hint — one line max]
```

**Example**

```text
Steam off the street. The wire hasn’t moved. Someone upstairs is already in size.

The floor remembers everything. So will we.
```

---

### Character intro

```text
[NAME].

Mandate: [one line]. [Style adjective]. [Record hook — wipeouts, wins, reputation].

[One line: AI / not human / still hunting.]
```

**Example — desk rival**

```text
Whitmore Desk.

Conservative mandate. Trap deals only. Fourteen authored. Nine ended in wipeouts.

They don’t trade. They fish.
```

---

### Memoir thread skeleton (4–7 tweets)

Use one playtest moment (anonymized) or white-paper Gordon scene.

| Tweet | Content                                                                     |
| ----- | --------------------------------------------------------------------------- |
| 1     | Hook image + “A rumor hit the wire before the bell.”                        |
| 2     | Image + deal sounds clean; pot size; rival desk history (reputation 23/100) |
| 3     | Image + mandate flags borderline; approval queue; desk hesitates            |
| 4     | Image + approval expires; trader passes                                     |
| 5     | Image + rival enters; wipeout; value to pot                                 |
| 6     | No image — “The dramatic unit isn’t the loss. It’s the chain of judgment.”  |
| 7     | Soft close — “This is being built. The floor is almost open.”               |

---

### Thesis post

Pull from [margin-call-white-paper.md](./margin-call-white-paper.md).

```text
[IMAGE: FLOOR or empty boardroom]

Markets aren’t won by a smarter bot.

They’re won by desks: mandates, capital, approvals, memory—and rivals writing traps.

Intelligence is institutional before it is individual.

We’re building the game that tests that.
```

---

### Behind-the-glass teaser

```text
[IMAGE: blurred app screenshot or terminal glow through glass]

The desks are live behind smoked glass.

[Testnet / founding round — no link yet.]

You’re not on the floor yet.
```

---

## Friend outreach scripts

### Initial invite (DM)

```text
Hey — I’m running closed playtests for Margin Call (1980s Wall Street game: you fund AI traders, they fight other players’ agents in zero-sum deals on testnet).

Need ~10 people for structured sessions—not marketing, just honest feedback. Two windows a week for 3 weeks, ~45 min each.

Interested? I’ll add you to “The Floor” chat and send setup steps.
```

### Playtest round reminder (group chat)

```text
🗓 Playtest Round [N] — [Day] [Time ET]

Be: funded trader + agent running
Do: create at least one deal; let agents run the window
After: 3-min form in thread 👇

Who’s in? React ✅
```

### Permission to use moment (group chat)

```text
That wipeout on [deal type] was brutal—in a good way for the game.

OK if I turn it into an anonymous lore post on @margincall? (No names, no wallets)
```

---

## Engagement playbook (in-niche)

**When to reply:** Threads about AI agents, onchain games, adversarial ML, 80s finance aesthetic, Base builders.

**How:** Add one memoir-flavored line; don’t pitch.

| Thread topic        | Example reply                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| “AI agents trading” | “The interesting unit isn’t the agent—it’s the desk that survives what the market throws at it.” |
| “PvP onchain”       | “Zero-sum with authored traps hits different than leaderboard grinding.”                         |
| Fin-aesthetic post  | Quote-tweet with your image + 1 line of voice (no link)                                          |

**Avoid:** Mass @ mentions, “check out my game,” follow-for-follow.

---

## Metrics

### Public (weekly log)

| Metric               | Week 1 target | Week 4 target                         |
| -------------------- | ------------- | ------------------------------------- |
| Anchor posts shipped | 3             | 3–4/week sustained                    |
| Threads shipped      | 0             | 1                                     |
| Followers            | 20–50         | 100–200                               |
| Top post impressions | —             | ≥1 post >1k impressions               |
| Qualitative          | —             | ≥3 DMs/replies asking “what is this?” |

### Private (per round)

| Metric                            | Target           |
| --------------------------------- | ---------------- |
| Friends onboarded (funded trader) | 10/10            |
| Concurrent desks in window        | ≥6               |
| Deals created (session)           | ≥10 total        |
| Deals resolved vs rivals          | ≥5               |
| Fun (median 1–5)                  | ≥4               |
| Would play again                  | ≥8/10 Y or Maybe |

### Feedback doc

Maintain [docs/playtest-feedback.md](./playtest-feedback.md) after Round 1:

```markdown
# Playtest feedback log

## Round N — YYYY-MM-DD

- Participants:
- Deals created / resolved:
- Top bugs:
- Top confusions:
- Best moment (lore candidate?):
- Prioritized fixes:
```

---

## Distribution (later phase only)

When playtests pass the Week 4 gate, consider (not now):

- Base Content Creators list and builder programs in [growth.md](./growth.md)
- Quiet outreach to 3–5 niche accounts with a lore post + “happy to show testers” — not a launch blast

---

## Out of scope (this phase)

- Public launch or signup landing page push
- Paid ads
- Instagram (unless repurposing X assets later with zero extra effort)
- Daily posting cadence
- Asking friends to mass-RT or shill

---

## Weekly operator checklist

**Sunday**

- [ ] Image batch (6–8)
- [ ] Draft 3–4 captions + 1 thread outline
- [ ] Confirm playtest window in The Floor
- [ ] Review last week metrics + feedback doc

**Monday**

- [ ] Ship manifesto / anchor post
- [ ] Pin if Week 1 Mon

**Midweek**

- [ ] Character or thesis post
- [ ] 2 in-niche replies

**Friday**

- [ ] Atmosphere or behind-the-glass

**After playtest**

- [ ] Questionnaire
- [ ] Update `playtest-feedback.md` within 48h

---

## Calendar at a glance

| Week        | Public focus                             | Private focus             |
| ----------- | ---------------------------------------- | ------------------------- |
| 1 Jun 1–7   | Manifesto, Gordon, atmosphere            | Onboard + Round 1         |
| 2 Jun 8–14  | Char #2, thesis, behind-the-glass        | Round 2                   |
| 3 Jun 15–21 | Memoir thread, rival desks               | Round 3 or check-in       |
| 4 Jun 22–28 | Assess; soft waitlist **if gate passed** | Review; no required round |

---

_Last updated: 2026-05-30. Phase: pre-launch lore + closed playtests._
