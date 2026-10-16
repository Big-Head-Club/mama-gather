// The unfurl card, rendered per link.
//
// This is the highest-leverage thing in the template and the thing almost every
// game in this collection got wrong the same way: one static og.png, with the
// production URL hardcoded into the HTML. That card says "a game exists". A card
// that says "Mack got 4/6 in 41 seconds — #37" is a completely different object
// in a group chat: it is a scoreboard nobody has to open, and it is the reason
// the next person taps.
//
// It renders with zero dependencies (see png.mjs / font.mjs) so it works on any
// host, cannot rot, and costs about 15ms.
//
// What every scraper needs, learned by watching these fail:
//   - 1200x630. Twitter/X, Slack, Discord and iMessage all crop differently
//     inside it, so keep everything inside a ~90px margin.
//   - An ABSOLUTE og:image URL. Relative paths are not resolved by scrapers.
//   - og:image:width/height present, or Slack and Discord render a thumbnail.
//   - Real text baked into the pixels, because most clients show the image and
//     truncate the description to one line.
//
// AND THE THING THIS GOT WRONG FOR A YEAR: it laid a 66% scrim over the WHOLE
// picture and set the type across the middle of it. That makes the words legible
// and the art pointless — every card in the collection was a good illustration
// with a grey sheet over it. A card is a poster, and a poster has a picture and
// a title block, not a picture wearing a title. So: the art runs at full
// strength in its own region, the type lives in a solid panel below it, and the
// two never overlap. Legibility comes from the panel, not from ruining the
// picture to get it.
//   - A cache-busting query per distinct result, or the chat client shows the
//     first card it ever saw for your domain to everybody, forever.

import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readPNG, writePNG } from "./png.mjs"
import { drawText, textWidth } from "./font.mjs"

const W = 1200, H = 630
const MARGIN = 92

// The card's geometry, exported so a test can prove the bands fit rather than
// trusting that they do. PANEL is where the picture stops and the reading
// starts; the scales are the biggest each row is ever drawn at.
export const CARD = { W, H, MARGIN, PANEL: 384, TOP: 5, HEAD: 14, VAL: 7, LAB: 4, FLOOR_HEAD: 7, FLOOR_VAL: 5 }
const bgCache = new Map()

async function background(path) {
  if (!path) return null
  if (bgCache.has(path)) return bgCache.get(path)
  let img = null
  try { if (existsSync(path)) img = readPNG(await readFile(path)) } catch { img = null }
  bgCache.set(path, img)
  return img
}

const hex = (s) => {
  const h = String(s || "").replace("#", "")
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0, 255]
}

