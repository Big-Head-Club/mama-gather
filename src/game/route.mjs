// A breadcrumb path ([x, z, tick]...) as a short string for the share link, and back. Pure, and
// browser-safe: the rules file calls routeToken, the server's card rasteriser calls routeFromToken.
// ~26 points, each coordinate one base64url char (0..63 across the level), so a route rides in the
// link at ~52 characters.

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

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
