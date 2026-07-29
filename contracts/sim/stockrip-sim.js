"use strict";
/*
 * stockrip-sim.js — inventory dynamics for the NAV-weighted rip game.
 * Run:  node stockrip-sim.js
 * No dependencies.
 *
 * What it models
 * --------------
 *  - A pool of single-share packs across a curated asset set (NVDA/TSLA/GME).
 *  - Acquirers ("rips") arrive at rate `lambda`/day and draw a random pack with
 *    weight  w_i = inventory_i / price_i^alpha   (inverse-NAV => cheap drawn often).
 *  - Acquisition price = harmonic mean of active pack NAVs * (1 + surcharge).
 *  - Depositors restock, chasing $RIP yield. HOW rewards are shaped decides
 *    whether the pool holds its mix or drifts.
 *
 * The question: does GME (drawn ~14x more than TSLA) drain the pool, and can
 * the token emission be used as a restocking controller to hold it steady?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OWNER CONTROLS  (every field here is a live game lever)
 * ───────────────────────────────────────────────────────────────────────── */
const CONFIG = {
  days: 60,
  ticksPerDay: 24,

  lambda: 300, // acquisitions ("rips") per day   — demand
  surcharge: 0.1, // % on top of harmonic-mean price  — house edge / rip cost
  alpha: 1.0, // selection curve: weight ∝ 1/price^alpha (0=flat, >1=cheaper favored harder)
  emissionPerDay: 10_000_000, // $RIP/day streamed to depositors
  ripPrice: 0.01, // $ per $RIP (only affects yield magnitude, not the mix)

  // ── restock controller gain (the anti-drift knob) ──
  restockGain: 12, // softmax sharpness: how hard deposits chase the best yield
  gapConvexity: 2, // reward ∝ gap^convexity (1=linear, 2=convex => harder push as it empties)

  seed: 42,
};

// id, live NAV (from the allowlist screenshot), and the owner's target inventory
const ASSETS = () => [
  { id: "GME", price: 22.16, target: 2000, inv: 2000 },
  { id: "NVDA", price: 196.74, target: 2000, inv: 2000 },
  { id: "TSLA", price: 307.35, target: 2000, inv: 2000 },
];

// ── seeded RNG so runs are reproducible ───────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── reward shaping: reward-per-pack for ticker i, given current state ──────
// Returns an array of $RIP/pack for each asset. Depositors care about
// yield = reward_per_pack * ripPrice / price.
function rewardsPerPack(mode, assets, emission, cfg) {
  const active = assets.filter((a) => a.inv > 0.0001 && !a.frozen);
  if (active.length === 0) return assets.map(() => 0);

  if (mode === "neutral") {
    // per-dollar-uniform: pay proportional to value resting => flat yield, no steering
    const totalValue = active.reduce((s, a) => s + a.inv * a.price, 0);
    return assets.map((a) =>
      a.inv > 0 && !a.frozen ? (emission * a.price) / totalValue : 0
    );
  }
  if (mode === "sqrtValue") {
    // StockRip's √(backed value): weakly favors cheap on a yield basis
    const tot = active.reduce((s, a) => s + a.inv * Math.sqrt(a.price), 0);
    return assets.map((a) =>
      a.inv > 0 && !a.frozen
        ? ((emission * Math.sqrt(a.price)) / tot / a.inv) * a.inv
        : 0
    );
  }
  if (mode === "restock") {
    // feedback controller: emission flows to the depletion gap, convex in the gap
    const gaps = active.map((a) =>
      Math.pow(Math.max(1, a.target - a.inv), cfg.gapConvexity)
    );
    const totGap = gaps.reduce((s, g) => s + g, 0);
    const byId = {};
    active.forEach((a, k) => {
      byId[a.id] = (emission * gaps[k]) / totGap / Math.max(a.inv, 1);
    });
    return assets.map((a) => byId[a.id] || 0);
  }
  throw new Error("unknown mode " + mode);
}

function harmonicPrice(assets, cfg) {
  const active = assets.filter((a) => a.inv > 0.0001 && !a.frozen);
  const packs = active.reduce((s, a) => s + a.inv, 0);
  const denom = active.reduce((s, a) => s + a.inv / a.price, 0);
  if (denom === 0) return 0;
  return (packs / denom) * (1 + cfg.surcharge);
}

