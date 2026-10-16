// The unfurl card for a finished run: the forest plate with the route she walked drawn on a map
// panel at the right. Node only (the server imports it on demand); no canvas, so a few pixel
// helpers on an RGBA buffer. Pure in the inputs: seed + number rebuild the level, the token carries
// the route as a short string (see routeToken).
//
// No words on it, by the house rule for cards: the chat prints the name under the picture.

import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { C } from "./sim.mjs"
import { create } from "./game.rules.mjs"

const W = 1200, H = 630
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

// A breadcrumb path ([x, z, tick]...) -> ~26 points, each coordinate one base64url char (0..63 across
// the level), so a route rides in the share link at ~52 characters.
export function routeToken(path, lv) {
  if (!path || path.length < 2) return ""
  const pts = simplify(path.map(([x, z]) => [x, z]), 26)
  let s = ""
  for (const [x, z] of pts) s += ALPHA[Math.max(0, Math.min(63, Math.round(x / lv.w * 63)))] + ALPHA[Math.max(0, Math.min(63, Math.round(z / lv.h * 63)))]
  return s
}
export function routeFromToken(tok, lv) {
  const out = []
  if (!tok || typeof tok !== "string") return out
  for (let i = 0; i + 1 < tok.length; i += 2) {
    const a = ALPHA.indexOf(tok[i]), b = ALPHA.indexOf(tok[i + 1])
    if (a < 0 || b < 0) continue
    out.push([a / 63 * lv.w, b / 63 * lv.h])
  }
  return out
}
// keep the n most important points: drop the one that bends the line least, repeatedly
function simplify(pts, n) {
  pts = pts.slice()
  while (pts.length > n) {
    let bi = -1, bd = Infinity
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1]
      const d = Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]))   // twice the triangle's area
      if (d < bd) { bd = d; bi = i }
    }
    pts.splice(bi, 1)
  }
  return pts
}

// --- raster helpers over an RGBA Buffer -------------------------------------------------------------
const px = (buf, x, y, r, g, b, a = 1) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  buf[i] = buf[i] * (1 - a) + r * a; buf[i + 1] = buf[i + 1] * (1 - a) + g * a; buf[i + 2] = buf[i + 2] * (1 - a) + b * a; buf[i + 3] = 255
}
const rect = (buf, x0, y0, w, h, [r, g, b], a = 1) => { for (let y = Math.floor(y0); y < y0 + h; y++) for (let x = Math.floor(x0); x < x0 + w; x++) px(buf, x, y, r, g, b, a) }
const disc = (buf, cx, cy, rad, [r, g, b], a = 1) => { for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= rad) px(buf, x, y, r, g, b, a * Math.min(1, rad - d + 0.5)) } }
const line = (buf, x0, y0, x1, y1, wdt, col, a = 1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (wdt * 0.3)) + 1; for (let i = 0; i <= n; i++) { const f = i / n; disc(buf, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, wdt / 2, col, a) } }
const roundRect = (buf, x0, y0, w, h, rad, col, a) => { rect(buf, x0 + rad, y0, w - 2 * rad, h, col, a); rect(buf, x0, y0 + rad, rad, h - 2 * rad, col, a); rect(buf, x0 + w - rad, y0 + rad, rad, h - 2 * rad, col, a); for (const [cx, cy] of [[x0 + rad, y0 + rad], [x0 + w - rad, y0 + rad], [x0 + rad, y0 + h - rad], [x0 + w - rad, y0 + h - rad]]) disc(buf, cx, cy, rad, col, a) }
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
const FILL = { [C.GROUND]: "#3f9a4a", [C.TREE]: "#1c5a2a", [C.ROCK]: "#8c8f85", [C.FENCE]: "#b0782f", [C.GAP]: "#e3b25a", [C.SPOT]: "#2f7a3b", [C.PLATFORM]: "#63b35e", [C.RAMP]: "#86c27a", [C.EXIT]: "#2a1a0e", [C.WATER]: "#3aa7e8", [C.MUD]: "#6b4a2b", [C.BRUSH]: "#2e8a3a" }

// The card: the forest plate, and the map with her route on it. Returns { w, h, rgba } or null.
export async function cardRoute({ seed, number, result }) {
  if (!result || !result.solved || !result.p) return null
  const st = create(seed, { number })
  const lv = st.level
  const route = routeFromToken(result.p, lv)
  if (route.length < 2) return null
  const here = dirname(fileURLToPath(import.meta.url))
  const { readPNG } = await import("../server/png.mjs")
  const plate = readPNG(await readFile(join(here, "..", "..", "themes", "forest", "card.png")))
  const buf = Buffer.alloc(W * H * 4)
  // cover the card with the plate
  const s = Math.max(W / plate.w, H / plate.h)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(plate.w - 1, Math.max(0, Math.round((x - (W - plate.w * s) / 2) / s))), sy = Math.min(plate.h - 1, Math.max(0, Math.round((y - (H - plate.h * s) / 2) / s)))
    const j = (sy * plate.w + sx) * 4, i = (y * W + x) * 4
    buf[i] = plate.rgba[j]; buf[i + 1] = plate.rgba[j + 1]; buf[i + 2] = plate.rgba[j + 2]; buf[i + 3] = 255
  }
  // the map panel, right of centre
  const PW = 440, PH = 440, PX = W - PW - 70, PY = (H - PH) / 2
  roundRect(buf, PX - 14, PY - 14, PW + 28, PH + 28, 28, hex("#07301a"), 0.82)
  const cs = Math.min(PW / lv.w, PH / lv.h)
  const ox = PX + (PW - lv.w * cs) / 2, oy = PY + (PH - lv.h * cs) / 2
  for (let z = 0; z < lv.h; z++) for (let x = 0; x < lv.w; x++) rect(buf, ox + x * cs, oy + z * cs, cs + 0.6, cs + 0.6, hex(FILL[lv.grid[z * lv.w + x]] || "#3f9a4a"))
  for (const sp of lv.spots) disc(buf, ox + (sp.x + 0.5) * cs, oy + (sp.z + 0.5) * cs, cs * 0.42, hex("#1e4d2a"))
  disc(buf, ox + (lv.exit[0] + 0.5) * cs, oy + (lv.exit[1] + 0.5) * cs, cs * 0.75, hex("#ffd23f"))
  disc(buf, ox + (lv.exit[0] + 0.5) * cs, oy + (lv.exit[1] + 0.5) * cs, cs * 0.35, hex("#2a1a0e"))
  const col = result.stars === 3 ? hex("#ffd23f") : hex("#ff8a3d")
  for (let i = 1; i < route.length; i++) line(buf, ox + route[i - 1][0] * cs, oy + route[i - 1][1] * cs, ox + route[i][0] * cs, oy + route[i][1] * cs, Math.max(4, cs * 0.6), hex("#000000"), 0.35)
  for (let i = 1; i < route.length; i++) line(buf, ox + route[i - 1][0] * cs, oy + route[i - 1][1] * cs, ox + route[i][0] * cs, oy + route[i][1] * cs, Math.max(3, cs * 0.38), col)
  disc(buf, ox + route[0][0] * cs, oy + route[0][1] * cs, cs * 0.55, hex("#fff1c7"))
  return { w: W, h: H, rgba: buf }
}
