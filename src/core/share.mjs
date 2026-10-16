// The share artifact. This is the product.
//
// Rules learned the hard way, from every daily that has ever been posted into a
// chat and every one that got muted:
//
//   1. IT MUST NOT SPOIL. The strip shows the SHAPE of your run, never the
//      answer. If a glyph can be decoded back into the solution, the game dies
//      in the group chat that liked it most.
//   2. FOUR LINES, MAXIMUM. Title, one stat line, the strip, the link. Chat
//      clients collapse anything taller and the link is what you are actually
//      sending.
//   3. THE LINK GOES LAST, ON ITS OWN LINE. Every client on earth auto-links a
//      bare URL at the end of a message and unfurls it. Put text after it and
//      some of them stop.
//   4. NO HASHTAGS, NO EMOJI SOUP IN THE TITLE. The strip is the visual.
//   5. The strip should be legible with no colour perception at all — vary the
//      GLYPH, not just the hue. Squares in five colours is a worse strip than
//      squares, circles and dots.

export const DEFAULT_GLYPHS = {
  hit: "\u{1F7E9}",     // green square
  near: "\u{1F7E8}",    // yellow square
  miss: "⬜",       // white square
  bad: "\u{1F7E5}",     // red square
  blank: "⬛",      // black square
}

export function strip(events, glyphs = DEFAULT_GLYPHS, max = 30) {
  return events.slice(-max).map((e) => glyphs[e] ?? glyphs.blank ?? "").join("")
}

// The share text. `lines` is the game's one stat line — keep it to one line.
export function shareText({ title, number, lines = [], strips = [], url }) {
  const out = [number ? `${title} #${number}` : title]
  for (const l of lines) if (l) out.push(l)
  for (const s of strips) if (s) out.push(s)
  if (url) out.push(url)
  return out.join("\n")
}

// --- links -----------------------------------------------------------------
//
// A result token rides in the URL so that the card someone sees in the chat can
// show YOUR score without the server having to look anything up — which means
// the unfurl works for practice runs, crew runs and archived days, not just for
// scores that made it onto a board.
//
// It is deliberately not signed. Anyone can hand-craft a link claiming a perfect
// game; the card is a brag, not a record. The leaderboard is the record and it
// is verified server-side. Signing this would buy nothing and would stop the
// card from working on a static host.

const B64 = (s) => btoaSafe(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const UNB64 = (s) => atobSafe(s.replace(/-/g, "+").replace(/_/g, "/"))

function btoaSafe(s) {
  if (typeof btoa === "function") return btoa(s)
  return Buffer.from(s, "binary").toString("base64")
}
function atobSafe(s) {
  if (typeof atob === "function") return atob(s)
  return Buffer.from(s, "base64").toString("binary")
}

export function encodeResult(obj) {
  try { return B64(JSON.stringify(obj)) } catch { return "" }
}
export function decodeResult(token) {
  try {
    const o = JSON.parse(UNB64(String(token)))
    return o && typeof o === "object" ? o : null
  } catch { return null }
}

// Every link the game can hand out, in one place. `origin` has to be absolute:
// chat clients scraping the page will not resolve a relative og:image, and a
// relative share link is not clickable once it has been copied into a message.
export function links({ origin, number, crew, result }) {
  const q = []
  if (crew) q.push("c=" + crew)
  const base = number ? `${origin}/d/${number}` : origin
  const invite = base + (q.length ? "?" + q.join("&") : "")
  const rq = q.slice()
  if (result) rq.push("r=" + encodeResult(result))
  return {
    invite,                                                   // "play today's"
    result: base + (rq.length ? "?" + rq.join("&") : ""),      // "here's how I did"
    card: `${origin}/api/og.png?${new URLSearchParams(Object.assign(
      { d: number || "" }, crew ? { c: crew } : null, result ? { r: encodeResult(result) } : null,
    ))}`,
  }
}