function simulate(mode, cfg, freeze /* {ticker,startDay,endDay} | null */) {
  const rnd = mulberry32(cfg.seed);
  const assets = ASSETS();
  const dt = 1 / cfg.ticksPerDay;
  const history = [];
  let drawAcc = 0;

  const totalTicks = cfg.days * cfg.ticksPerDay;
  for (let t = 0; t < totalTicks; t++) {
    const day = t / cfg.ticksPerDay;

    // owner freeze event (simulates a trading halt / oracle staleness)
    if (freeze) {
      const on = day >= freeze.startDay && day < freeze.endDay;
      assets.forEach((a) => {
        a.frozen = a.id === freeze.ticker ? on : false;
      });
    }

    // ── draws (outflow) ──
    drawAcc += cfg.lambda * dt;
    let nDraws = Math.floor(drawAcc);
    drawAcc -= nDraws;
    const drawnThisTick = {};
    let totalDrawn = 0;
    for (let d = 0; d < nDraws; d++) {
      const active = assets.filter((a) => a.inv > 0.0001 && !a.frozen);
      if (!active.length) break;
      const weights = active.map((a) => a.inv / Math.pow(a.price, cfg.alpha));
      const sum = weights.reduce((s, w) => s + w, 0);
      let r = rnd() * sum,
        pick = active[0];
      for (let k = 0; k < active.length; k++) {
        r -= weights[k];
        if (r <= 0) {
          pick = active[k];
          break;
        }
      }
      pick.inv -= 1;
      drawnThisTick[pick.id] = (drawnThisTick[pick.id] || 0) + 1;
      totalDrawn++;
    }

    // ── rewards + deposits (inflow), conserving pool size ──
    const emission = cfg.emissionPerDay * dt;
    const rpp = rewardsPerPack(mode, assets, emission, cfg);
    const yields = assets.map((a, i) =>
      a.inv >= 0 && !a.frozen && a.price > 0
        ? (rpp[i] * cfg.ripPrice) / a.price
        : 0
    );
    // softmax allocation of restock capital across tickers by yield
    const mx = Math.max(...yields);
    // normalize spread so restockGain means the same thing regardless of $RIP price scale
    const spread = mx - Math.min(...yields) || 1;
    const ex = yields.map((y) =>
      Math.exp((cfg.restockGain * (y - mx)) / spread)
    );
    const exSum = ex.reduce((s, e) => s + e, 0) || 1;
    const alloc = ex.map((e) => e / exSum);
    assets.forEach((a, i) => {
      if (!a.frozen) a.inv += totalDrawn * alloc[i];
    });

    // ── snapshot ──
    const active = assets.filter((a) => a.inv > 0.0001 && !a.frozen);
    const wsum = active.reduce(
      (s, a) => s + a.inv / Math.pow(a.price, cfg.alpha),
      0
    );
    const drawShare = {};
    assets.forEach((a) => {
      drawShare[a.id] =
        active.includes(a) && wsum > 0
          ? a.inv / Math.pow(a.price, cfg.alpha) / wsum
          : 0;
    });
    history.push({
      day,
      inv: Object.fromEntries(assets.map((a) => [a.id, a.inv])),
      drawShare,
      price: harmonicPrice(assets, cfg),
    });
  }
  return { assets, history };
}

// ── tiny ASCII chart for one 0..1 series ───────────────────────────────────
function sparkline(series, label) {
  const blocks = "▁▂▃▄▅▆▇█";
  const s = series
    .map((v) => blocks[Math.min(7, Math.max(0, Math.round(v * 7)))])
    .join("");
  return `${label.padEnd(22)} ${s}`;
}

function snapAtDays(history, days) {
  return days.map((d) =>
    history.reduce((best, h) =>
      Math.abs(h.day - d) < Math.abs(best.day - d) ? h : best
    )
  );
}

