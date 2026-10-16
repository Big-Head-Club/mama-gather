// Prove the quest draft has no best answer.
//
//   npm run sim:draft [-- --runs 400 --margin 0.15 --ahead 3]
//
// A bot plays quest runs from the rules (rules.botLog, or random legal moves).
// At every draft it picks at RANDOM, so each upgrade is taken in every kind of
// situation and nothing is confounded by a clever policy. At each draft it also
// plays the next few legs out once per offer AND once with nothing taken, on
// the same seeds — a paired counterfactual — which gives, per upgrade:
//
//   lift      how much more often the next `ahead` legs are cleared with it
//             than with nothing (paired, so luck cancels)
//   pick      how often a greedy bot that can see those futures takes it
//   offered   how often it is dealt at all
//
// It fails, loudly, when:
//   - an upgrade's lift beats the median lift by more than --margin (15pp):
//     it is the answer, and the draft is a formality
//   - an upgrade is never dealt: dead content
//   - an upgrade changes nothing (|lift| < 0.5pp) and is not tagged economy:
//     a choice that does not matter is not a choice
// and it prints the top builds by depth, so a dominant COMBINATION shows too.
//
// All unlocks are on, so gated upgrades are measured. The daily never drafts.

import { readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { makeRng, hash } from "../src/core/rng.mjs"
import { questLegSeed } from "../src/core/modes.mjs"

const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? Number(process.argv[i + 1]) : dflt }
const RUNS = arg("runs", 400), MARGIN = arg("margin", 0.15), AHEAD = arg("ahead", 3), CAP = arg("cap", 30)

const ROOT = resolve(new URL("..", import.meta.url).pathname)
const file = readdirSync(join(ROOT, "src/game")).find((f) => f.endsWith(".rules.mjs"))
const rules = await import(pathToFileURL(join(ROOT, "src/game", file)))
for (const fn of ["questParams", "questOffers", "applyOffer", "replay", "result", "create"]) {
  if (typeof rules[fn] !== "function") { console.error(`${file} exports no ${fn}: this game has no quest to simulate`); process.exit(1) }
}
const UPGRADES = rules.UPGRADES || []
if (!UPGRADES.length) { console.error(`${file} exports no UPGRADES: describe the draft as data (see src/core/draft.mjs)`); process.exit(1) }

const unlocked = (rules.QUEST_UNLOCKS || []).map((u) => u.id)
const spend = rules.spendLeg || ((l) => ({ ...l, slots: 0 }))
const start = () => (rules.loadoutFrom ? rules.loadoutFrom(unlocked) : {})

function playLog(seed, rng, params) {
  if (rules.botLog) return rules.botLog(seed, rng, params, "hard")
  const s = rules.create(seed, params), log = []
  for (let i = 0; i < 200 && !s.over; i++) { const m = rng.pick(rules.moves(s, rng) || []); if (!m) break; log.push(m); rules.apply(s, m) }
  return log
}
const cleared = (r) => !!(r.solved ?? r.home ?? r.won)
function clearLeg(runSeed, leg, loadout) {
  const seed = questLegSeed(runSeed, leg)
  const params = rules.questParams(leg, loadout)
  const log = playLog(seed, makeRng(hash([runSeed, leg, "bot"].join("|"))), params)
  return cleared(rules.result(rules.replay(seed, log, params)))
}
// How many of the next `AHEAD` legs a loadout clears, starting at `leg`.
function future(runSeed, leg, loadout) {
  let l = loadout, n = 0
  for (let k = 0; k < AHEAD; k++) {
    if (!clearLeg(runSeed, leg + k, l)) break
    n++
    l = spend(l)
  }
  return n / AHEAD
}

const stat = Object.fromEntries(UPGRADES.map((u) => [u.id, { offered: 0, greedy: 0, liftSum: 0, liftN: 0 }]))
const builds = new Map()
let depthSum = 0

for (let r = 0; r < RUNS; r++) {
  const runSeed = hash("sim-draft|" + r)
  const pickRng = makeRng(hash(runSeed + "|pick"))
  let loadout = start(), leg = 1
  while (leg <= CAP && clearLeg(runSeed, leg, loadout)) {
    loadout = spend(loadout)
    const offers = rules.questOffers(leg, loadout, makeRng(hash([runSeed, leg, "offers"].join("|"))), { unlocked })
    if (!offers.length) break
    const base = future(runSeed, leg + 1, loadout)
    let best = null
    for (const o of offers) {
      const s = stat[o.id]
      if (!s) continue
      s.offered++
      const f = future(runSeed, leg + 1, rules.applyOffer(loadout, o.id))
      s.liftSum += f - base; s.liftN++
      if (!best || f > best.f) best = { id: o.id, f }
    }
    if (best) stat[best.id].greedy++
    loadout = rules.applyOffer(loadout, pickRng.pick(offers).id)
    leg++
  }
  const depth = leg - 1
  depthSum += depth
  const key = (loadout.held || []).slice().sort().join("+") || "(nothing)"
  const b = builds.get(key) || { n: 0, depth: 0 }
  b.n++; b.depth += depth
  builds.set(key, b)
}

const rows = UPGRADES.map((u) => {
  const s = stat[u.id]
  return { id: u.id, rarity: u.rarity || "common", tags: (u.tags || []).join(","), offered: s.offered, pick: s.offered ? s.greedy / s.offered : 0, lift: s.liftN ? s.liftSum / s.liftN : 0, economy: (u.tags || []).includes("economy") }
})
const sorted = rows.map((r) => r.lift).sort((a, b) => a - b)
const median = sorted[Math.floor(sorted.length / 2)]
const pct = (x) => (x * 100).toFixed(1).padStart(6)

console.log(`sim:draft  ${file}  ${RUNS} runs, mean depth ${(depthSum / RUNS).toFixed(2)}, lift over the next ${AHEAD} legs, median lift ${pct(median)}pp\n`)
console.log("upgrade      rarity  tags        offered   pick%   lift pp")
const fails = []
for (const r of rows) {
  console.log(`${r.id.padEnd(12)} ${r.rarity.padEnd(7)} ${r.tags.padEnd(10)} ${String(r.offered).padStart(8)} ${pct(r.pick)} ${pct(r.lift)}`)
  if (!r.offered) fails.push(`${r.id} is never dealt: dead content`)
  else if (!r.economy && r.lift - median > MARGIN) fails.push(`${r.id} lifts ${pct(r.lift - median).trim()}pp over the median: it is the answer`)
  else if (!r.economy && Math.abs(r.lift) < 0.005) fails.push(`${r.id} changes nothing (lift ${pct(r.lift).trim()}pp)`)
}
console.log("\ntop builds by depth (at least 10 runs)")
for (const [key, b] of [...builds].filter(([, b]) => b.n >= 10).sort((a, b) => b[1].depth / b[1].n - a[1].depth / a[1].n).slice(0, 5)) {
  console.log(`  ${(b.depth / b.n).toFixed(2).padStart(6)} legs  ${String(b.n).padStart(4)} runs  ${key}`)
}
if (fails.length) { console.log("\nFAIL\n  " + fails.join("\n  ")); process.exit(1) }
console.log("\nno upgrade dominates, none is dead")
