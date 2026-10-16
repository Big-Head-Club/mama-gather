// The solver. Pure. Shortest walk from the start, through every baby's pickup
// radius, to the exit, on an 8-connected grid with no corner cutting, so every
// route it finds is one the sim's box-collided mom can actually walk. Its time
// is therefore an upper bound on the true optimum, which keeps the star
// thresholds honest: a player can always do at least this well.

import { C, passable, heightOf, cellAt, PICKUP, EXIT_R, SPEED, HZ } from "./sim.mjs"

const SQRT2 = 1.4142135623730951
export const STAR3 = 1.25, STAR2 = 1.75

// Multi-source Dijkstra over walkable cells. Returns Float64Array of distances
// (Infinity where unreachable) and an Int32Array of parents.
export function distField(lv, sources, ability = lv.ability) {
  const { w, h, grid } = lv
  const n = w * h
  const dist = new Float64Array(n).fill(Infinity)
  const parent = new Int32Array(n).fill(-1)
  // binary heap of [d, idx]
  const hd = [], hi = []
  const push = (d, i) => {
    let k = hd.length; hd.push(d); hi.push(i)
    while (k > 0) { const p = (k - 1) >> 1; if (hd[p] <= hd[k]) break; swap(k, p); k = p }
  }
  const swap = (a, b) => { let t = hd[a]; hd[a] = hd[b]; hd[b] = t; t = hi[a]; hi[a] = hi[b]; hi[b] = t }
  const pop = () => {
    const d = hd[0], i = hi[0]
    const ld = hd.pop(), li = hi.pop()
    if (hd.length) {
      hd[0] = ld; hi[0] = li
      let k = 0
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k
        if (l < hd.length && hd[l] < hd[m]) m = l
        if (r < hd.length && hd[r] < hd[m]) m = r
        if (m === k) break
        swap(k, m); k = m
      }
    }
    return [d, i]
  }
  for (const s of sources) { if (dist[s] > 0) { dist[s] = 0; push(0, s) } }
  const ok = (i) => passable(grid[i], ability)
  while (hd.length) {
    const [d, i] = pop()
    if (d > dist[i]) continue
    const x = i % w, z = (i - x) / w
    const hz = heightOf(grid[i])
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
      const j = nz * w + nx
      if (!ok(j)) continue
      const dh = heightOf(grid[j]) - hz
      if (dh > 0.5 || dh < -0.5) continue
      let cost = 1
      if (dx && dz) {
        // no corner cutting: both orthogonal neighbours must be walkable at a compatible height
        const a = z * w + nx, b = nz * w + x
        if (!ok(a) || !ok(b)) continue
        const ha = heightOf(grid[a]) - hz, hb = heightOf(grid[b]) - hz
        if (ha > 0.5 || ha < -0.5 || hb > 0.5 || hb < -0.5) continue
        cost = SQRT2
      }
      const nd = d + cost
      if (nd < dist[j]) { dist[j] = nd; parent[j] = i; push(nd, j) }
    }
  }
  return { dist, parent }
}

// The walkable cells whose centre is within PICKUP of a spot's centre.
export function pickupCells(lv, spot, ability = lv.ability) {
  const out = []
  const r = Math.floor(PICKUP) + 1
  for (let z = spot.z - r; z <= spot.z + r; z++) for (let x = spot.x - r; x <= spot.x + r; x++) {
    if (x < 0 || z < 0 || x >= lv.w || z >= lv.h) continue
    if (!passable(cellAt(lv, x, z), ability)) continue
    const dx = x - spot.x, dz = z - spot.z
    if (dx * dx + dz * dz <= PICKUP * PICKUP) out.push(z * lv.w + x)
  }
  return out
}
export function exitCells(lv, ability = lv.ability) {
  return pickupCells(lv, { x: lv.exit[0], z: lv.exit[1] }, ability).filter((i) => {
    const x = i % lv.w, z = (i - x) / lv.w
    const dx = x - lv.exit[0], dz = z - lv.exit[1]
    return dx * dx + dz * dz <= EXIT_R * EXIT_R
  })
}

