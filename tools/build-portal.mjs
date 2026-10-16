// A single static folder for CrazyGames, Poki and itch: no server, no outbound
// links, no third-party requests.
//
//   npm run build:portal                 -> dist/portal/
//   node tools/build-portal.mjs --out <dir>
//
// What a portal build IS:
//   - the daily, and only the daily. Tables and quests need the server.
//   - seeded on the device from the day (salt "portal"), so every player on
//     the portal gets the same board — and so a determined player could
//     compute tomorrow's. That is the price of no server, and it is fine for
//     an unscored build.
//   - scores, the streak and the practice gate kept in localStorage.
//   - no share button (portals forbid links out), no tally tag, no service
//     worker, no manifest, no unfurl meta. Credits name the maker, unlinked.
//   - served from any path: every import and asset URL is made relative,
//     because a portal hosts the folder under its own CDN prefix.

import { cp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve, relative, dirname, sep } from "node:path"
import { pathToFileURL } from "node:url"

const ROOT = resolve(new URL("..", import.meta.url).pathname)
const at = process.argv.indexOf("--out")
const OUT = resolve(at > 0 ? process.argv[at + 1] : join(ROOT, "dist/portal"))

// --sdk crazygames|poki adds that portal's SDK: one script tag, and the host
// calls gameplayStart/gameplayStop around every run (Poki also gets a
// commercialBreak before every run after the first). The one outside origin a
// portal build may reference is that SDK's, and only as that exact tag.
//   CrazyGames HTML5 SDK v3: https://docs.crazygames.com/sdk/intro/
//   Poki HTML5 SDK:          https://developers.poki.com/guide/sdk-html5
const SDKS = {
  crazygames: "https://sdk.crazygames.com/crazygames-sdk-v3.js",
  poki: "https://game-cdn.poki.com/scripts/v2/poki-sdk.js",
}
const sdkAt = process.argv.indexOf("--sdk")
const SDK = sdkAt > 0 ? process.argv[sdkAt + 1] : null
if (SDK && !SDKS[SDK]) { console.error(`build:portal: --sdk must be one of ${Object.keys(SDKS).join(", ")}`); process.exit(1) }
const SDK_TAG = SDK ? `<script src="${SDKS[SDK]}"></script>` : ""

const config = (await import(pathToFileURL(join(ROOT, "relay.config.mjs")))).default
const { loadCredits } = await import(pathToFileURL(join(ROOT, "src/server/credits.mjs")))
const { dayKey, puzzleNumber } = await import(pathToFileURL(join(ROOT, "src/core/day.mjs")))

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

for (const p of ["src/core", "src/client", "src/game", `themes/${config.theme}`, "relay.config.mjs", "credits.json"]) {
  if (existsSync(join(ROOT, p))) await cp(join(ROOT, p), join(OUT, p), { recursive: true })
}
await cp(join(ROOT, "public/app.css"), join(OUT, "app.css"))
if (existsSync(join(ROOT, "public/icon.svg"))) await cp(join(ROOT, "public/icon.svg"), join(OUT, "icon.svg"))
// The controller shim goes in the folder. A portal build is the one place a pad is likeliest to
// be plugged in, and it is the one place nothing may be fetched from another origin.
if (existsSync(join(ROOT, "public/pad.js"))) await cp(join(ROOT, "public/pad.js"), join(OUT, "pad.js"))

