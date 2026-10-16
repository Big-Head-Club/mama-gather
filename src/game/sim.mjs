// The simulation. PURE and bit-portable: no DOM, no clock, no Math.random, and
// nothing from Math but sqrt/abs/floor/min/max, so the browser and the server
// walk a mom through the same level and land on the same tick.
//
// One attempt = mom walking a level. Input is a heading (one of 32) and a
// speed step (0..4). Babies join when mom is within PICKUP of where they are;
// a sleeper needs her inside its disc for SLEEP_TICKS in a row; a wanderer is
// wherever its timer says it is. The attempt ends the tick she touches the
// exit with every baby behind her.

export const HZ = 30                 // ticks per second
export const SPEED = 3.0             // m/s at full stick
export const MOM_R = 0.34            // half-width of the box she collides with
export const PICKUP = 1.5            // m from a spot's centre
export const HINT = 5                // m: default hint radius (a tier sets its own on the level)
export const EXIT_R = 1.0            // m from the exit's centre
export const STUCK_TICKS = 30 * HZ   // default stuck assist (a tier sets its own on the level)
export const MAX_TICKS = 20 * 60 * HZ
export const NDIRS = 32
export const SLEEP_TICKS = 45        // a sleeper wakes after this long with her inside its disc
export const WANDER_DWELL = 6 * HZ   // a wanderer sits in a spot this long before running to the other
export const WANDER_SPEED = 2.0      // m/s on the run between its two spots

// Unit vectors for the 32 headings, 11.25 degrees apart, as literals so no
// trig runs on either side. Heading 0 is +x, 8 is +z.
export const DIRS = [
  [1, 0], [0.98078528, 0.19509032], [0.92387953, 0.38268343], [0.83146961, 0.55557023],
  [0.70710678, 0.70710678], [0.55557023, 0.83146961], [0.38268343, 0.92387953], [0.19509032, 0.98078528],
  [0, 1], [-0.19509032, 0.98078528], [-0.38268343, 0.92387953], [-0.55557023, 0.83146961],
  [-0.70710678, 0.70710678], [-0.83146961, 0.55557023], [-0.92387953, 0.38268343], [-0.98078528, 0.19509032],
  [-1, 0], [-0.98078528, -0.19509032], [-0.92387953, -0.38268343], [-0.83146961, -0.55557023],
  [-0.70710678, -0.70710678], [-0.55557023, -0.83146961], [-0.38268343, -0.92387953], [-0.19509032, -0.98078528],
  [0, -1], [0.19509032, -0.98078528], [0.38268343, -0.92387953], [0.55557023, -0.83146961],
  [0.70710678, -0.70710678], [0.83146961, -0.55557023], [0.92387953, -0.38268343], [0.98078528, -0.19509032],
]

// Cell codes. The grid is a flat array of these, row-major, z * w + x.
//   MUD slows her to half. GAP (a hole in a fence) is a squeeze: slower still, and only with the ability.
//   WATER is a wall unless she swims. BRUSH is tall grass: walkable by all, it hides the line (view only).
export const C = {
  GROUND: 0, TREE: 1, ROCK: 2, FENCE: 3, GAP: 4, SPOT: 5, PLATFORM: 6, RAMP: 7, EXIT: 8,
  WATER: 9, MUD: 10, BRUSH: 11,
}
export const NAMES = Object.fromEntries(Object.entries(C).map(([k, v]) => [v, k]))

export const heightOf = (c) => (c === C.PLATFORM ? 1 : c === C.RAMP ? 0.5 : 0)
// How fast she moves with her centre in a cell of this code, as a fraction of SPEED.
export const speedOf = (c) => (c === C.MUD ? 0.5 : c === C.GAP ? 0.4 : 1)

// Can a mom with this ability stand in a cell of this code?
export function passable(c, ability) {
  switch (c) {
    case C.GROUND: case C.PLATFORM: case C.RAMP: case C.MUD: case C.BRUSH: return true
    case C.GAP: return ability === "squeeze"
    case C.WATER: return ability === "swim"
    default: return false
  }
}

export const cellAt = (lv, x, z) => (x < 0 || z < 0 || x >= lv.w || z >= lv.h ? C.TREE : lv.grid[z * lv.w + x])

// Can she step from a cell of height ha into cell code c? Ramps are the only
// way between the ground and a platform.
function enterable(lv, ha, x, z, ability) {
  const c = cellAt(lv, x, z)
  if (!passable(c, ability)) return false
  const d = heightOf(c) - ha
  return d <= 0.5 && d >= -0.5
}

export function newAttempt(lv) {
  return {
    x: lv.start[0] + 0.5, z: lv.start[1] + 0.5,
    d: 8, s: 0,                       // heading and speed step in force
    tick: 0, started: false,          // the clock runs from the first push
    px: lv.start[0] + 0.5, pz: lv.start[1] + 0.5,   // where she was at the start of this tick (the view draws between the two)
    got: [], gotAt: [],               // spot indexes in the order they joined, and when
    dwell: lv.babies.map(() => 0),    // per baby: ticks in a row she has been inside its disc (sleepers)
    lastFind: 0,
    done: false, doneAt: -1,
    path: [[lv.start[0] + 0.5, lv.start[1] + 0.5, 0]],   // breadcrumbs every ~0.5 m with the tick, for the card and the ghost
    pathAcc: 0,
  }
}

export const terminal = (a) => a.done || a.tick >= MAX_TICKS