function endState(run) {
  const tail = run.history.slice(-run.history.length / 6); // avg last ~10 days
  const avg = (k) => tail.reduce((s, h) => s + h.drawShare[k], 0) / tail.length;
  const price = tail.reduce((s, h) => s + h.price, 0) / tail.length;
  const last = run.history[run.history.length - 1];
  return {
    gme: avg("GME"),
    nvda: avg("NVDA"),
    tsla: avg("TSLA"),
    price,
    invGME: last.inv.GME,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
function main() {
  const cfg = CONFIG;

  console.log("\n=== NAV-weighted rip pool — restock controller sweep ===");
  console.log(
    `lambda=${cfg.lambda}/day  surcharge=${cfg.surcharge}  alpha=${cfg.alpha}  start 2000 packs each`
  );
  console.log(
    "Target GME draw-share (equal inventories) ≈ 84%. Neutral rewards decay it to ~34%.\n"
  );

  console.log(
    "  gain  conv |  GME draw%  NVDA%  TSLA% |  GME inv end |  rip price"
  );
  console.log(
    "  ───────────┼─────────────────────────┼──────────────┼───────────"
  );
  const grid = [];
  for (const conv of [1, 2, 3]) {
    for (const gain of [4, 8, 12, 20, 40]) {
      const run = simulate(
        "restock",
        { ...cfg, restockGain: gain, gapConvexity: conv },
        null
      );
      const e = endState(run);
      grid.push({ gain, conv, ...e });
      console.log(
        `  ${String(gain).padStart(4)}  ${String(conv).padStart(4)} | ` +
          `${(e.gme * 100).toFixed(0).padStart(8)}% ${(e.nvda * 100).toFixed(0).padStart(5)}% ${(e.tsla * 100).toFixed(0).padStart(5)}% | ` +
          `${e.invGME.toFixed(0).padStart(12)} | $${e.price.toFixed(2).padStart(7)}`
      );
    }
  }

  // pick the setting whose steady-state GME draw-share is closest to 84%
  const best = grid.reduce((b, g) =>
    Math.abs(g.gme - 0.84) < Math.abs(b.gme - 0.84) ? g : b
  );
  console.log(
    `\n  → closest to 84%: gain=${best.gain}, convexity=${best.conv}  (GME ${(best.gme * 100).toFixed(0)}%, price $${best.price.toFixed(2)})`
  );

  // trajectory for neutral vs the chosen setting
  console.log("\n── GME draw-share over 60 days (target ~84%) ──");
  const neutral = simulate("neutral", cfg, null);
  const chosen = simulate(
    "restock",
    { ...cfg, restockGain: best.gain, gapConvexity: best.conv },
    null
  );
  for (const [label, run] of [
    ["neutral (no steering)", neutral],
    [`restock g=${best.gain} c=${best.conv}`, chosen],
  ]) {
    const daily = [];
    for (let d = 0; d < cfg.days; d++) {
      const h =
        run.history.find((x) => Math.floor(x.day) === d) || run.history[0];
      daily.push(h.drawShare.GME);
    }
    console.log(
      "  " +
        sparkline(daily, label) +
        `  (end ${(daily[daily.length - 1] * 100).toFixed(0)}%)`
    );
  }

  cfg.restockGain = best.gain;
  cfg.gapConvexity = best.conv; // use best for freeze demo

  // ── freeze demo: halt GME days 30–33 under the restock controller ──
  console.log(
    "\n── OWNER FREEZE demo: GME halted days 30–33 (restock mode) ──"
  );
  const fr = simulate("restock", cfg, {
    ticker: "GME",
    startDay: 30,
    endDay: 33,
  });
  const around = snapAtDays(fr.history, [29, 30, 31, 33, 34]);
  console.log("  day |  GME frozen? |  GME draw%  NVDA%  TSLA% |  rip price");
  for (const s of around) {
    const frozen = s.day >= 30 && s.day < 33;
    console.log(
      `  ${String(Math.round(s.day)).padStart(3)} | ${(frozen ? "FROZEN" : "active").padStart(12)} | ` +
        `${(s.drawShare.GME * 100).toFixed(0).padStart(8)}% ${(s.drawShare.NVDA * 100).toFixed(0).padStart(5)}% ${(s.drawShare.TSLA * 100).toFixed(0).padStart(5)}% | ` +
        `$${s.price.toFixed(2).padStart(7)}`
    );
  }
  console.log(
    "  (while frozen: GME drops out of the weight set AND the price basket — rips reroute, price jumps to the NVDA/TSLA harmonic mean.)\n"
  );
}

main();