// Solve. Returns { dist (cells), ticks, t3, t2, order (baby indexes), route ([[x,z]...] cell centres) }
// or null when some baby or the exit cannot be reached.
//
// A baby is picked up at whichever cell of its disc the walk reaches first, and the walk carries
// on from THAT cell, so the tour is searched over cells, not discs: a disc that straddles a cliff
// would otherwise let the route arrive below and leave above. Exact over (visited, last baby,
// cell) up to 10 babies; nearest neighbour + 2-opt on the order above that, with the cells of a
// fixed order chosen by a chain DP.
export function solve(lv, ability = lv.ability) {
  const startIdx = lv.start[1] * lv.w + lv.start[0]
  const discs = lv.babies.map((si) => pickupCells(lv, lv.spots[si], ability))
  const exits = exitCells(lv, ability)
  if (discs.some((c) => !c.length) || !exits.length) return null
  const B = discs.length
  // every cell a leg can start from: the start, then each disc's cells
  const cells = [startIdx]; const owner = [-1]
  discs.forEach((d, b) => { for (const c of d) { cells.push(c); owner.push(b) } })
  const fields = cells.map((c) => distField(lv, [c], ability))
  const M = cells.length
  // leg cost from cell i to cell j (both indexes into cells), and to the best exit cell
  const dTo = (i, j) => fields[i].dist[cells[j]]
  const dExit = (i) => { let best = Infinity, bc = -1; for (const c of exits) if (fields[i].dist[c] < best) { best = fields[i].dist[c]; bc = c } return [best, bc] }
  for (let b = 0; b < B; b++) { let ok = false; for (let j = 1; j < M; j++) if (owner[j] === b && isFinite(dTo(0, j))) ok = true; if (!ok) return null }
  let seq   // indexes into cells, start first, one per baby
  if (B <= 10) seq = exact(B, M, owner, dTo, dExit)
  else seq = heuristic(B, M, owner, dTo, dExit)
  if (!seq) return null
  // total and route
  let total = 0
  const route = []
  const pushSeg = (f, target) => {
    let c = target; const seg = []
    while (c >= 0) { seg.push(c); c = f.parent[c] }
    seg.reverse()
    for (let i = (route.length ? 1 : 0); i < seg.length; i++) { const x = seg[i] % lv.w; route.push([x + 0.5, (seg[i] - x) / lv.w + 0.5]) }
  }
  for (let k = 0; k + 1 < seq.length; k++) { total += dTo(seq[k], seq[k + 1]); pushSeg(fields[seq[k]], cells[seq[k + 1]]) }
  const [ed, ec] = dExit(seq[seq.length - 1])
  total += ed; pushSeg(fields[seq[seq.length - 1]], ec)
  const order = seq.slice(1).map((i) => owner[i])
  const ticks = Math.floor(total / SPEED * HZ + 0.999999)
  return { dist: total, ticks, t3: Math.floor(ticks * STAR3), t2: Math.floor(ticks * STAR2), order, route }
}

// Held-Karp over (mask of babies, cell last stood on).
function exact(B, M, owner, dTo, dExit) {
  const FULL = 1 << B
  const best = new Float64Array(FULL * M).fill(Infinity)
  const from = new Int32Array(FULL * M).fill(-1)
  for (let j = 1; j < M; j++) best[(1 << owner[j]) * M + j] = dTo(0, j)
  for (let m = 1; m < FULL; m++) for (let i = 1; i < M; i++) {
    const cur = best[m * M + i]
    if (!isFinite(cur) || !(m & (1 << owner[i]))) continue
    for (let j = 1; j < M; j++) {
      const ob = 1 << owner[j]
      if (m & ob) continue
      const nd = cur + dTo(i, j)
      const k = (m | ob) * M + j
      if (nd < best[k]) { best[k] = nd; from[k] = i }
    }
  }
  let bi = -1, bd = Infinity
  const full = FULL - 1
  for (let i = 1; i < M; i++) { const d = best[full * M + i] + dExit(i)[0]; if (d < bd) { bd = d; bi = i } }
  if (bi < 0) return null
  const seq = []
  let m = full, i = bi
  while (i > 0) { seq.push(i); const p = from[m * M + i]; m &= ~(1 << owner[i]); i = p }
  seq.push(0)
  return seq.reverse()
}

// Order by nearest neighbour then 2-opt; cells for a fixed order by a chain DP.
function heuristic(B, M, owner, dTo, dExit) {
  const byBaby = []; for (let b = 0; b < B; b++) byBaby.push([])
  for (let j = 1; j < M; j++) byBaby[owner[j]].push(j)
  const chain = (order) => {
    // Viterbi: best cost to stand on each cell of baby order[k]
    let prev = new Map([[0, 0]]), back = []
    for (const b of order) {
      const cur = new Map(), bk = new Map()
      for (const j of byBaby[b]) {
        let bd = Infinity, bp = -1
        for (const [i, d] of prev) { const nd = d + dTo(i, j); if (nd < bd) { bd = nd; bp = i } }
        cur.set(j, bd); bk.set(j, bp)
      }
      prev = cur; back.push(bk)
    }
    let bd = Infinity, bi = -1
    for (const [i, d] of prev) { const nd = d + dExit(i)[0]; if (nd < bd) { bd = nd; bi = i } }
    if (bi < 0) return { cost: Infinity, seq: null }
    const seq = [bi]
    for (let k = back.length - 1; k >= 0; k--) seq.push(back[k].get(seq[seq.length - 1]))
    return { cost: bd, seq: seq.reverse() }
  }
  // nearest neighbour on babies, using the nearest cell of each
  const left = new Set(); for (let b = 0; b < B; b++) left.add(b)
  let order = [], at = 0
  while (left.size) {
    let bb = -1, bd = Infinity, bc = -1
    for (const b of left) for (const j of byBaby[b]) { const d = dTo(at, j); if (d < bd) { bd = d; bb = b; bc = j } }
    if (bb < 0) return null
    order.push(bb); left.delete(bb); at = bc
  }
  let best = chain(order)
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
      const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1))
      const r = chain(cand)
      if (r.cost < best.cost - 1e-9) { best = r; order = cand; improved = true }
    }
  }
  return best.seq
}

// Reachability from the start for this ability: the set of walkable cells she can get to.
export function reach(lv, ability = lv.ability) {
  const f = distField(lv, [lv.start[1] * lv.w + lv.start[0]], ability)
  return f.dist
}
