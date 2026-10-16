// The level generator. Pure: seed + tier + species -> a level the solver has
// checked. Build from the kit, scatter spots on reachable ground, place babies,
// prove every spot and the exit are reachable, then solve for the star times.
//
// A level is { w, h, grid, start, exit, spots, babies, tier, species, ability,
// solve, decor }. `grid` is a flat row-major array of cell codes (sim.mjs C).

import { makeRng } from "../core/rng.mjs"
import { C, passable, cellAt, heightOf, HZ, WANDER_SPEED } from "./sim.mjs"
import { solve, reach } from "./solver.mjs"
import { SPECIES, DEFAULT_SPECIES } from "./kit.mjs"

// hint: metres a hidden baby rustles from (wider on the big maps, where a first run otherwise lands at
// 1.8x optimal). stuck: seconds without a find before the nearest baby rustles from anywhere. The
// wrinkles: mud blobs (half speed), ponds (a wall to a fox), brush patches (tall grass that hides the
// line), sleepers (she has to stay 1.5 s to wake one) and wanderers (a kit that runs between two spots).
export const TIERS = {
  tiny:   { babies: 3,  spots: 6,  size: 20, target: 30,  hint: 5,   stuck: 15, mud: 0, water: 0, brush: 0, sleepers: 0, wanderers: 0 },
  small:  { babies: 5,  spots: 12, size: 30, target: 50,  hint: 5.5, stuck: 20, mud: 2, water: 0, brush: 0, sleepers: 0, wanderers: 0 },
  medium: { babies: 8,  spots: 22, size: 45, target: 90,  hint: 6.5, stuck: 25, mud: 3, water: 1, brush: 2, sleepers: 1, wanderers: 0 },
  big:    { babies: 12, spots: 36, size: 60, target: 120, hint: 7.5, stuck: 30, mud: 4, water: 2, brush: 3, sleepers: 1, wanderers: 1 },
  huge:   { babies: 20, spots: 60, size: 80, target: 180, hint: 8,   stuck: 30, mud: 6, water: 3, brush: 5, sleepers: 2, wanderers: 2 },
}
export const TIER_ORDER = ["tiny", "small", "medium", "big", "huge"]
// The week's ramp: the early days are three babies, the weekend is the big one.
export const WEEK = ["tiny", "tiny", "small", "small", "medium", "big", "huge"]   // Mon..Sun