// Absolute module specifiers ("/src/core/day.mjs") only work at a site root.
// Rewrite each to a path relative to the file that imports it.
let rewritten = 0
async function relativise(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = join(dir, e.name)
    if (e.isDirectory()) { await relativise(f); continue }
    if (!f.endsWith(".mjs")) continue
    const up = relative(dirname(f), OUT).split(sep).join("/")
    const prefix = up ? up + "/" : "./"
    const src = await readFile(f, "utf8")
    const out = src.replace(/(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)(["'])\/(?!\/)([^"']+)\2/gm, (_, k, q, p) => { rewritten++; return `${k}${q}${prefix}${p}${q}` })
    if (out !== src) await writeFile(f, out)
  }
}
await relativise(OUT)

const today = dayKey(config.timezone)
// Credits keep every name and licence, but lose their urls: a portal build
// names the maker without linking out, and a url left in the page is a link
// a portal's scanner will find whether or not anything renders it.
const credits = await loadCredits(ROOT, config)
const unlinked = credits && Object.fromEntries(Object.entries(credits).map(([g, list]) =>
  [g, Array.isArray(list) ? list.map(({ url, ...rest }) => rest) : list]))
const RELAY = {
  key: config.key, title: config.title, tagline: config.tagline,
  metric: config.metric, practiceGate: config.practiceGate, practice: config.practice,
  crews: false, archive: false, number: puzzleNumber(today, config.epoch), origin: "",
  modes: { daily: { id: "daily" } }, doors: [],
  credits: unlinked,
  portal: true,
  sdk: SDK,
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
let html = await readFile(join(ROOT, "public/index.html"), "utf8")
html = html
  .replace(/<!-- The unfurl[\s\S]*?-->\n?/, "")
  .split("\n")
  .filter((line) => !/property="og:|name="twitter:|rel="manifest"|rel="apple-touch-icon"|src="\/t\.js"|gameaday\.xyz\/gameaday\.js/.test(line))
  .join("\n")
  .replace(/(href|src)="\/(?!\/)([^"?]+)(\?v=%BUILD%)?"/g, (_, attr, p) => `${attr}="./${p}"`)
  .replaceAll("%THEME%", esc(config.theme))
  .replaceAll("%TITLE%", esc(config.title))
  .replaceAll("%DESC%", esc(config.description || ""))
  .replaceAll("%NAME%", esc(config.title))
  .replaceAll("%STAGE%", config.stage === "fixed" ? "fixed" : "fill")
  .replaceAll("%BUILD%", "portal")
  .replaceAll("%CONFIG%", JSON.stringify(RELAY).replace(/</g, "\\u003c"))
// The SDK loads before the host module, so it exists by the time the host asks.
if (SDK_TAG) {
  if (!html.includes("</head>")) { console.error("build:portal: index.html has no </head> to put the SDK tag before"); process.exit(1) }
  html = html.replace("</head>", `${SDK_TAG}\n</head>`)
}
await writeFile(join(OUT, "index.html"), html)

// The build refuses to finish with anything a portal would reject in it.
const problems = []
const withoutSdk = SDK_TAG ? html.replace(SDK_TAG, "") : html
if (/https?:\/\//.test(withoutSdk)) problems.push("index.html references an origin other than the portal SDK")
if (SDK && html.split(SDKS[SDK]).length !== 2) problems.push("the SDK tag should appear exactly once")
if (/%[A-Z]+%/.test(html)) problems.push("index.html has an unfilled placeholder: " + html.match(/%[A-Z]+%/)[0])
if (/\/t\.js|sw\.js|manifest\.webmanifest/.test(html)) problems.push("index.html still loads analytics, a service worker or a manifest")
async function scanImports(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = join(dir, e.name)
    if (e.isDirectory()) await scanImports(f)
    else if (f.endsWith(".mjs") && /\bfrom\s*["']\/(?!\/)/.test(await readFile(f, "utf8"))) problems.push(`${relative(OUT, f)} still has an absolute import`)
  }
}
await scanImports(OUT)
if (problems.length) { console.error("build:portal FAILED\n  " + problems.join("\n  ")); process.exit(1) }

console.log(`build:portal  ${config.title}${SDK ? "  + " + SDK + " sdk" : ""}  ->  ${OUT}
  ${rewritten} imports made relative; daily only, seeded on the device, no links out.
  Zip the folder's contents (index.html at the top) for CrazyGames, Poki or itch.`)
