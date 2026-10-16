// Contact sheet: tile a set of PNGs into one image so a whole batch can be
// judged at a glance instead of opened one by one.
//   node tools/sheet.mjs out.png cell files...
import { readFile, writeFile } from "node:fs/promises"
import { readPNG, writePNG } from "../src/server/png.mjs"

const [out, cellArg, ...files] = process.argv.slice(2)
const CELL = Number(cellArg || 190)
const cols = Math.min(files.length, Math.ceil(Math.sqrt(files.length * 1.6)))
const rows = Math.ceil(files.length / cols)
const W = cols * CELL, H = rows * (CELL + 14)
const buf = Buffer.alloc(W * H * 4, 0)
for (let i = 0; i < W * H; i++) { buf[i * 4] = 18; buf[i * 4 + 1] = 18; buf[i * 4 + 2] = 22; buf[i * 4 + 3] = 255 }

const { drawText } = await import("../src/server/font.mjs")

for (let i = 0; i < files.length; i++) {
  const img = readPNG(await readFile(files[i]))
  const cx = (i % cols) * CELL, cy = Math.floor(i / cols) * (CELL + 14)
  const s = Math.min(CELL / img.w, CELL / img.h)
  const dw = Math.round(img.w * s), dh = Math.round(img.h * s)
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sxp = Math.min(img.w - 1, Math.round(x / s)), syp = Math.min(img.h - 1, Math.round(y / s))
      const j = (syp * img.w + sxp) * 4
      const k = ((cy + 12 + y) * W + cx + x + Math.round((CELL - dw) / 2)) * 4
      const a = img.rgba[j + 3] / 255
      buf[k] = buf[k] * (1 - a) + img.rgba[j] * a
      buf[k + 1] = buf[k + 1] * (1 - a) + img.rgba[j + 1] * a
      buf[k + 2] = buf[k + 2] * (1 - a) + img.rgba[j + 2] * a
      buf[k + 3] = 255
    }
  }
  const label = files[i].split("/").pop().replace(/^vd-|\.png$/g, "").replace(/-/g, " ").toUpperCase()
  drawText(buf, W, H, label.slice(0, 20), cx + 4, cy + 2, 1, [230, 230, 220, 255])
}
await writeFile(out, writePNG(W, H, buf))
console.log(out, W + "x" + H, files.length + " cells")
