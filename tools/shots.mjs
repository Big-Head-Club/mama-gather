// Screenshots of the running host at a phone and a laptop size, into shots/.
//
//   node tools/shots.mjs [origin]          default http://localhost:3000
//
// Needs Playwright somewhere on disk. The template has no dependencies, so it
// looks for the copy ship-check installs (~/bin/ship-check) and says so if
// there is none, rather than adding a package.json dependency to every game.

import { mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const origin = process.argv[2] || "http://localhost:3000"
const PW = [process.env.PLAYWRIGHT_PATH, join(homedir(), "bin/ship-check/node_modules/playwright/index.mjs")].filter(Boolean).find(existsSync)
if (!PW) { console.error("no Playwright found: install ship-check or set PLAYWRIGHT_PATH"); process.exit(1) }
const { chromium } = await import(PW)

const root = existsSync(".relay-template") ? "/play" : "/"
const SIZES = [["phone", 390, 844], ["laptop", 1440, 900]]
await mkdir("shots", { recursive: true })

const browser = await chromium.launch()
const report = []
for (const [name, width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  // Tally sends with sendBeacon, whose body Playwright cannot see, so the page
  // keeps a copy of every beacon in sessionStorage (it survives the reload).
  await page.addInitScript(() => {
    const orig = navigator.sendBeacon && navigator.sendBeacon.bind(navigator)
    if (!orig) return
    navigator.sendBeacon = (u, b) => {
      Promise.resolve(b && b.text ? b.text() : String(b)).then((t) => {
        const all = JSON.parse(sessionStorage.getItem("__beacons") || "[]"); all.push(t)
        sessionStorage.setItem("__beacons", JSON.stringify(all))
      })
      return orig(u, b)
    }
  })
  const beacons = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("__beacons") || "[]"))
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(origin + root + "?via=cart", { waitUntil: "networkidle" })
  await page.screenshot({ path: `shots/stage-${name}-home.png` })
  const stage = await page.$eval("#stage", (s) => { const r = s.getBoundingClientRect(); return { w: r.width, h: r.height } })
  await page.click("text=Play")
  // Tally batches for 800ms before it sends, so wait past that or nothing posts.
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `shots/stage-${name}-play.png` })
  // Every button on the stage must be wholly inside the window. A clipped
  // "Pick 4 more" under the foot of a fixed box is how this check started.
  const clipped = await page.$$eval("#stage button", (bs) => bs
    .filter((b) => b.offsetParent)
    .map((b) => ({ t: b.textContent.trim(), r: b.getBoundingClientRect() }))
    .filter(({ r }) => r.top < 0 || r.left < 0 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5)
    .map(({ t }) => t))
  const sawStart = (await beacons()).some((e) => e.includes('"start"') && e.includes('"cart"'))
  // A second day: move this browser's first-play date back and reload. `return`
  // must fire exactly because it is not the first day any more.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.endsWith(".first")) localStorage.setItem(k, "2020-01-01")
      if (k.endsWith(".back")) localStorage.removeItem(k)
    }
  })
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  // tally's own daily `visit` carries days_since_first now; the host no longer fires `return`.
  const sawReturn = (await beacons()).some((e) => (e.includes('"visit"') || e.includes('"return"')) && e.includes("days_since_first"))
  const fills = stage.w >= width - 1 && stage.h >= height - 1
  report.push({ name, viewport: [width, height], stage, fills, clipped, errors, sawStart, sawReturn })
  if (!fills || clipped.length || errors.length || !sawStart || !sawReturn) process.exitCode = 1
  await page.close()
}
await browser.close()
console.log(JSON.stringify(report, null, 2))