export async function renderCard({ theme, art, artImage, title, number, headline, stats = [], footer, crew }) {
  const buf = Buffer.alloc(W * H * 4)
  const ground = hex(theme.ground)
  const ink = hex(theme.ink)
  const accent = hex(theme.accent)
  const dim = hex(theme.inkDim || theme.ink)

  // The split. Everything above PANEL is picture, everything below is words.
  const PANEL = CARD.PANEL
  const FADE = 70                 // the art dissolves into the panel, not onto it
  const RULE = 6

  // A GAME MAY DRAW ITS OWN PICTURE. Most cards want the theme's plate, which
  // is one picture with different numbers printed on it. A game whose output IS
  // a picture — a board, a route, a painting — can hand over an already-drawn
  // {w, h, rgba} instead, and two players' cards then differ in the part that
  // matters rather than only in the caption. See share.cardArt.
  const bg = artImage || (await background(art))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      let r = ground[0], g = ground[1], b = ground[2]
      if (bg && y < PANEL) {
        // Cover the ART REGION, not the whole card, or the subject sits behind
        // the panel and the card shows its knees.
        const s = Math.max(W / bg.w, PANEL / bg.h)
        const sx = Math.min(bg.w - 1, Math.max(0, Math.round((x - (W - bg.w * s) / 2) / s)))
        const sy = Math.min(bg.h - 1, Math.max(0, Math.round((y - (PANEL - bg.h * s) / 2) / s)))
        const j = (sy * bg.w + sx) * 4
        r = bg.rgba[j]; g = bg.rgba[j + 1]; b = bg.rgba[j + 2]
        // No scrim anywhere except the last few rows, where the picture has to
        // meet the panel without a seam.
        const into = y - (PANEL - FADE)
        if (into > 0) {
          const k = into / FADE
          r = r * (1 - k) + ground[0] * k
          g = g * (1 - k) + ground[1] * k
          b = b * (1 - k) + ground[2] * k
        }
      }
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255
    }
  }

  // A hard rule where the picture stops and the reading starts. Printed, not
  // glassy, in the house style.
  for (let y = PANEL; y < PANEL + RULE; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    buf[i] = accent[0]; buf[i + 1] = accent[1]; buf[i + 2] = accent[2]
  }

  // --- the title block ------------------------------------------------------
  //
  // Three rows stacked in a fixed 246px panel. Every row shrinks to fit its
  // WIDTH, and the row heights are chosen so that at their maximum scales the
  // three of them plus the gaps still fit the panel's HEIGHT — the first pass
  // got the widths right and the heights wrong, and the headline printed
  // straight through the title above it. `og-bands` in the test asserts it.
  const TOP = 5, HEAD = 14, VAL = 7, LAB = 4   // max scales; 7px per unit of scale
  const rowTop = PANEL + 22
  const rowHead = rowTop + TOP * 7 + 14
  const rowStat = H - 16 - VAL * 7

  // Row 1: which game, and which day. The day number is half the point — it is
  // what tells a chat which puzzle is being argued about.
  const t = String(title).toUpperCase()
  const n = number ? "#" + number : ""
  // A SHRINK FLOOR THAT CAN BE REACHED IS A COLLISION. The title shrinks, but
  // only so far, and then it still has to share the row with whatever is
  // right-aligned on it. So the right-hand side DROPS pieces until it fits
  // rather than being drawn on top of the day number — and it drops the footer
  // before the crew code, because a crew card is being read by the crew.
  let ts = TOP
  const left = t + (n ? " " + n : "")
  while (ts > 3 && textWidth(left, ts) > (W - MARGIN * 2) * 0.55) ts -= 1
  drawText(buf, W, H, t, MARGIN, rowTop, ts, dim)
  if (n) drawText(buf, W, H, n, MARGIN + textWidth(t + " ", ts), rowTop, ts, accent)

  const pieces = []
  if (crew) pieces.push("CREW " + crew)
  if (footer) pieces.push(String(footer).toUpperCase())
  const room = W - MARGIN * 2 - textWidth(left, ts) - 40
  while (pieces.length && textWidth(pieces.join("   "), LAB) > room) pieces.pop()
  const tail = pieces.join("   ")
  if (tail) drawText(buf, W, H, tail, W - MARGIN - textWidth(tail, LAB), rowTop + (ts - LAB) * 7, LAB, dim)

  // Row 2: the headline, as big as it will go. This is the line somebody reads
  // from across a room, so it gets the space and everything else fits round it.
  if (headline) {
    let scale = HEAD
    while (scale > 7 && textWidth(String(headline).toUpperCase(), scale) > W - MARGIN * 2) scale -= 1
    drawText(buf, W, H, String(headline).toUpperCase(), MARGIN, rowHead, scale, ink)
  }

  // Row 3: the numbers, value and label on one baseline so the row stays short
  // enough to leave the headline its height.
  const tiles = stats.slice(0, 3).map((s) => ({
    v: String(s.value).toUpperCase(), l: String(s.label).toUpperCase(), accent: s.accent,
  }))
  let vs = VAL, ls = LAB
  const bandWidth = () => tiles.reduce((sum, t) => sum + textWidth(t.v, vs) + 14 + textWidth(t.l, ls) + 54, 0)
  while (vs > 5 && bandWidth() > W - MARGIN * 2) { vs -= 1; if (vs < 6) ls = 3 }
  let x = MARGIN
  for (const t of tiles) {
    drawText(buf, W, H, t.v, x, rowStat, vs, t.accent ? accent : ink)
    drawText(buf, W, H, t.l, x + textWidth(t.v, vs) + 14, rowStat + (vs - ls) * 7, ls, dim)
    x += textWidth(t.v, vs) + 14 + textWidth(t.l, ls) + 54
  }

  return writePNG(W, H, buf)
}
