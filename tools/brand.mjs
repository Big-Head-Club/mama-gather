#!/usr/bin/env node
// Brand a game in one go: card art, a logo, a tone sheet, and the card colours.
//
//   npm run brand -- "one line on what the game is"
//
// Reads title and theme from relay.config.mjs. Writes:
//   themes/<theme>/card.png    1200x630+ art plate, no text (the renderer adds type)
//   themes/<theme>/brand.md    tone words, voice, tagline, art direction, palette
//   themes/<theme>/theme.json  the `card` colours, sampled from the art
//   public/logo.png            wordmark on white
// then renders the cards to shots/ so you can look. The share-card check passes
// once this has run. Regenerate freely; each run is a fresh roll.
//
// Needs a Gemini key in $GEMINI_API_KEY or ~/.config/gemini-api-key.
// Models: Nano Banana (gemini-3.1-flash-image) for pictures, gemini-3-flash for words.

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const config = (await import(join(ROOT, "relay.config.mjs"))).default
const { readPNG } = await import(join(ROOT, "src/server/png.mjs"))

const IMAGE_MODEL = process.env.BRAND_IMAGE_MODEL || "gemini-3.1-flash-image"
const TEXT_MODEL = process.env.BRAND_TEXT_MODEL || "gemini-3-flash-preview"
const API = "https://generativelanguage.googleapis.com/v1beta/models"

const keyFile = join(homedir(), ".config/gemini-api-key")
const KEY = process.env.GEMINI_API_KEY || (existsSync(keyFile) ? (await readFile(keyFile, "utf8")).trim() : "")
if (!KEY) { console.error("no Gemini key: set GEMINI_API_KEY or write it to ~/.config/gemini-api-key"); process.exit(1) }

const pitch = process.argv.slice(2).join(" ").trim() || config.tagline || ""
const title = config.title
const themeDir = join(ROOT, "themes", config.theme)
if (!existsSync(themeDir)) { console.error(`no themes/${config.theme}/ — set config.theme first`); process.exit(1) }

