// Every phone screen at every common phone size: fails if any two pieces of the page overlap, anything
// runs off the side, or the page throws. Mack 10-02: "we need the phone to look great always".
//   node tools/phone-check.mjs [url]      shots of failures land in shots/phone-check/
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW || "/Users/mackflavelle/bin/ship-check/node_modules/playwright")
const BASE = process.argv[2] || "http://localhost:4877"
const OUT = "shots/phone-check"
mkdirSync(OUT, { recursive: true })

const SIZES = [
  ["se", 375, 667], ["safari", 390, 664], ["small-android", 360, 640], ["android", 360, 740], ["max", 430, 932],
  ["landscape", 667, 375],
]

// Leaf boxes: text runs, buttons, inputs, canvases, images, the shelf host. Any two that are not nested and
// intersect by more than 2px both ways is an overlap. Anything wider than the viewport is a spill.
function audit() {
  const vw = innerWidth
  const seen = []
  const visible = (e) => {
    const s = getComputedStyle(e)
    if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) return false
    const r = e.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const name = (e) => (e.id ? "#" + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : "")) + (e.textContent ? ' "' + e.textContent.trim().slice(0, 24) + '"' : "")
  // an open sheet is the page: audit only what is in it
  const sheet = [...document.querySelectorAll(".sheet")].find((x) => !x.hidden && getComputedStyle(x).display !== "none")
  const scope = sheet || document.body
  for (const e of scope.querySelectorAll("*")) {
    if (e.closest("[data-gameaday-shelf]") && !e.matches("[data-gameaday-shelf]")) continue
    if (e.closest("[aria-hidden=true], .sr-only, #toast")) continue
    const leaf = e.matches("button, input, canvas, img, svg, [data-gameaday-shelf], kbd") ||
      [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!leaf || e.closest("button, svg") && e.closest("button, svg") !== e) continue
    if (!visible(e)) continue
    // a fixed backdrop or a tile inside a wordmark is decoration, not content
    // the house canvas and the front-screen backdrop are the ground everything sits on
    if (e.matches("canvas.board, canvas.board3d, [data-bleed], canvas.mg-canvas, .mg-dbg")) continue
    seen.push(e)
  }
  const out = []
  if (sheet) {
    const r = sheet.querySelector(".sheet-body").getBoundingClientRect()
    if (r.top < -1 || r.bottom > innerHeight + 1) out.push(`sheet runs off screen ${Math.round(r.top)}..${Math.round(r.bottom)} of ${innerHeight}`)
  }
  for (const e of seen) {
    const r = e.getBoundingClientRect()
    if (r.right > vw + 1 || r.left < -1) out.push("spill " + name(e) + ` ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`)
  }
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
    const a = seen[i], b = seen[j]
    if (a.contains(b) || b.contains(a)) continue
    // per line box, so wrapped inline text is measured where it actually is
    let hit = null
    for (const p of a.getClientRects()) for (const q of b.getClientRects()) {
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)
      if (w > 2 && h > 2) hit = `${Math.round(w)}x${Math.round(h)}`
    }
    if (hit) out.push("overlap " + name(a) + " × " + name(b) + ` (${hit})`)
  }
  return out
}

const browser = await chromium.launch()
let failures = 0
async function check(page, label, { noSheet = false } = {}) {
  await page.waitForTimeout(700)
  const bad = await page.evaluate(audit)
  if (noSheet && await page.evaluate(() => [...document.querySelectorAll(".sheet")].some((x) => !x.hidden && getComputedStyle(x).display !== "none")))
    bad.push("a sheet opened over this screen")
  if (bad.length) {
    failures += bad.length
    console.log("FAIL " + label + "\n  " + bad.join("\n  "))
    await page.screenshot({ path: `${OUT}/${label.replace(/\W+/g, "-")}.png`, fullPage: true })
  } else console.log("ok   " + label)
}

for (const [tag, w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  const errs = []
  page.on("pageerror", (e) => errs.push(String(e)))
  const drive = async (ms) => page.evaluate((ms) => new Promise((res) => {
    const m = window.__mg; const route = m.lv.solve.route; let k = 0; const t0 = performance.now(); let lastD = -1, lastS = -1
    const iv = setInterval(() => {
      const a = m.att
      if (!a || performance.now() - t0 > ms) { clearInterval(iv); if (a) m.input(0, 0); res(!a); return }
      while (k < route.length) { const dx = route[k][0] - a.x, dz = route[k][1] - a.z; if (dx * dx + dz * dz < 0.03) k++; else break }
      if (k >= route.length) k = route.length - 1
      const p = route[k]; const dx = p[0] - a.x, dz = p[1] - a.z
      const d = ((Math.round(Math.atan2(dz, dx) / (Math.PI * 2 / 32)) % 32) + 32) % 32
      const s = dx * dx + dz * dz < 0.09 ? 2 : 4
      if (d !== lastD || s !== lastS) { m.input(d, s); lastD = d; lastS = s }
    }, 25)
  }), ms)
  await page.goto(BASE + "/?debug&pump=1", { waitUntil: "networkidle" })
  await check(page, tag + " door")
  await page.getByRole("button", { name: "How to play" }).click(); await check(page, tag + " how-to")
  await page.goto(BASE + "/?debug&pump=1", { waitUntil: "networkidle" })
  const credits = page.getByRole("button", { name: /credits/i })
  if (await credits.count()) { await credits.first().click(); await check(page, tag + " credits") }
  // the practice round, driven along the solver's route
  await page.goto(BASE + "/?debug&pump=1", { waitUntil: "networkidle" })
  await page.getByRole("button", { name: /^Play$/ }).first().click()
  await page.waitForFunction(() => window.__mg, null, { timeout: 15000 })
  await page.waitForTimeout(1500)
  await check(page, tag + " practice start")
  await drive(2500)
  await check(page, tag + " practice mid")
  await drive(30000)
  await page.waitForTimeout(800)
  await check(page, tag + " practice end card", { noSheet: true })
  await page.getByRole("button", { name: /got it/i }).click()
  await page.waitForTimeout(800)
  await check(page, tag + " gate done", { noSheet: true })
  // today's run: drive, finish, see the run card, then the result screen
  await page.getByRole("button", { name: /play today/i }).click()
  await page.waitForFunction(() => window.__mg && window.__mg.att, null, { timeout: 15000 })
  await page.waitForTimeout(1200)
  await check(page, tag + " daily start")
  await drive(240000)
  await page.waitForTimeout(800)
  await check(page, tag + " run card", { noSheet: true })
  await page.getByRole("button", { name: /done for today/i }).click()
  await page.waitForTimeout(3000)
  await check(page, tag + " result", { noSheet: true })
  if (errs.length) { failures++; console.log("FAIL " + tag + " page errors", errs) }
  await ctx.close()
}
await browser.close()
console.log(failures ? `\n${failures} problems` : "\nall phone screens clean")
process.exit(failures ? 1 : 0)
