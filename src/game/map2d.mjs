// A top-down picture of a level on a 2D canvas: the result card's map, with the route she walked
// drawn over it. Pure drawing; no three.js.
import { C } from "./sim.mjs"

const FILL = { [C.GROUND]: "#3f9a4a", [C.TREE]: "#1c5a2a", [C.ROCK]: "#8c8f85", [C.FENCE]: "#b0782f", [C.GAP]: "#e3b25a", [C.SPOT]: "#2f7a3b", [C.PLATFORM]: "#63b35e", [C.RAMP]: "#86c27a", [C.EXIT]: "#2a1a0e", [C.WATER]: "#3aa7e8", [C.MUD]: "#6b4a2b", [C.BRUSH]: "#2e8a3a" }

export function drawMap(canvas, lv, { route = null, optimal = null, babies = false, progress = 1, stars = 0 } = {}) {
  const g = canvas.getContext("2d")
  const W = canvas.width, H = canvas.height
  const s = Math.min(W / lv.w, H / lv.h)
  const ox = (W - lv.w * s) / 2, oy = (H - lv.h * s) / 2
  g.clearRect(0, 0, W, H)
  g.fillStyle = "#0b3d1e"; g.fillRect(0, 0, W, H)
  for (let z = 0; z < lv.h; z++) for (let x = 0; x < lv.w; x++) {
    const c = lv.grid[z * lv.w + x]
    g.fillStyle = FILL[c] || "#3f9a4a"
    g.fillRect(ox + x * s, oy + z * s, s + 0.5, s + 0.5)
  }
  // spots
  for (const sp of lv.spots) {
    g.fillStyle = "#1e4d2a"; g.beginPath(); g.arc(ox + (sp.x + 0.5) * s, oy + (sp.z + 0.5) * s, s * 0.42, 0, Math.PI * 2); g.fill()
  }
  if (babies) for (const si of lv.babies) {
    const sp = lv.spots[si]
    g.fillStyle = "#ffb15e"; g.beginPath(); g.arc(ox + (sp.x + 0.5) * s, oy + (sp.z + 0.5) * s, s * 0.32, 0, Math.PI * 2); g.fill()
  }
  // den
  g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(ox + (lv.exit[0] + 0.5) * s, oy + (lv.exit[1] + 0.5) * s, s * 0.55, 0, Math.PI * 2); g.fill()
  g.fillStyle = "#2a1a0e"; g.beginPath(); g.arc(ox + (lv.exit[0] + 0.5) * s, oy + (lv.exit[1] + 0.5) * s, s * 0.3, 0, Math.PI * 2); g.fill()
  // start
  g.fillStyle = "#fff1c7"; g.beginPath(); g.arc(ox + (lv.start[0] + 0.5) * s, oy + (lv.start[1] + 0.5) * s, s * 0.4, 0, Math.PI * 2); g.fill()
  // the solver's route, dashed and pale, under hers: the answer to "why two stars"
  if (optimal && optimal.length > 1) {
    g.lineCap = "round"; g.lineJoin = "round"
    g.setLineDash([s * 0.6, s * 0.5]); g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = Math.max(1.5, s * 0.22)
    g.beginPath(); g.moveTo(ox + optimal[0][0] * s, oy + optimal[0][1] * s)
    for (let i = 1; i < optimal.length; i++) g.lineTo(ox + optimal[i][0] * s, oy + optimal[i][1] * s)
    g.stroke(); g.setLineDash([])
  }
  if (route && route.length > 1) {
    const n = Math.max(2, Math.floor(route.length * Math.min(1, progress)))
    g.lineCap = "round"; g.lineJoin = "round"
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = Math.max(2, s * 0.5)
    g.beginPath(); g.moveTo(ox + route[0][0] * s, oy + route[0][1] * s)
    for (let i = 1; i < n; i++) g.lineTo(ox + route[i][0] * s, oy + route[i][1] * s)
    g.stroke()
    g.strokeStyle = stars === 3 ? "#ffd23f" : "#ff8a3d"; g.lineWidth = Math.max(1.5, s * 0.3)
    g.stroke()
    const p = route[n - 1]
    g.fillStyle = "#ff8a3d"; g.beginPath(); g.arc(ox + p[0] * s, oy + p[1] * s, s * 0.45, 0, Math.PI * 2); g.fill()
  }
  return { s, ox, oy }
}
