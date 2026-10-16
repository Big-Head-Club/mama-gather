#!/usr/bin/env node
// Render the share card to disk so you can look at it before a chat does.
//
//   npm run card            -> shots/card-announce.png, shots/card-result.png
//
// The announce card is what a bare link unfurls to. The result card is what a
// finished run's link unfurls to, with a made-up result from config.share so the
// stat tiles are exercised. Open both. If you would not tap it, nobody will.

import { mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const config = (await import(join(ROOT, "relay.config.mjs"))).default
const { renderCard } = await import(join(ROOT, "src/server/og.mjs"))
const { loadTheme } = await import(join(ROOT, "src/server/theme.mjs"))

const theme = await loadTheme(ROOT, config.theme)
const art = join(ROOT, "themes", config.theme, "card.png")
if (!existsSync(art)) console.log(`no themes/${config.theme}/card.png — rendering the flat fallback so you can see what a stranger sees`)

await mkdir(join(ROOT, "shots"), { recursive: true })
const announce = await renderCard({ theme, art, title: config.title, number: 7, headline: config.tagline, stats: [], footer: "one a day / no sign-in" })
await writeFile(join(ROOT, "shots/card-announce.png"), announce)

// A sample result: whatever fields the share token carries, filled with
// plausible numbers, so the stat tiles render the way they will in a chat.
let stats = [], headline = config.tagline
try {
  const sample = config.share.fromToken(config.share.token({ metric: 3, seconds: 42, solved: true, won: true, tries: 3, events: [] }))
  headline = config.share.headline(sample)
  stats = config.share.stats ? config.share.stats(sample) || [] : [{ value: "3", label: (config.metric && config.metric.label) || "score", accent: true }, { value: "42s", label: "time" }]
} catch { /* the game's share shape is its own business; the announce card is the one that matters */ }
const result = await renderCard({ theme, art, title: config.title, number: 7, headline, stats, footer: "one a day / no sign-in" })
await writeFile(join(ROOT, "shots/card-result.png"), result)

console.log(`wrote ${join(ROOT, "shots/card-announce.png")}`)
console.log(`wrote ${join(ROOT, "shots/card-result.png")}`)
console.log("open them. this is the whole ad.")