// Day-of-week of a civil date (0 = Monday) without new Date: Zeller on the proleptic Gregorian calendar.
export function weekday(y, m, d) {
  if (m < 3) { m += 12; y -= 1 }
  const k = y % 100, j = Math.floor(y / 100)
  const h = (d + Math.floor(13 * (m + 1) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7  // 0 = Saturday
  return (h + 5) % 7
}
// 0 = Monday .. 6 = Sunday for a puzzle number (the view picks the time of day from it)
export function weekdayForDay(number, epoch) {
  const [y, m, d] = String(epoch || "2026-10-16").split("-").map(Number)
  return ((weekday(y, m, d) + (number - 1)) % 7 + 7) % 7
}
export function tierForDay(number, epoch) {
  const [y, m, d] = String(epoch || "2026-10-16").split("-").map(Number)
  const wd = (weekday(y, m, d) + (number - 1)) % 7
  return WEEK[(wd + 7) % 7]
}

export function generate(seed, tierName = "tiny", speciesKey = DEFAULT_SPECIES, opts = {}) {
  const tier = TIERS[tierName] || TIERS.tiny
  const species = SPECIES[speciesKey] || SPECIES[DEFAULT_SPECIES]
  const want = Object.assign({}, tier, opts)
  for (let attempt = 0; attempt < 64; attempt++) {
    const rng = makeRng((seed + attempt * 0x9e3779b1) >>> 0)
    const lv = layout(rng, want, species)
    if (!lv) continue
    if (!placeSpots(rng, lv, want)) continue
    if (!placeBabies(rng, lv, want)) continue
    wrinkles(rng, lv, want)
    const sol = solve(lv)
    if (!sol) continue
    lv.solve = { ticks: sol.ticks, t3: sol.t3, t2: sol.t2, dist: Math.floor(sol.dist * 10) / 10, order: sol.order, route: sol.route }
    lv.decor = decorate(rng, lv)
    lv.attempt = attempt
    return lv
  }
  throw new Error("generator could not build a level for seed " + seed)
}

// --- layout -------------------------------------------------------------------

function layout(rng, tier, species) {
  const w = tier.size, h = tier.size
  const grid = new Array(w * h).fill(C.GROUND)
  const lv = { w, h, grid, species: species.mom, ability: species.ability, tier: tier.size, hint: tier.hint || 5, stuck: tier.stuck || 30, spots: [], babies: [], sleepers: [], wanderers: [] }
  const set = (x, z, c) => { if (x >= 0 && z >= 0 && x < w && z < h) grid[z * w + x] = c }
  const get = (x, z) => cellAt(lv, x, z)

  // a ragged tree border
  for (let x = 0; x < w; x++) for (let z = 0; z < h; z++) {
    if (x === 0 || z === 0 || x === w - 1 || z === h - 1) set(x, z, C.TREE)
    else if ((x === 1 || z === 1 || x === w - 2 || z === h - 2) && rng.chance(0.45)) set(x, z, C.TREE)
  }
  // tree clumps: random walks
  const clumps = Math.floor(w * h / 70)
  for (let i = 0; i < clumps; i++) {
    let x = rng.int(2, w - 3), z = rng.int(2, h - 3)
    const n = rng.int(3, 10)
    for (let k = 0; k < n; k++) {
      set(x, z, C.TREE)
      const d = rng.int(0, 3)
      x += d === 0 ? 1 : d === 1 ? -1 : 0; z += d === 2 ? 1 : d === 3 ? -1 : 0
      x = Math.max(2, Math.min(w - 3, x)); z = Math.max(2, Math.min(h - 3, z))
    }
  }
  // rocks
  const rocks = Math.floor(w * h / 90)
  for (let i = 0; i < rocks; i++) set(rng.int(2, w - 3), rng.int(2, h - 3), C.ROCK)

  // platforms: raised rectangles with one or two ramps
  const plats = Math.max(1, Math.floor(w / 15))
  for (let i = 0; i < plats; i++) {
    const pw = rng.int(4, Math.max(5, Math.floor(w / 4))), ph = rng.int(4, Math.max(5, Math.floor(h / 4)))
    const px = rng.int(3, w - 3 - pw), pz = rng.int(3, h - 3 - ph)
    if (px < 3 || pz < 3) continue
    for (let x = px; x < px + pw; x++) for (let z = pz; z < pz + ph; z++) set(x, z, C.PLATFORM)
    const ramps = rng.int(1, 2)
    for (let r = 0; r < ramps; r++) {
      const side = rng.int(0, 3)
      let rx, rz
      if (side === 0) { rx = rng.int(px, px + pw - 1); rz = pz - 1 }
      else if (side === 1) { rx = rng.int(px, px + pw - 1); rz = pz + ph }
      else if (side === 2) { rx = px - 1; rz = rng.int(pz, pz + ph - 1) }
      else { rx = px + pw; rz = rng.int(pz, pz + ph - 1) }
      if (get(rx, rz) === C.GROUND) set(rx, rz, C.RAMP)
    }
  }

  // the wrinkles: ponds (thick blobs), mud (thin walks) and brush (thin walks), on open ground only
  const blob = (code, n, len, thick) => {
    for (let i = 0; i < n; i++) {
      let x = rng.int(3, w - 4), z = rng.int(3, h - 4)
      const steps = rng.int(len[0], len[1])
      for (let k = 0; k < steps; k++) {
        for (let dx = -thick; dx <= thick; dx++) for (let dz = -thick; dz <= thick; dz++) {
          if (thick && dx && dz && rng.chance(0.4)) continue   // ragged corners
          if (get(x + dx, z + dz) === C.GROUND && x + dx > 1 && z + dz > 1 && x + dx < w - 2 && z + dz < h - 2) set(x + dx, z + dz, code)
        }
        const d = rng.int(0, 3)
        x += d === 0 ? 1 : d === 1 ? -1 : 0; z += d === 2 ? 1 : d === 3 ? -1 : 0
        x = Math.max(3, Math.min(w - 4, x)); z = Math.max(3, Math.min(h - 4, z))
      }
    }
  }
  blob(C.WATER, tier.water || 0, [3, 6], 1)
  blob(C.MUD, tier.mud || 0, [5, 12], 0)
  blob(C.BRUSH, tier.brush || 0, [6, 14], 0)

  // ability terrain: fence lines anchored on the border, with a gap or two a fox can squeeze through.
  // Anchoring both ends on the edge makes the gap a real shortcut; an open end is just a wall to walk round.
  if (species.ability === "squeeze") {
    const lines = Math.max(1, Math.floor(w / 14))
    for (let i = 0; i < lines; i++) {
      const vertical = rng.chance(0.5)
      const at = rng.int(Math.floor(w * 0.25), Math.floor(w * 0.75))
      const len = rng.int(Math.floor(w * 0.5), w - 2)
      const from = rng.chance(0.5) ? 1 : w - 1 - len
      const gaps = new Set()
      const ng = rng.int(1, 2)
      for (let g = 0; g < ng; g++) gaps.add(rng.int(from + 2, from + len - 3))
      for (let k = from; k < from + len; k++) {
        const x = vertical ? at : k, z = vertical ? k : at
        if (x <= 0 || z <= 0 || x >= w - 1 || z >= h - 1) continue
        const c = get(x, z)
        if (c === C.PLATFORM || c === C.RAMP || c === C.WATER) continue
        set(x, z, gaps.has(k) ? C.GAP : C.FENCE)
      }
    }
  }

  // start: a ground cell near one edge
  const edge = rng.int(0, 3)
  let sx, sz, tries = 0
  do {
    sx = edge === 2 ? rng.int(2, 4) : edge === 3 ? rng.int(w - 5, w - 3) : rng.int(2, w - 3)
    sz = edge === 0 ? rng.int(2, 4) : edge === 1 ? rng.int(h - 5, h - 3) : rng.int(2, h - 3)
  } while (get(sx, sz) !== C.GROUND && ++tries < 200)
  if (get(sx, sz) !== C.GROUND) return null
  lv.start = [sx, sz]
  // clear a little room around the start so she never spawns boxed in
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (get(sx + dx, sz + dz) !== C.GROUND && get(sx + dx, sz + dz) !== C.GAP) set(sx + dx, sz + dz, C.GROUND)

  // reachability: enough of the map must be hers, and the pockets she cannot reach get filled
  let dist = reach(lv)
  let walk = 0, reached = 0
  for (let i = 0; i < w * h; i++) if (passable(grid[i], lv.ability)) { walk++; if (isFinite(dist[i])) reached++ }
  if (reached < walk * 0.6 || reached < w * h * 0.3) return null
  for (let i = 0; i < w * h; i++) if (passable(grid[i], lv.ability) && !isFinite(dist[i])) grid[i] = C.TREE

  // exit: a reachable ground cell in the far 40% of the walk, then it becomes a blocker (the den)
  const far = []
  let maxd = 0
  for (let i = 0; i < w * h; i++) if (isFinite(dist[i]) && dist[i] > maxd) maxd = dist[i]
  for (let i = 0; i < w * h; i++) if (grid[i] === C.GROUND && isFinite(dist[i]) && dist[i] >= maxd * 0.6) far.push(i)
  if (!far.length) return null
  for (let t = 0; t < 40; t++) {
    const i = rng.pick(far), x = i % w, z = (i - x) / w
    if (x < 2 || z < 2 || x > w - 3 || z > h - 3) continue
    grid[i] = C.EXIT
    if (connected(lv, reached - 1)) { lv.exit = [x, z]; break }
    grid[i] = C.GROUND
  }
  if (!lv.exit) return null
  return lv
}

// After blocking one cell: is everything still reachable from the start, and the exit touchable?
function connected(lv, expect) {
  const dist = reach(lv)
  let n = 0
  for (let i = 0; i < lv.w * lv.h; i++) if (passable(lv.grid[i], lv.ability) && isFinite(dist[i])) n++
  if (n !== expect) return false
  if (lv.exit) {
    const [ex, ez] = lv.exit
    let ok = false
    for (let dx = -1; dx <= 1 && !ok; dx++) for (let dz = -1; dz <= 1 && !ok; dz++) {
      if (!dx && !dz) continue
      const i = (ez + dz) * lv.w + ex + dx
      if (passable(lv.grid[i], lv.ability) && isFinite(dist[i])) ok = true
    }
    if (!ok) return false
  }
  return true
}

// --- spots --------------------------------------------------------------------

function placeSpots(rng, lv, tier) {
  const { w, h, grid } = lv
  const dist = reach(lv)
  let reached = 0
  for (let i = 0; i < w * h; i++) if (passable(grid[i], lv.ability) && isFinite(dist[i])) reached++
  const cands = []
  for (let i = 0; i < w * h; i++) {
    const x = i % w, z = (i - x) / w
    if (grid[i] !== C.GROUND && grid[i] !== C.PLATFORM) continue
    if (!isFinite(dist[i])) continue
    if (x < 2 || z < 2 || x > w - 3 || z > h - 3) continue
    if (Math.abs(x - lv.start[0]) < 3 && Math.abs(z - lv.start[1]) < 3) continue
    cands.push(i)
  }
  const order = rng.shuffle(cands)
  const minGap = tier.size <= 20 ? 3 : 4
  const kinds = SPECIES[lv.species].spots.length
  for (const i of order) {
    if (lv.spots.length >= tier.spots) break
    const x = i % w, z = (i - x) / w
    if (lv.spots.some((s) => Math.abs(s.x - x) < minGap && Math.abs(s.z - z) < minGap)) continue
    if (grid[i] !== C.GROUND && grid[i] !== C.PLATFORM) continue
    const was = grid[i]
    grid[i] = C.SPOT
    if (!connected(lv, reached - 1)) { grid[i] = was; continue }
    reached--
    lv.spots.push({ x, z, kind: rng.int(0, kinds - 1), raised: was === C.PLATFORM ? 1 : 0, face: rng.int(0, 3) })
  }
  return lv.spots.length === tier.spots
}

// --- babies -------------------------------------------------------------------

// Spread the babies out (farthest-point sampling on a random start), then make sure the ability
// matters: without it the optimal route must be at least 10% longer, or unreachable.
function placeBabies(rng, lv, tier) {
  const S = lv.spots.length, B = tier.babies
  if (B > S) return false
  for (let t = 0; t < 12; t++) {
    const picked = [rng.int(0, S - 1)]
    while (picked.length < B) {
      let bi = -1, bd = -1
      for (let i = 0; i < S; i++) {
        if (picked.indexOf(i) >= 0) continue
        let md = Infinity
        for (const p of picked) { const dx = lv.spots[i].x - lv.spots[p].x, dz = lv.spots[i].z - lv.spots[p].z; md = Math.min(md, dx * dx + dz * dz) }
        md += rng.float(0, 8)   // a little noise so the layout is not always the convex hull
        if (md > bd) { bd = md; bi = i }
      }
      picked.push(bi)
    }
    lv.babies = picked
    const withA = solve(lv)
    if (!withA) continue
    const without = solve(lv, "none")
    if (!without || without.dist >= withA.dist * 1.1) return true
  }
  return false
}

// --- sleepers and wanderers ---------------------------------------------------

// A wanderer needs an empty spot 3..8 m away with a clear straight run between the two at the same
// height. A sleeper is any other baby.
function wrinkles(rng, lv, tier) {
  const B = lv.babies.length
  const taken = new Set()
  const want = Math.min(tier.wanderers || 0, B - 1)
  const order = rng.shuffle(lv.babies.map((_, b) => b))
  for (const b of order) {
    if (lv.wanderers.length >= want) break
    const sp = lv.spots[lv.babies[b]]
    const cands = []
    lv.spots.forEach((o, i) => {
      if (lv.babies.indexOf(i) >= 0 || lv.wanderers.some((w) => w.to === i)) return
      if (o.raised !== sp.raised) return
      const dx = o.x - sp.x, dz = o.z - sp.z, d = Math.sqrt(dx * dx + dz * dz)
      if (d < 3 || d > 8) return
      if (!clearRun(lv, sp, o)) return
      cands.push({ i, d })
    })
    if (!cands.length) continue
    const c = rng.pick(cands)
    lv.wanderers.push({ baby: b, to: c.i, dash: Math.floor(c.d / WANDER_SPEED * HZ + 0.999999) })
    taken.add(b)
  }
  const rest = order.filter((b) => !taken.has(b))
  for (let k = 0; k < (tier.sleepers || 0) && k < rest.length; k++) lv.sleepers.push(rest[k])
  lv.sleepers.sort((a, b) => a - b)
}
function clearRun(lv, a, b) {
  const hgt = a.raised ? 1 : 0
  const ax = a.x + 0.5, az = a.z + 0.5, bx = b.x + 0.5, bz = b.z + 0.5
  const dx = bx - ax, dz = bz - az, d = Math.sqrt(dx * dx + dz * dz)
  const nx = -dz / d * 0.3, nz = dx / d * 0.3
  const n = Math.ceil(d / 0.2)
  for (let k = 0; k <= n; k++) {
    const f = k / n
    for (const side of [-1, 0, 1]) {
      const x = Math.floor(ax + dx * f + nx * side), z = Math.floor(az + dz * f + nz * side)
      if ((x === a.x && z === a.z) || (x === b.x && z === b.z)) continue
      const c = cellAt(lv, x, z)
      if (!passable(c, lv.ability) || c === C.RAMP || heightOf(c) !== hgt) return false
    }
  }
  return true
}

// --- decoration ---------------------------------------------------------------

// View-only dressing on ground cells: flowers, grass, mushrooms. Kept in the level so a replay
// and a splash draw the same forest.
function decorate(rng, lv) {
  const out = []
  for (let i = 0; i < lv.w * lv.h; i++) {
    if (lv.grid[i] !== C.GROUND && lv.grid[i] !== C.PLATFORM) continue
    if (!rng.chance(0.12)) continue
    const x = i % lv.w, z = (i - x) / lv.w
    out.push([x, z, rng.int(0, 5), rng.int(0, 3)])   // kind, turn
  }
  return out
}
