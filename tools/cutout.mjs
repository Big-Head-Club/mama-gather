// Turn a Midjourney studio shot on a cobalt backdrop into a game sprite with a
// real alpha channel.
//
// A plain colour threshold eats the dark side of a black tomato, because a
// rotten tomato photographed on blue reflects blue. So the background is found
// by FLOODING IN FROM THE FRAME EDGE instead: only blue that is connected to
// the border is background, and anything enclosed by the subject survives no
// matter what colour it is. After that the mask is feathered by a couple of
// pixels and the blue spill is pulled out of the rim, which is what stops
// sprites reading as stickers.
//
//   node tools/cutout.mjs <in.png> <out.png> [size]

import { readFile, writeFile } from "node:fs/promises"
import { readPNG, writePNG } from "../src/server/png.mjs"

export function cutout(img, opts = {}) {
  const { w, h, rgba } = img
  const lo = opts.lo ?? 4          // blueness where background starts
  const hi = opts.hi ?? 30         // blueness that is definitely background
  const blueness = new Int16Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    blueness[i] = b - Math.max(r, g)
  }

  // flood the background in from every edge pixel
  const bg = new Uint8Array(w * h)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = y * w + x
    if (bg[i] || blueness[i] < lo) return
    bg[i] = 1
    stack.push(i)
  }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
  while (stack.length) {
    const i = stack.pop()
    const x = i % w, y = (i / w) | 0
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)
  }

  // soft alpha: inside the flooded region, how blue a pixel is decides how
  // transparent it gets, so the rim fades instead of stair-stepping
  // Anything the flood could not reach is subject — except for genuinely
  // saturated backdrop blue trapped between the leaflets of a compound leaf,
  // which no lit plant or tomato ever produces. That second threshold is set
  // well above the blue a black tomato reflects, so the tomato keeps its skin.
  const hardLo = opts.hardLo ?? 40
  const hardHi = opts.hardHi ?? 62
  const alpha = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const t = bg[i]
      ? (blueness[i] - lo) / (hi - lo)
      : (blueness[i] - hardLo) / (hardHi - hardLo)
    alpha[i] = Math.max(0, Math.min(1, 1 - t))
  }

  // two-pass box blur of the mask only where it is already partial — keeps the
  // interior crisp and softens the cut line
  const blurred = new Float32Array(alpha)
  for (let pass = 0; pass < 2; pass++) {
    const src = Float32Array.from(blurred)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        if (src[i] === 1 && src[i - 1] === 1 && src[i + 1] === 1 && src[i - w] === 1 && src[i + w] === 1) continue
        blurred[i] = (src[i] * 4 + src[i - 1] + src[i + 1] + src[i - w] + src[i + w]) / 8
      }
    }
  }

  const out = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    let r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    const a = Math.max(0, Math.min(1, blurred[i]))
    // de-spill: no lit subject in this set is genuinely bluer than its own
    // green/red, so clamp blue back to the brighter of the two at the rim
    const cap = Math.max(r, g)
    if (b > cap) {
      // Interior spill matters as much as the rim: a small leaf lying against
      // the backdrop picks up enough blue to read as a plastic artefact once
      // it is composited onto a green scene.
      b = cap + (b - cap) * (opts.despill ?? 0.08)
      const lift = (b - cap) * 0.5
      g = Math.min(255, g + lift)
    }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b
    out[i * 4 + 3] = Math.round(a * 255)
  }
  return { w, h, rgba: out }
}

export function trim(img, pad = 0.02, alphaMin = 24) {
  const { w, h, rgba } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] < alphaMin) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return img
  const px = Math.round((x1 - x0) * pad), py = Math.round((y1 - y0) * pad)
  x0 = Math.max(0, x0 - px); x1 = Math.min(w - 1, x1 + px)
  y0 = Math.max(0, y0 - py); y1 = Math.min(h - 1, y1 + py)
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1
  const out = Buffer.alloc(nw * nh * 4)
  for (let y = 0; y < nh; y++) {
    rgba.copy(out, y * nw * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4)
  }
  return { w: nw, h: nh, rgba: out }
}

// Bilinear resize. Sprites are drawn at ~10% of their source size, so nearest
// neighbour would sparkle on every frame.
export function resize(img, nw, nh) {
  const { w, h, rgba } = img
  const out = Buffer.alloc(nw * nh * 4)
  for (let y = 0; y < nh; y++) {
    const fy = (y + 0.5) * h / nh - 0.5
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(h - 1, y0 + 1), wy = fy - y0
    for (let x = 0; x < nw; x++) {
      const fx = (x + 0.5) * w / nw - 0.5
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(w - 1, x0 + 1), wx = fx - x0
      for (let c = 0; c < 4; c++) {
        const a = rgba[(y0 * w + x0) * 4 + c], b = rgba[(y0 * w + x1) * 4 + c]
        const d = rgba[(y1 * w + x0) * 4 + c], e = rgba[(y1 * w + x1) * 4 + c]
        out[(y * nw + x) * 4 + c] = Math.round((a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy)
      }
    }
  }
  return { w: nw, h: nh, rgba: out }
}

export function fitBox(img, size) {
  const s = Math.min(size / img.w, size / img.h)
  return resize(img, Math.max(1, Math.round(img.w * s)), Math.max(1, Math.round(img.h * s)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inp, outp, sizeArg] = process.argv.slice(2)
  const img = readPNG(await readFile(inp))
  let cut = trim(cutout(img))
  if (sizeArg) cut = fitBox(cut, Number(sizeArg))
  await writeFile(outp, writePNG(cut.w, cut.h, cut.rgba))
  console.log(outp, cut.w + "x" + cut.h)
}
