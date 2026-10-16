// Prove the bot levels are a ladder: Hard beats Normal beats Easy.
//
//   npm run sim:ladder [-- --boards 300 --margin 0.02]
//
// Every level plays the same boards (paired seeds, so luck cancels) and is
// scored with the game's own result() and metric direction. It fails when a
// level does not beat the one below it by at least --margin of the metric's
// spread on the average board, or when the game has no botLog of its own —
// random legal moves at all three levels is one level wearing three names.

import { readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { hash } from "../src/core/rng.mjs"
import { botLog, BOT_LEVELS } from "../src/core/table.mjs"

const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? Number(process.argv[i + 1]) : dflt }
const BOARDS = arg("boards", 300), MARGIN = arg("margin", 0.02)

const ROOT = resolve(new URL("..", import.meta.url).pathname)
const file = readdirSync(join(ROOT, "src/game")).find((f) => f.endsWith(".rules.mjs"))
const rules = await import(pathToFileURL(join(ROOT, "src/game", file)))
const config = (await import(pathToFileURL(join(ROOT, "relay.config.mjs")))).default

if (typeof rules.botLog !== "function") {
  console.error(`sim:ladder FAILED  ${file} exports no botLog(seed, rng, params, level): its three bot levels would all be the same random player`)
  process.exit(1)
}

const better = config.metric && config.metric.dir === "asc" ? -1 : 1   // +1: higher metric is better
const scores = Object.fromEntries(BOT_LEVELS.map((l) => [l, []]))
for (let b = 0; b < BOARDS; b++) {
  const seed = hash(["ladder", b].join("|"))
  for (const level of BOT_LEVELS) {
    const state = rules.replay(seed, botLog(rules, seed, 1, undefined, level))
    const r = rules.result(state, { seconds: 0 })
    scores[level].push(better * r.metric + (r.tiebreak || 0) * 1e-6)
  }
}

const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length
const all = BOT_LEVELS.flatMap((l) => scores[l])
const spread = Math.max(...all) - Math.min(...all) || 1
let bad = 0
console.log(`sim:ladder  ${file}  ${BOARDS} boards, same seeds for every level`)
for (const l of BOT_LEVELS) console.log(`  ${l.padEnd(7)} mean ${(better * mean(scores[l])).toFixed(3)}`)
for (let i = 1; i < BOT_LEVELS.length; i++) {
  const lo = BOT_LEVELS[i - 1], hi = BOT_LEVELS[i]
  const wins = scores[hi].filter((v, k) => v > scores[lo][k]).length
  const losses = scores[hi].filter((v, k) => v < scores[lo][k]).length
  const gap = (mean(scores[hi]) - mean(scores[lo])) / spread
  const pass = gap >= MARGIN && wins > losses
  if (!pass) bad++
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${hi} beats ${lo}: gap ${(gap * 100).toFixed(1)}% of spread, board wins ${wins} / losses ${losses}`)
}
if (bad) { console.error("\nsim:ladder FAILED: the levels are not a ladder"); process.exit(1) }
console.log("\nladder holds")
