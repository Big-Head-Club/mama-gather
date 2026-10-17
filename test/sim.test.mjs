// Mama Gather — the game's own properties: every generated level is playable, the solver's stars are
// reachable in the real sim, and a replayed log lands on the same tick.
import { generate, TIERS, tierForDay } from "../src/game/gen.mjs"
import { reach } from "../src/game/solver.mjs"
import { solve } from "../src/game/solver.mjs"
import { create, apply, advance, replay, result, moves } from "../src/game/game.rules.mjs"
import { routeBot, headingTo } from "../tools/bot.mjs"
import { passable, C } from "../src/game/sim.mjs"
import { makeRng } from "../src/core/rng.mjs"

let bad = 0
const ok = (name, cond, extra = "") => { if (cond) console.log("  ok  " + name); else { bad++; console.log("FAIL  " + name + " " + extra) } }

// every tier, a handful of seeds: counts, reachability, ability terrain that matters
for (const tier of ["tiny", "small", "medium"]) {
  let fine = 0, abilityMatters = 0, n = 6
  for (let s = 1; s <= n; s++) {
    const lv = generate(500 + s, tier)
    const t = TIERS[tier]
    const dist = reach(lv)
    const spotsReach = lv.spots.every((sp) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dz]) => { const i = (sp.z + dz) * lv.w + sp.x + dx; return passable(lv.grid[i], lv.ability) && isFinite(dist[i]) }))
    const without = solve(lv, "none")
    if (!without || without.dist >= lv.solve.dist * 1.1) abilityMatters++
    if (lv.spots.length === t.spots && lv.babies.length === t.babies && spotsReach && lv.solve.ticks > 0) fine++
  }
  ok(`${tier}: ${n} seeds build with the right counts and every spot reachable`, fine === n, `${fine}/${n}`)
  ok(`${tier}: the squeeze gaps shorten the best route by 10% or more on every seed`, abilityMatters === n, `${abilityMatters}/${n}`)
}

// the wrinkles: medium has a sleeper, big a wanderer with a clear run, and mud costs the solver what it costs the sim
{
  const lv = generate(901, "medium")
  ok("medium carries one sleeper", lv.sleepers.length === 1, JSON.stringify(lv.sleepers))
  const big = generate(902, "big")
  ok("big carries a wanderer whose two spots are 3..8 m apart", big.wanderers.length === 1 && (() => { const w = big.wanderers[0]; const a = big.spots[big.babies[w.baby]], b = big.spots[w.to]; const d = Math.hypot(a.x - b.x, a.z - b.z); return d >= 3 && d <= 8 })(), JSON.stringify(big.wanderers))
  ok("big has every wrinkle on the map", [C.MUD, C.WATER, C.BRUSH].every((c) => big.grid.indexOf(c) >= 0))
  const sleeper = routeBot(901, "medium")
  ok("a bot on the route wakes the sleeper and finishes medium inside three stars", sleeper.ticks > 0 && sleeper.ratio <= 1.25, `ratio ${sleeper.ratio.toFixed(3)}`)
  const wander = routeBot(902, "big")
  ok("a bot on the route catches the wanderer and finishes big inside three stars", wander.ticks > 0 && wander.ratio <= 1.25, `ratio ${wander.ratio.toFixed(3)}`)
}

// the solver's time is walkable: a bot on its route finishes inside the three-star window
{
  let worst = 0
  for (let s = 1; s <= 5; s++) { const r = routeBot(700 + s, "small"); worst = Math.max(worst, r.ratio) }
  ok("a bot walking the solver's route lands within 1.05x of optimal on five small levels", worst > 0 && worst <= 1.05, `worst ${worst.toFixed(3)}`)
}

// replay: the same log on the server gives the same ticks; a tampered log gives a different score, never a throw
{
  const seed = 4242
  const st = create(seed, { tier: "tiny" })
  const rng = makeRng(7)
  const log = []
  for (let i = 0; i < 400 && !st.over; i++) { const m = rng.pick(moves(st, rng)); log.push(m); apply(st, m) }
  const a = result(st), b = result(replay(seed, log, { tier: "tiny" }))
  ok("a replayed log reproduces the metric", a.metric === b.metric && a.attempts === b.attempts)
  const tampered = log.map((m) => (m.t != null ? Object.assign({}, m, { t: m.t - 1000 }) : m))
  let threw = false; try { result(replay(seed, tampered, { tier: "tiny" })) } catch { threw = true }
  ok("a tampered log is ignored, not thrown", !threw)
}

// a client-style run: stick moves logged, the clock advanced by the frame loop (not a move), the finishing tick written
// into the log as the view does, then "done for the day". The replay must land on the same metric.
{
  const seed = 4343, st = create(seed, { tier: "tiny" }), lv = st.level, route = lv.solve.route
  const log = []; const push = (m) => { log.push(m); apply(st, m) }
  push({ r: 1 }); let k = 0, last = null
  for (let g = 0; g < 5000 && st.att; g++) {
    const a = st.att
    while (k < route.length) { const dx = route[k][0] - a.x, dz = route[k][1] - a.z; if (dx * dx + dz * dz < 0.03) k++; else break }
    if (k >= route.length) k = route.length - 1
    const p = k === route.length - 1 && a.got.length === lv.babies.length ? [lv.exit[0] + 0.5, lv.exit[1] + 0.5] : route[k]
    const d = headingTo(a, p[0], p[1])
    if (d !== last) { push({ t: a.tick, d, s: 4 }); last = d }
    advance(st, a.tick + 1)
    if (!st.att) { const h = st.history[st.history.length - 1]; if (h.done) log.push({ t: a.doneAt, d: a.d, s: a.s }) }
  }
  push({ q: 1 })
  const live = result(st), re = result(replay(seed, log, { tier: "tiny" }))
  ok("a run finished by the frame loop replays to the same metric once the finishing tick is logged", live.solved && live.metric === re.metric, `${live.metric} vs ${re.metric}`)
}

// the week: Monday is tiny, Sunday is huge, and the epoch day maps where the config says
{
  const days = [1, 2, 3, 4, 5, 6, 7].map((n) => tierForDay(n, "2026-10-12"))   // a Monday
  ok("the week ramps Mon tiny -> Sun huge", days.join(",") === "tiny,tiny,small,small,medium,big,huge", days.join(","))
}

console.log(bad ? `\n${bad} failing` : "\nall green")
process.exit(bad ? 1 : 0)
