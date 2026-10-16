// The simulation. PURE and bit-portable: no DOM, no clock, no Math.random, and
// nothing from Math but sqrt/abs/floor/min/max, so the browser and the server
// walk a mom through the same level and land on the same tick.
//
// One attempt = mom walking a level. Input is a heading (one of 32) and a
// speed step (0..4). Babies join when mom is within PICKUP of their spot; the
// attempt ends the tick she touches the exit with every baby behind her.

export const HZ = 30                 // ticks per second
export const SPEED = 3.0             // m/s at full stick
export const MOM_R = 0.34            // half-width of the box she collides with
export const PICKUP = 1.5            // m from a spot's centre
export const HINT = 5                // m: a spot with a baby rustles inside this
export const EXIT_R = 1.0            // m from the exit's centre
export const STUCK_TICKS = 30 * HZ   // no find for this long: the nearest spot rustles from anywhere
export const MAX_TICKS = 20 * 60 * HZ
export const NDIRS = 32

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
export const C = {
  GROUND: 0, TREE: 1, ROCK: 2, FENCE: 3, GAP: 4, SPOT: 5, PLATFORM: 6, RAMP: 7, EXIT: 8,
  WATER: 9, MUD: 10, BRUSH: 11,
}
export const NAMES = Object.fromEntries(Object.entries(C).map(([k, v]) => [v, k]))

export const heightOf = (c) => (c === C.PLATFORM ? 1 : c === C.RAMP ? 0.5 : 0)

// Can a mom with this ability stand in a cell of this code?
export function passable(c, ability) {
  switch (c) {
    case C.GROUND: case C.PLATFORM: case C.RAMP: case C.MUD: return true
    case C.GAP: return ability === "squeeze"
    case C.WATER: return ability === "swim"
    case C.BRUSH: return ability === "shove"
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
    lastFind: 0,
    done: false, doneAt: -1,
    path: [[lv.start[0] + 0.5, lv.start[1] + 0.5]],   // breadcrumbs every ~0.5 m, for the share card
    pathAcc: 0,
  }
}

export const terminal = (a) => a.done || a.tick >= MAX_TICKS

// One tick. Input is already set on the attempt (d, s).
export function step(lv, a) {
  if (terminal(a)) return
  if (!a.started) { if (a.s > 0) a.started = true; else return }
  a.tick++
  a.px = a.x; a.pz = a.z
  if (a.s > 0) {
    const sp = (a.s / 4) * SPEED / HZ
    const vx = DIRS[a.d][0] * sp, vz = DIRS[a.d][1] * sp
    const ability = lv.ability
    const r = MOM_R
    const h0 = heightOf(cellAt(lv, Math.floor(a.x), Math.floor(a.z)))
    // x, then z, each slid back if any corner of her box lands somewhere she cannot stand
    let nx = a.x + vx
    if (!boxFree(lv, h0, nx, a.z, r, ability)) nx = a.x
    let nz = a.z + vz
    if (!boxFree(lv, h0, nx, nz, r, ability)) nz = a.z
    const dx = nx - a.x, dz = nz - a.z
    a.x = nx; a.z = nz
    const moved = Math.sqrt(dx * dx + dz * dz)
    a.pathAcc += moved
    if (a.pathAcc >= 0.5) { a.path.push([r2(a.x), r2(a.z)]); a.pathAcc = 0 }
  }
  // babies within reach join, in spot order (one tick could reach two)
  for (let i = 0; i < lv.babies.length; i++) {
    const si = lv.babies[i]
    if (a.got.indexOf(si) >= 0) continue
    const sp = lv.spots[si]
    const ex = sp.x + 0.5 - a.x, ez = sp.z + 0.5 - a.z
    if (ex * ex + ez * ez <= PICKUP * PICKUP) { a.got.push(si); a.gotAt.push(a.tick); a.lastFind = a.tick }
  }
  if (a.got.length === lv.babies.length) {
    const ex = lv.exit[0] + 0.5 - a.x, ez = lv.exit[1] + 0.5 - a.z
    if (ex * ex + ez * ez <= EXIT_R * EXIT_R) { a.done = true; a.doneAt = a.tick; a.path.push([r2(a.x), r2(a.z)]) }
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
