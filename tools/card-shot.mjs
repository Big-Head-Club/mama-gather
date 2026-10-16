// Shoot the share card from the real game: public/card.html at 1200x630 -> themes/forest/card.png.
//   node tools/card-shot.mjs [url] [seed]
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW || "/Users/mackflavelle/bin/ship-check/node_modules/playwright")
const BASE = process.argv[2] || "http://localhost:4877"
const seed = process.argv[3] || "11"
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.on("pageerror", (e) => console.error("pageerror", e))
await page.goto(`${BASE}/card.html?seed=${seed}&ticks=${process.argv[4] || 700}&viewH=${process.argv[5] || 7.5}`, { waitUntil: "networkidle" })
await page.waitForFunction(() => window.__cardReady, null, { timeout: 60000 })
await page.waitForTimeout(500)
await page.screenshot({ path: "themes/forest/card.png", clip: { x: 0, y: 0, width: 1200, height: 630 }, timeout: 120000, animations: "disabled" })
console.log("wrote themes/forest/card.png")
await browser.close()
