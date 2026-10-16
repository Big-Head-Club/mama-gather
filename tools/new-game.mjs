// Scaffold a new game from this template.
//
//   node tools/new-game.mjs sixes "Sixes" ../games/sixes
//
// It copies the host, drops in a rules/view pair with the contract already
// written out, and rewrites relay.config.mjs. What is left for you is the two
// files in src/game — which is the point.

import { cp, readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

const [key, title, dest] = process.argv.slice(2)
if (!key || !title || !dest) {
  console.error("usage: node tools/new-game.mjs <key> <Title> <dest-dir>")
  process.exit(1)
}
if (!/^[a-z][a-z0-9-]*$/.test(key)) { console.error("key must be kebab-case"); process.exit(1) }

const ROOT = resolve(new URL("..", import.meta.url).pathname)
const OUT = resolve(dest)
if (existsSync(OUT)) { console.error(OUT + " already exists"); process.exit(1) }

await mkdir(OUT, { recursive: true })
// CLAUDE.md travels with the game on purpose: the assumption ritual only
// happens reliably if the instructions are sitting in the project an agent opens.
for (const f of ["server.js", "package.json", "railway.json", ".gitignore", "CLAUDE.md", "src", "public", "themes", "tools", "test", "docs"]) {
  await cp(join(ROOT, f), join(OUT, f), { recursive: true }).catch(() => {})
}
// The marker is what tells `assume check` it is looking at the template rather
// than at a game. A scaffolded game does not get one, so the identity check
// starts biting immediately.
await rm(join(OUT, ".relay-template"), { force: true })
await rm(join(OUT, "ASSUMPTIONS.md"), { force: true })
await rm(join(OUT, "LESSONS.md"), { force: true })
await rm(join(OUT, "shots"), { recursive: true, force: true })
await rm(join(OUT, "src/game"), { recursive: true, force: true })
await mkdir(join(OUT, "src/game"), { recursive: true })

const today = new Date().toISOString().slice(0, 10)

await writeFile(join(OUT, "src/game/game.rules.mjs"), `// ${title} — rules. PURE: no DOM, no clock, no Math.random.
// The server imports this file and replays your players' runs with it.

import { makeRng } from "../core/rng.mjs"

export function create(seed) {
  const rng = makeRng(seed)
  return { seed, over: false, /* ... */ }
}

export function apply(state, move) {
  if (state.over) return state
  // Validate the move and ignore it if it is not legal. A replayed log that has
  // been tampered with should end in a different SCORE, never in an exception.
  return state
}

export function events(state) {
  // One glyph key per beat, for the share strip. MUST NOT ENCODE THE ANSWER.
  return []
}

export function result(state, { seconds = 0 } = {}) {
  return {
    seconds: Math.max(0, Math.min(3600, Math.round(seconds))),
    metric: 0,          // ranked by relay.config.mjs metric.dir
    tiebreak: 0,        // higher is better; use -seconds for "faster wins"
    events: events(state),
  }
}

export function replay(seed, log) {
  const s = create(seed)
  for (const move of log || []) apply(s, move)
  return s
}

export const PRACTICE_SEED = 1
`)

await writeFile(join(OUT, "src/game/game.view.mjs"), `// ${title} — view. DOM or canvas, the host does not care.

import { create, apply, result } from "./game.rules.mjs"

export default {
  glyphs: { hit: "\\u{1F7E9}", near: "\\u{1F7E8}", miss: "\\u2B1C", bad: "\\u2B1B" },
  how: ["One line on what to do.", "One line on how you are scored.", "One line on why the strip is safe to share."],

  // \`coach\` is true only for the first-ever practice round: say the quiet part
  // out loud there and nowhere else.
  mount(root, { seed, mode, coach, finish }) {
    const state = create(seed)
    const log = []
    // ... build UI into \`root\`, push moves onto \`log\`, call apply(state, move)
    // ... when state.over: finish(state, result(state))
    return { get log() { return log }, destroy() { root.replaceChildren() } }
  },
}
`)

// The template's example-game tests prove Keyhole, so they do not travel. The
// game gets the checks every Relay game has to meet, written against its own
// rules, and they grow as the game does.
await writeFile(join(OUT, "test/game.test.mjs"), `// ${title} — the properties every Relay game must hold, on this game's rules.

import { makeRng } from "../src/core/rng.mjs"
import * as rules from "../src/game/game.rules.mjs"

let bad = 0
const ok = (name, cond, extra = "") => {
  if (cond) console.log("  ok  " + name)
  else { bad++; console.log("FAIL  " + name + " " + extra) }
}

{
  const seed = 1234
  ok("the same seed builds the same board", JSON.stringify(rules.create(seed)) === JSON.stringify(rules.create(seed)))
  ok("an empty log replays without throwing", !!rules.replay(seed, []))
  const r = rules.result(rules.replay(seed, []))
  ok("a result carries a numeric metric", Number.isFinite(r.metric))
  ok("a claimed clock is clamped", rules.result(rules.replay(seed, []), { seconds: 999999 }).seconds <= 3600)
  ok("junk moves are ignored, not thrown", (() => { try { rules.replay(seed, [null, {}, { junk: 1 }]); return true } catch { return false } })())
  if (rules.moves) {
    const rng = makeRng(seed), s = rules.create(seed)
    for (let i = 0; i < 500 && !s.over; i++) { const m = rules.moves(s, rng); if (!m || !m.length) break; rules.apply(s, rng.pick(m)) }
    ok("random legal moves end the game", s.over)
  }
}

console.log(bad ? \`\\n\${bad} failing\` : "\\nall green")
process.exit(bad ? 1 : 0)
`)

let cfg = await readFile(join(ROOT, "relay.config.mjs"), "utf8")
// The credits block travels with the config, with Relay's own debts already in
// it. If the template ever loses it, stop here rather than scaffold a game that
// ships nobody's name.
if (!/\n\s*credits:\s*\{/.test(cfg)) {
  console.error("relay.config.mjs has no credits block to scaffold from — put it back (see src/core/credits.mjs RELAY_CREDITS)")
  process.exit(1)
}
cfg = cfg
  .replace(/key: "[^"]*"/, `key: "${key}"`)
  .replace(/title: "[^"]*"/, `title: "${title}"`)
  .replace(/epoch: "[^"]*"/, `epoch: "${today}"`)
await writeFile(join(OUT, "relay.config.mjs"), cfg)

await writeFile(join(OUT, "README.md"), `# ${title}

A daily game. Built on [Relay](https://github.com/Big-Head-Club/relay).

\`\`\`
npm test          # assumptions + template tests
node server.js    # http://localhost:3000
\`\`\`

- \`ASSUMPTIONS.md\` — what this game is assuming. \`npm test\` fails while any of it
  is unanswered. Answer it before writing code.
- \`LESSONS.md\` — what it turned out to be wrong about. Often empty, and that is
  fine.
- \`src/game/game.rules.mjs\` — the rules. Pure: no DOM, no clock, no
  \`Math.random\`. The server replays submitted runs with it.
- \`src/game/game.view.mjs\` — the screen.
- \`relay.config.mjs\` — name, day boundary, metric, share lines, and credits:
  add every pack, font, sound and person you use. \`npm test\` fails without it.
- \`docs/DESIGN-LESSONS.md\` — read it. Then \`docs/BORROWED-LESSONS.md\`: what other
  people's games taught them, cut to what fits a daily, with the gate questions it adds.

Production needs \`PUBLIC_ORIGIN\` (absolute, or the unfurl is wrong),
\`DAILY_SALT\` (or tomorrow is precomputable) and somewhere to keep the board:
\`DATABASE_URL\` (a Neon URL, no install needed; the app creates its own table on
boot) before the game is posted anywhere public, or \`SAVE_PATH\` on a volume for a
prototype. Without either, the leaderboard dies with the container.
\`node tools/store-roundtrip.mjs\` proves the database really round-trips.
`)

let server = await readFile(join(ROOT, "server.js"), "utf8")
await writeFile(join(OUT, "server.js"), server.replace("./src/game/keyhole.rules.mjs", "./src/game/game.rules.mjs"))
let client = await readFile(join(ROOT, "src/client/relay.mjs"), "utf8")
await writeFile(join(OUT, "src/client/relay.mjs"), client.replace("/src/game/keyhole.view.mjs", "/src/game/game.view.mjs"))

// Write the assumption ledger from inside the new project, so it is titled and
// checked against that game rather than this one.
const { execFileSync } = await import("node:child_process")
try {
  execFileSync(process.execPath, [join(OUT, "tools/assume.mjs"), "init"], { cwd: OUT, stdio: "inherit" })
} catch { /* the ledger will be written on the first `npm test` instead */ }

console.log(`
${title} scaffolded at ${OUT}

  1. answer ASSUMPTIONS.md          <- do this before you write any code
  2. write src/game/game.rules.mjs  (pure)
  3. write src/game/game.view.mjs   (the screen)
  4. edit relay.config.mjs          (metric, share lines)
  5. npm test && node server.js

Everything else — the link, the card, the day, the board, the streak, the
practice gate — already works. \`npm test\` will not pass until the assumptions
are written down; that is deliberate.`)
