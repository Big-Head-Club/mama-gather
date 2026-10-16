// Mama Gather — rules. PURE: no DOM, no clock, no Math.random.
// The server imports this file and replays your players' runs with it.
//
// The Relay contract over sim.mjs. A run is one day's worth of attempts on one
// level; the log is every stick change with the tick it landed on, plus
// restarts. The server replays it through the same sim and ranks what it can
// prove: the best finish in ticks.

import { generate, tierForDay, TIERS } from "./gen.mjs"
import { newAttempt, step, advanceTo, terminal, HZ, NDIRS, MAX_TICKS } from "./sim.mjs"
import { STAR3, STAR2 } from "./solver.mjs"
import config from "../../relay.config.mjs"
import { routeToken } from "./route.mjs"

export { HZ, TIERS }
export const PRACTICE_SEED = 0x5eed7
export const STRIP_MAX = 12
export const NO_TIME = 999999

export function create(seed, opts = {}) {
  const number = opts.number || 0
  const practice = seed === PRACTICE_SEED
  const tier = practice ? "tiny" : opts.tier || (number ? tierForDay(number, config.epoch) : "tiny")
  const level = generate(seed, tier, opts.species, practice ? { babies: 2, spots: 4 } : undefined)
  return {
    seed, number, tier, level,
    att: null,                 // the attempt in progress
    attempts: 0,               // started
    history: [],               // { done, ticks, stars } per finished or abandoned attempt
    best: -1, bestPath: null, bestAt: 0,
    over: false,
  }
}

export function stars(level, ticks) {
  if (ticks < 0) return 0
  if (ticks <= level.solve.t3) return 3
  if (ticks <= level.solve.t2) return 2
  return 1
}

function record(state) {
  const a = state.att
  if (!a) return
  const ticks = a.done ? a.doneAt : -1
  state.history.push({ done: a.done, ticks, stars: stars(state.level, ticks), found: a.got.length })
  if (a.done && (state.best < 0 || ticks < state.best)) { state.best = ticks; state.bestPath = a.path; state.bestAt = state.attempts }
  state.att = null
}

// Advance the live attempt to `tick` with no new input. The view calls this
// every frame; it is not a move and never goes in the log.
export function advance(state, tick) {
  const a = state.att
  if (!a) return
  advanceTo(state.level, a, tick)
  if (terminal(a)) record(state)
}

// Moves:  { r: 1 }          start (or restart) an attempt
//         { t, d, s }       at tick t the stick reads heading d (0..31) and speed step s (0..4)
//         { q: 1 }          done for the day
export function apply(state, move) {
  if (state.over || !move || typeof move !== "object") return state
  if (move.q) { record(state); state.over = true; return state }
  if (move.r) {
    record(state)
    state.att = newAttempt(state.level)
    state.attempts++
    return state
  }
  const a = state.att
  if (!a || terminal(a)) return state
  const t = move.t | 0, d = move.d | 0, s = move.s | 0
  if (t < a.tick || t > MAX_TICKS || d < 0 || d >= NDIRS || s < 0 || s > 4) return state
  advanceTo(state.level, a, t)
  if (terminal(a)) { record(state); return state }
  a.d = d; a.s = s
  // the clock starts on the first push: a stick change at tick 0 before she has moved is applied, not stepped
  if (!a.started && s > 0) a.started = true
  return state
}

export function events(state) {
  // one glyph per attempt: how it ended. Never where anything was.
  return state.history.slice(0, STRIP_MAX).map((h) => (h.stars === 3 ? "three" : h.stars === 2 ? "two" : h.done ? "one" : "quit"))
}

export function result(state, { seconds = 0 } = {}) {
  const lv = state.level
  const best = state.best
  const solved = best >= 0
  return {
    seconds: Math.max(0, Math.min(3600, Math.round(seconds))),
    metric: solved ? best : NO_TIME,       // ticks; ranked ascending
    tiebreak: -state.attempts,
    solved,
    ticks: best,
    stars: stars(lv, best),
    attempts: state.attempts,
    bestAt: state.bestAt,
    found: state.att ? state.att.got.length : (state.history.length ? state.history[state.history.length - 1].found : 0),
    babies: lv.babies.length,
    tier: state.tier,
    species: lv.species,
    optimal: lv.solve.ticks, t3: lv.solve.t3, t2: lv.solve.t2,
    route: state.bestPath || null,
    p: state.bestPath ? routeToken(state.bestPath, lv) : "",
    events: events(state),
  }
}

export function replay(seed, log, opts) {
  const s = create(seed, opts)
  for (const move of log || []) apply(s, move)
  return s
}

// For the checker: a handful of legal moves from here. Three of five walk the
// solver's route (so random play can actually finish a level and the metric
// moves), two wander, and after forty seconds one gives up for the day.
export function moves(state, rng) {
  if (state.over) return []
  const a = state.att
  if (!a || terminal(a)) return [{ r: 1 }]
  const good = aim(state)
  const t = a.tick + rng.int(6, 30)
  const out = [
    { t, d: good, s: 4 }, { t, d: good, s: 4 }, { t, d: good, s: 4 },
    { t, d: rng.int(0, NDIRS - 1), s: rng.int(0, 4) },
    { t: a.tick + rng.int(1, 10), d: rng.int(0, NDIRS - 1), s: 4 },
  ]
  if (a.tick > 40 * HZ) out.push({ q: 1 }, { r: 1 })
  if (!a.started) out.push({ t: a.tick, d: good, s: 4 })
  return out
}

// Heading toward the next waypoint of the solver's route that she has not passed.
function aim(state) {
  const a = state.att, lv = state.level
  const route = lv.solve.route
  if (!route.length) return 0
  // next waypoint: the first route point after the furthest one within 1 m of her
  let k = 0
  for (let i = 0; i < route.length; i++) { const dx = route[i][0] - a.x, dz = route[i][1] - a.z; if (dx * dx + dz * dz < 1) k = i + 1 }
  // with every baby found, aim for the exit
  if (a.got.length === lv.babies.length) return headingTo(a, lv.exit[0] + 0.5, lv.exit[1] + 0.5)
  const p = route[Math.min(k, route.length - 1)]
  return headingTo(a, p[0], p[1])
}
function headingTo(a, x, z) {
  const dx = x - a.x, dz = z - a.z
  // nearest of 32 headings by dot product, no trig
  const len = Math.sqrt(dx * dx + dz * dz) || 1
  let best = 0, bd = -2
  for (let d = 0; d < NDIRS; d++) {
    const v = DIR(d)
    const dot = (v[0] * dx + v[1] * dz) / len
    if (dot > bd) { bd = dot; best = d }
  }
  return best
}
import { DIRS } from "./sim.mjs"
const DIR = (d) => DIRS[d]
