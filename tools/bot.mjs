// Bots through the real sim.  node tools/bot.mjs [tier] [seeds]
//
//   route  — walks the solver's route. Proves the star thresholds are reachable in the sim
//            the player actually plays (the solver walks cell centres; the sim is a box on a
//            float plane, so they could disagree). Ratio to optimal must stay under 1.25.
//   search — a first run: knows where the spots are, not which hold babies, learns a spot
//            when inside its hint radius, walks to the nearest unknown spot. The gap between
//            this and `route` is the gap between attempt one and attempt three.
import { create, apply, advance, HZ } from "../src/game/game.rules.mjs"
import { DIRS, NDIRS, PICKUP, babyAt } from "../src/game/sim.mjs"
import { distField } from "../src/game/solver.mjs"

export function headingTo(a, x, z) {
  const dx = x - a.x, dz = z - a.z, len = Math.sqrt(dx * dx + dz * dz) || 1
  let best = 0, bd = -2
  for (let d = 0; d < NDIRS; d++) { const dot = (DIRS[d][0] * dx + DIRS[d][1] * dz) / len; if (dot > bd) { bd = dot; best = d } }
  return best
}

// Walk a list of cell-centre waypoints, re-aiming every tick. Returns the attempt's ticks or -1.
function walk(state, waypoints, until, trace) {
  const lv = state.level
  apply(state, { r: 1 })
  let k = 0, holdSince = -1
  for (let guard = 0; guard < 20 * 60 * HZ; guard++) {
    const a = state.att
    if (!a) { const h = state.history[state.history.length - 1]; return h && h.done ? h.ticks : -1 }
    const next = until ? until(state, k) : null
    if (next) waypoints = next.waypoints, k = next.k
    // a waypoint inside a baby's disc has to be hit on the centre (the disc edge is 0.09 m past a
    // diagonal cell centre); the rest are passed at full speed. She does not leave such a waypoint
    // until the baby has joined: a sleeper needs her to stay, a wanderer may be at its other spot.
    let dd = 0, precise = false, hold = false
    while (k < waypoints.length) {
      const dx = waypoints[k][0] - a.x, dz = waypoints[k][1] - a.z; dd = dx * dx + dz * dz
      const owner = discOwner(lv, a, waypoints[k])
      precise = owner >= 0
      if (dd < (precise ? 0.0064 : 0.04)) {
        if (precise && a.got.indexOf(lv.babies[owner]) < 0 && (a.tick - (holdSince >= 0 ? holdSince : a.tick)) < 12 * HZ) { if (holdSince < 0) holdSince = a.tick; hold = true; break }
        holdSince = -1; k++
      } else break
    }
    if (k >= waypoints.length) { k = waypoints.length - 1 }
    // the last leg: aim at the den itself, not the cell beside it (a cell centre is exactly EXIT_R away)
    const p = k === waypoints.length - 1 && a.got.length === lv.babies.length ? [lv.exit[0] + 0.5, lv.exit[1] + 0.5] : waypoints[k]
    const d = headingTo(a, p[0], p[1])
    apply(state, { t: a.tick, d, s: hold ? 0 : precise && dd < 0.09 ? 1 : 4 })
    advance(state, a.tick + 1)
    if (state.att && state.att.tick > 15 * 60 * HZ) return -1
    if (state.att) { if (trace) trace(state.att, k, waypoints) }
  }
  return -1
}

// Which uncollected baby's disc (at its spot, or a wanderer's other spot) a waypoint sits in, or -1.
function discOwner(lv, a, wp) {
  for (let b = 0; b < lv.babies.length; b++) {
    const si = lv.babies[b]
    if (a.got.indexOf(si) >= 0) continue
    const wd = lv.wanderers && lv.wanderers.find((w) => w.baby === b)
    const spots = [lv.spots[si]].concat(wd ? [lv.spots[wd.to]] : [])
    for (const sp of spots) { const ex = sp.x + 0.5 - wp[0], ez = sp.z + 0.5 - wp[1]; if (ex * ex + ez * ez <= 2.3) return b }
  }
  return -1
}

export function routeBot(seed, tier, trace) {
  const state = create(seed, { tier })
  const ticks = walk(state, state.level.solve.route, null, trace)
  return { ticks, optimal: state.level.solve.ticks, ratio: ticks / state.level.solve.ticks }
}