// Where baby b (index into lv.babies) is at this tick: its spot's centre, or, for a wanderer, wherever
// its timer has it. Pure in the tick.
export function babyAt(lv, b, tick) {
  const sp = lv.spots[lv.babies[b]]
  const wd = lv.wanderers && lv.wanderers.find((w) => w.baby === b)
  if (!wd) return { x: sp.x + 0.5, z: sp.z + 0.5, moving: false, at: 0 }
  const to = lv.spots[wd.to]
  const dash = wd.dash
  const period = 2 * (WANDER_DWELL + dash)
  const ph = ((tick % period) + period) % period
  if (ph < WANDER_DWELL) return { x: sp.x + 0.5, z: sp.z + 0.5, moving: false, at: 0 }
  if (ph < WANDER_DWELL + dash) { const f = (ph - WANDER_DWELL) / dash; return { x: sp.x + 0.5 + (to.x - sp.x) * f, z: sp.z + 0.5 + (to.z - sp.z) * f, moving: true, at: -1, f } }
  if (ph < 2 * WANDER_DWELL + dash) return { x: to.x + 0.5, z: to.z + 0.5, moving: false, at: 1 }
  const f = (ph - 2 * WANDER_DWELL - dash) / dash
  return { x: to.x + 0.5 + (sp.x - to.x) * f, z: to.z + 0.5 + (sp.z - to.z) * f, moving: true, at: -1, f }
}
export const isSleeper = (lv, b) => !!(lv.sleepers && lv.sleepers.indexOf(b) >= 0)

// One tick. Input is already set on the attempt (d, s).
export function step(lv, a) {
  if (terminal(a)) return
  if (!a.started) { if (a.s > 0) a.started = true; else return }
  a.tick++
  a.px = a.x; a.pz = a.z
  if (a.s > 0) {
    const here = cellAt(lv, Math.floor(a.x), Math.floor(a.z))
    const sp = (a.s / 4) * SPEED * speedOf(here) / HZ
    const vx = DIRS[a.d][0] * sp, vz = DIRS[a.d][1] * sp
    const ability = lv.ability
    const r = MOM_R
    const h0 = heightOf(here)
    // x, then z, each slid back if any corner of her box lands somewhere she cannot stand
    let nx = a.x + vx
    if (!boxFree(lv, h0, nx, a.z, r, ability)) nx = a.x
    let nz = a.z + vz
    if (!boxFree(lv, h0, nx, nz, r, ability)) nz = a.z
    const dx = nx - a.x, dz = nz - a.z
    a.x = nx; a.z = nz
    const moved = Math.sqrt(dx * dx + dz * dz)
    a.pathAcc += moved
    if (a.pathAcc >= 0.5) { a.path.push([r2(a.x), r2(a.z), a.tick]); a.pathAcc = 0 }
  }
  // babies within reach join, in baby order (one tick could reach two)
  for (let i = 0; i < lv.babies.length; i++) {
    const si = lv.babies[i]
    if (a.got.indexOf(si) >= 0) continue
    const p = babyAt(lv, i, a.tick)
    const ex = p.x - a.x, ez = p.z - a.z
    const inside = ex * ex + ez * ez <= PICKUP * PICKUP
    if (!inside) { a.dwell[i] = 0; continue }
    a.dwell[i]++
    if (isSleeper(lv, i) && a.dwell[i] < SLEEP_TICKS) continue
    a.got.push(si); a.gotAt.push(a.tick); a.lastFind = a.tick
  }
  if (a.got.length === lv.babies.length) {
    const ex = lv.exit[0] + 0.5 - a.x, ez = lv.exit[1] + 0.5 - a.z
    if (ex * ex + ez * ez <= EXIT_R * EXIT_R) { a.done = true; a.doneAt = a.tick; a.path.push([r2(a.x), r2(a.z), a.tick]) }
  }
}

function boxFree(lv, h0, x, z, r, ability) {
  return enterable(lv, h0, Math.floor(x - r), Math.floor(z - r), ability)
    && enterable(lv, h0, Math.floor(x + r), Math.floor(z - r), ability)
    && enterable(lv, h0, Math.floor(x - r), Math.floor(z + r), ability)
    && enterable(lv, h0, Math.floor(x + r), Math.floor(z + r), ability)
}

const r2 = (v) => Math.floor(v * 100 + 0.5) / 100

// Advance to `tick` with the input in force.
export function advanceTo(lv, a, tick) {
  while (a.tick < tick && !terminal(a)) {
    if (!a.started) return             // the clock has not started; nothing to advance
    step(lv, a)
  }
}

// Her height above the ground plane, for the view.
export function momHeight(lv, a) {
  const c = cellAt(lv, Math.floor(a.x), Math.floor(a.z))
  if (c !== C.RAMP) return heightOf(c)
  // on a ramp: 0 at the low edge, 1 at the platform edge
  const x = Math.floor(a.x), z = Math.floor(a.z)
  const up = rampUp(lv, x, z)
  const fx = a.x - x - 0.5, fz = a.z - z - 0.5
  return Math.min(1, Math.max(0, 0.5 + fx * up[0] + fz * up[1]))
}

// Which way a ramp cell rises: toward its platform neighbour.
export function rampUp(lv, x, z) {
  if (cellAt(lv, x + 1, z) === C.PLATFORM) return [1, 0]
  if (cellAt(lv, x - 1, z) === C.PLATFORM) return [-1, 0]
  if (cellAt(lv, x, z + 1) === C.PLATFORM) return [0, 1]
  return [0, -1]
}
