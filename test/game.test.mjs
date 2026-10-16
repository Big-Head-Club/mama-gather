// Mama Gather — the properties every Relay game must hold, on this game's rules.

import { makeRng } from "../src/core/rng.mjs"
import * as rules from "../src/game/game.rules.mjs"

let bad = 0
const ok = (name, cond, extra = "") => {
  if (cond) console.log("  ok  " + name)
  else { bad++; console.log("FAIL  " + name + " " + extra) }
}

{
  const seed = 1234
  ok("the same seed builds the same board", JSON.stringify(rules.create(seed)) === JSON.stringify(rules.create(seed)))
  ok("an empty log replays without throwing", !!rules.replay(seed, []))
  const r = rules.result(rules.replay(seed, []))
  ok("a result carries a numeric metric", Number.isFinite(r.metric))
  ok("a claimed clock is clamped", rules.result(rules.replay(seed, []), { seconds: 999999 }).seconds <= 3600)
  ok("junk moves are ignored, not thrown", (() => { try { rules.replay(seed, [null, {}, { junk: 1 }]); return true } catch { return false } })())
  if (rules.moves) {
    const rng = makeRng(seed), s = rules.create(seed)
    for (let i = 0; i < 500 && !s.over; i++) { const m = rules.moves(s, rng); if (!m || !m.length) break; rules.apply(s, rng.pick(m)) }
    ok("random legal moves end the game", s.over)
  }
}

console.log(bad ? `\n${bad} failing` : "\nall green")
process.exit(bad ? 1 : 0)