// Shortest cell path from her cell to a target cell, as waypoints.
function pathTo(lv, a, target) {
  const from = Math.floor(a.z) * lv.w + Math.floor(a.x)
  const f = distField(lv, [from])
  if (!isFinite(f.dist[target])) return null
  let c = target; const seg = []
  while (c >= 0) { seg.push(c); c = f.parent[c] }
  seg.reverse()
  return seg.map((i) => { const x = i % lv.w; return [x + 0.5, (i - x) / lv.w + 0.5] })
}

export function searchBot(seed, tier, trace) {
  const state = create(seed, { tier })
  const lv = state.level
  const known = new Map()     // spot index -> true (baby) / false (empty)
  // a wanderer's second spot counts as a baby spot too: she learns it when the kit is there
  const babyAtSpot = (i, tick) => { const b = lv.babies.indexOf(i); if (b >= 0) return true; const wd = lv.wanderers && lv.wanderers.find((w) => w.to === i); return !!wd }
  let plan = null, target = -1
  const until = (st, k) => {
    const a = st.att
    // learn every spot inside the hint radius
    lv.spots.forEach((sp, i) => {
      const dx = sp.x + 0.5 - a.x, dz = sp.z + 0.5 - a.z
      if (dx * dx + dz * dz <= lv.hint * lv.hint) known.set(i, babyAtSpot(i, a.tick))
    })
    // a known baby not yet collected beats an unknown spot
    const gotSpot = (i) => a.got.indexOf(i) >= 0 || (lv.wanderers || []).some((w) => w.to === i && a.got.indexOf(lv.babies[w.baby]) >= 0)
    const want = (i) => known.get(i) === true && !gotSpot(i)
    const unknown = (i) => !known.has(i)
    const allGot = a.got.length === lv.babies.length
    let goal = -1
    if (allGot) goal = -2
    else if (target >= 0 && (want(target) || unknown(target))) goal = target   // keep going: no dithering between two spots
    else {
      let bd = Infinity
      lv.spots.forEach((sp, i) => {
        if (!(want(i) || unknown(i))) return
        const dx = sp.x + 0.5 - a.x, dz = sp.z + 0.5 - a.z, d = dx * dx + dz * dz - (want(i) ? 1e6 : 0)
        if (d < bd) { bd = d; goal = i }
      })
    }
    if (goal === target && plan) return null
    target = goal
    let cell
    if (goal === -2) { const [ex, ez] = lv.exit; cell = [[ex + 1, ez], [ex - 1, ez], [ex, ez + 1], [ex, ez - 1]].find(([x, z]) => lv.grid[z * lv.w + x] === 0 || lv.grid[z * lv.w + x] === 7 || lv.grid[z * lv.w + x] === 4) }
    else {
      // nearest walkable cell within pickup of the spot
      const sp = lv.spots[goal]; let bd = Infinity
      for (let z = sp.z - 2; z <= sp.z + 2; z++) for (let x = sp.x - 2; x <= sp.x + 2; x++) {
        const c = lv.grid[z * lv.w + x]
        if (c !== 0 && c !== 6 && c !== 7 && c !== 4) continue
        const dx = x - sp.x, dz = z - sp.z
        if (dx * dx + dz * dz > PICKUP * PICKUP) continue
        const mx = x + 0.5 - a.x, mz = z + 0.5 - a.z, d = mx * mx + mz * mz
        if (d < bd) { bd = d; cell = [x, z] }
      }
    }
    if (!cell) return null
    plan = pathTo(lv, a, cell[1] * lv.w + cell[0])
    if (!plan) return null
    return { waypoints: plan, k: 0 }
  }
  const ticks = walk(state, [[lv.start[0] + 0.5, lv.start[1] + 0.5]], until, trace)
  return { ticks, optimal: lv.solve.ticks, ratio: ticks / lv.solve.ticks }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tier = process.argv[2] || "tiny", n = Number(process.argv[3] || 20)
  for (const bot of [routeBot, searchBot]) {
    const rs = []
    for (let s = 1; s <= n; s++) rs.push(bot(1000 + s, tier))
    const ratios = rs.map((r) => r.ratio).sort((a, b) => a - b)
    const fail = rs.filter((r) => r.ticks < 0).length
    console.log(`${bot.name.padEnd(10)} ${tier.padEnd(7)} n=${n} unfinished=${fail} ratio min ${ratios[0].toFixed(2)} median ${ratios[n >> 1].toFixed(2)} max ${ratios[n - 1].toFixed(2)} | optimal median ${(rs.map((r) => r.optimal).sort((a, b) => a - b)[n >> 1] / HZ).toFixed(0)}s`)
  }
}
