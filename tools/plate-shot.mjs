// The ledger plate: 840x630 (4:3) of real play, from public/card.html.  node tools/plate-shot.mjs [url] [seed]
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW || "/Users/mackflavelle/bin/ship-check/node_modules/playwright")
const BASE = process.argv[2] || "http://localhost:4877", seed = process.argv[3] || "11"
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 840, height: 630 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.addStyleTag({ content: "#host{width:840px!important;height:630px!important}" }).catch(() => {})
await page.goto(`${BASE}/card.html?seed=${seed}&ticks=700&viewH=8`, { waitUntil: "networkidle" })
await page.addStyleTag({ content: "#host{width:840px!important;height:630px!important}" })
await page.waitForFunction(() => window.__cardReady, null, { timeout: 120000 })
await page.waitForTimeout(500)
await page.screenshot({ path: "public/plate.jpg", type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: 840, height: 630 }, timeout: 120000, animations: "disabled" })
console.log("wrote public/plate.jpg")
await browser.close()