async function gemini(model, body) {
  const res = await fetch(`${API}/${model}:generateContent?key=${KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(`${model}: ${(json.error && json.error.message) || res.status}`)
  return json
}

async function words(prompt) {
  const r = await gemini(TEXT_MODEL, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 1 },
  })
  const text = r.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""
  return JSON.parse(text)
}

async function picture(prompt, { aspect, size }) {
  const r = await gemini(IMAGE_MODEL, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: size } },
  })
  const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
  if (!part) throw new Error(`${IMAGE_MODEL} returned no image: ${JSON.stringify(r).slice(0, 300)}`)
  const raw = Buffer.from(part.inlineData.data, "base64")
  if (/png/.test(part.inlineData.mimeType)) return raw
  return toPNG(raw, part.inlineData.mimeType)
}

// Gemini answers in JPEG. Everything downstream is the zero-dep PNG reader, so
// convert with sips, which every Mac has. On another OS install ImageMagick.
async function toPNG(raw, mime) {
  const { tmpdir } = await import("node:os")
  const dir = tmpdir(), stamp = Date.now() + "-" + Math.random().toString(36).slice(2)
  const src = join(dir, `brand-${stamp}.${/jpe?g/.test(mime) ? "jpg" : "img"}`), out = join(dir, `brand-${stamp}.png`)
  await writeFile(src, raw)
  // Also cap the long edge at 1600: a 2K plate is 6 MB in every clone and the
  // card is 1200 wide anyway.
  let r = spawnSync("sips", ["-s", "format", "png", "-Z", "1600", src, "--out", out], { stdio: "ignore" })
  if (r.status !== 0) r = spawnSync("magick", [src, "-resize", "1600x1600>", out], { stdio: "ignore" })
  if (r.status !== 0) throw new Error(`got ${mime} and could not convert it: need sips (macOS) or ImageMagick`)
  return readFile(out)
}

// 1. The sheet. Tone, voice, tagline, and a single image to paint.
console.log(`brand: ${title} — "${pitch}"`)
const sheet = await words(`You are naming the look and voice of a small daily web game that people open from a link in a group chat.

Title: ${title}
What it is: ${pitch}

House rules for copy: plain words, short, no hype, no exclamation marks, say what a thing does. A tagline is at most six words and would survive being read aloud by a bored friend.

Return JSON with exactly these keys:
- "tone": three adjectives, lowercase
- "voice": two sentences on how the game talks to the player
- "tagline": the tagline
- "art": one sentence describing ONE striking picture for the share card: a single clear subject, a mood, a light, a palette in words. If the game is about people, the subject is the PEOPLE and the conflict between them: name who they are, what they are doing to each other and the look on their faces. Never reduce a game about people to an object or a still life (a cake, a glass, a chair); Seat the Wedding got a cake and then a wine glass for a game about family feuds. Something a stranger tapping a link would recognise in a thumbnail. No text or letters in the picture. Not a screenshot of the game.
- "style": four words naming the rendering style (for example "gouache, flat, paper texture, bold")`)
sheet.tone = Array.isArray(sheet.tone) ? sheet.tone : String(sheet.tone || "").split(/,\s*/).filter(Boolean)

// 2. The card plate. The renderer lays a 66% scrim of the ground colour over
// it and sets type on top, so contrast and a big readable subject matter more
// than detail.
const cardPrompt = `${sheet.art} Style: ${sheet.style}. One bold subject filling the frame, strong value contrast, clean silhouette, no text, no letters, no logo, no watermark, no user interface, no border. Landscape 16:9.`
const card = await picture(cardPrompt, { aspect: "16:9", size: "2K" })
const img = readPNG(card)
if (img.w < 1200 || img.h < 630) throw new Error(`card came back ${img.w}x${img.h}, need 1200x630`)
await writeFile(join(themeDir, "card.png"), card)
console.log(`card: themes/${config.theme}/card.png ${img.w}x${img.h}`)

// 3. The logo. A wordmark on plain white; the page decides where it goes.
const logo = await picture(`Wordmark logo that reads exactly "${title.toUpperCase()}" in bold chunky custom letterforms, one solid ink colour on a plain flat white background, centred, generous margin. Style: ${sheet.style}, ${sheet.tone.join(", ")}. Spell the word exactly, every letter, nothing else in the image: no tagline, no icon, no mockup, no shadow, no texture on the background.`, { aspect: "16:9", size: "1K" })
await mkdir(join(ROOT, "public"), { recursive: true })
await writeFile(join(ROOT, "public/logo.png"), logo)
console.log("logo: public/logo.png")

// 4. Card colours, sampled from the plate. Ground is the picture's own average
// pushed dark or light so the scrim reads as a wash of the art rather than a
// lid on it; accent is the most saturated colour that actually occurs.
const palette = samplePalette(img)
const themePath = join(themeDir, "theme.json")
const theme = JSON.parse(await readFile(themePath, "utf8"))
theme.card = palette
await writeFile(themePath, JSON.stringify(theme, null, 2) + "\n")
console.log(`card colours: ground ${palette.ground} ink ${palette.ink} accent ${palette.accent}`)

// 5. The sheet on disk, next to the art it describes.
await writeFile(join(themeDir, "brand.md"), `# ${title} — brand

Generated by \`npm run brand\` from: "${pitch}". Edit freely; rerun to reroll.

- **Tone:** ${sheet.tone.join(", ")}
- **Tagline:** ${sheet.tagline}
- **Voice:** ${sheet.voice}
- **Art:** ${sheet.art}
- **Style:** ${sheet.style}
- **Card colours:** ground ${palette.ground}, ink ${palette.ink}, accent ${palette.accent}

Art plate: \`card.png\` (${img.w}x${img.h}, no text; the renderer sets the type). Logo: \`public/logo.png\`.
`)
console.log(`sheet: themes/${config.theme}/brand.md — tone "${sheet.tone.join(", ")}", tagline "${sheet.tagline}"`)

// 6. Look at it.
const r = spawnSync(process.execPath, [join(ROOT, "tools/card.mjs")], { stdio: "inherit" })
if (r.status) process.exit(r.status)

function samplePalette({ w, h, rgba }) {
  let n = 0, R = 0, G = 0, B = 0, best = null, bestSat = -1
  const buckets = new Map()
  for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) {
    const j = (y * w + x) * 4, r = rgba[j], g = rgba[j + 1], b = rgba[j + 2]
    n++; R += r; G += g; B += b
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const sat = mx ? (mx - mn) / mx : 0
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    if (sat > 0.35 && lum > 40 && lum < 215) {
      // Quantise so one loud pixel cannot win; the accent has to occur a lot.
      const k = `${r >> 5},${g >> 5},${b >> 5}`
      const e = buckets.get(k) || { c: 0, r: 0, g: 0, b: 0, sat: 0 }
      e.c++; e.r += r; e.g += g; e.b += b; e.sat += sat
      buckets.set(k, e)
    }
  }
  for (const e of buckets.values()) {
    const score = e.c * (e.sat / e.c)
    if (e.c >= n * 0.01 && score > bestSat) { bestSat = score; best = [e.r / e.c, e.g / e.c, e.b / e.c] }
  }
  const avg = [R / n, G / n, B / n]
  const lum = 0.299 * avg[0] + 0.587 * avg[1] + 0.114 * avg[2]
  const dark = lum < 128
  // Push the average toward black or white so the scrim has somewhere to go.
  const ground = avg.map((v) => Math.round(dark ? v * 0.35 : 255 - (255 - v) * 0.25))
  const ink = dark ? [250, 245, 235] : [20, 17, 14]
  const accent = best ? best.map(Math.round) : (dark ? [255, 200, 80] : [184, 40, 28])
  const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")
  return { ground: hex(ground), ink: hex(ink), inkDim: hex(ink.map((v) => Math.round(dark ? v * 0.7 : v + 80))), accent: hex(accent) }
}
