#!/usr/bin/env node
// The assumption ledger.
//
// Every game built on this template starts by writing down what it is assuming,
// because the expensive mistakes in this collection were never bugs — they were
// beliefs. "Active tomatoes is the difficulty dial." "The spec terminates."
// "Purge radius is a dial." Each one was held confidently, was never written
// down, and cost a day.
//
// So: assumptions are HYPOTHESES with an id and a status. Some of them this file
// can test for you and does, on every `npm test`. The rest you answer in prose,
// and the checker only insists that you answered.
//
// When one turns out to be wrong you run `assume break`, which flips it and
// opens a lesson stub — because a broken assumption IS the lesson, and that is
// the only moment the knowledge is cheap to capture. `assume promote` then
// carries lessons back up into the template's DESIGN-LESSONS.md so the next
// game starts from what this one learned.
//
//   node tools/assume.mjs check                 what can be verified, is
//   node tools/assume.mjs break <id> "why"      an assumption failed -> lesson stub
//   node tools/assume.mjs learn "..."           record a lesson that came from nowhere
//   node tools/assume.mjs promote [--write]     send lessons up to the template
//   node tools/assume.mjs init                  fresh ledger (new-game.mjs runs this)

import { readFile, writeFile, appendFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

const ROOT = resolve(new URL("..", import.meta.url).pathname)
const LEDGER = join(ROOT, "ASSUMPTIONS.md")
const LESSONS = join(ROOT, "LESSONS.md")
const cmd = process.argv[2] || "check"

const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`

// ---------------------------------------------------------------------------
// The standing questions. Every one of these is here because getting it wrong
// has already cost somebody a day. `auto` ones are machine-checked below; the
// rest need a written answer and the checker will not accept the placeholder.

const QUESTIONS = [
  { id: "independent-numbers", auto: false,
    q: "Which of your difficulty numbers are actually independent, and which are derived from the others?",
    why: "Vine Drop's spec listed 'tomatoes on the vine' as the dial. It is not one: count = drop rate x lifetime, so the spec's late-game numbers implied ~7 drops a second. Invisible until simulated." },
  { id: "terminates", auto: true,
    q: "Does every run end?",
    why: "Detritus, as specified, could not terminate. Nothing in its rules rewarded advancing." },
  { id: "metric-moves", auto: true,
    q: "Does the leaderboard metric actually vary between runs?",
    why: "A metric that is the same for everybody is a leaderboard sorted by submission time wearing a hat." },
  { id: "strip-not-fingerprint", auto: true,
    q: "Can the share strip be reversed into the answer?",
    why: "If the number of distinct strips approaches the number of distinct puzzles, the strip is an identifier and the game dies in the group chat that liked it most." },
  { id: "rules-pure", auto: true,
    q: "Is the rules file free of the DOM, the clock and unseeded randomness?",
    why: "It is the anti-cheat, and it is only the anti-cheat while it is pure. One Date.now() and the server can no longer reproduce a run." },
  { id: "deterministic", auto: true,
    q: "Does the same seed produce the same run, every time?",
    why: "Everything downstream — verification, the daily itself, the archive — is built on this." },
  { id: "identity-set", auto: true,
    q: "Have you set key, title and epoch away from the template's defaults?",
    why: "Two games sharing a key hand out the same puzzle. An unset epoch means puzzle numbers that do not match the day you launched." },
  { id: "share-card", auto: true,
    q: "Is there real art on the share card, and does it render?",
    why: "The card is the first thing a stranger sees, in a chat, before the game. It is the ad. Every game before Relay shipped one flat og.png with a title on it, and that is a bill, not an ad. Put a 1200x630 PNG at themes/<theme>/card.png first, then `npm run card` and look at it." },
  { id: "practice-not-spoiler", auto: true,
    q: "Does the practice-gate seed collide with any real day's puzzle?",
    why: "The first-run practice round handing somebody next Tuesday's puzzle is a slow leak nobody would think to look for." },
  { id: "credits", auto: true,
    q: "Is everyone whose work is in the game credited, by name, with a link?",
    why: "Credit generously wherever it is due. A pack of sounds, a font or a public-domain hash in a shipped game without its maker's name on it is a debt, and the home screen's Credits link is where it gets paid. The block lives in relay.config.mjs." },
  { id: "one-handed", auto: false,
    q: "Can this be played one-handed on a phone, outdoors, while walking?",
    why: "That is how a link from a group chat is opened. If it needs a keyboard it is not a link game; daily-maze had to ship separate boards for mouse and touch." },
  { id: "day-boundary", auto: false,
    q: "Why did you pick this timezone for the day boundary, and who does it disadvantage?",
    why: "One global boundary means the chat always discusses one puzzle and someone can be spoiled. A per-player boundary means nobody is spoiled and the chat is incoherent. Three games here each picked differently, by accident." },
  { id: "first-thirty-seconds", auto: false,
    q: "What does a stranger who has never heard of this see in their first thirty seconds?",
    why: "They arrived from a link, mid-conversation, with no context and no patience." },
  { id: "still-fun-day-30", auto: false,
    q: "What makes day 30 different from day 3? If nothing does, say so.",
    why: "'It is randomised' is not an answer. Most dailies die of sameness, not of difficulty." },
]

// ---------------------------------------------------------------------------

const PLACEHOLDER = /^\s*(TODO|TBD|\?+|—+|-+)?\s*$/i

async function readLedger() {
  if (!existsSync(LEDGER)) return null
  const text = await readFile(LEDGER, "utf8")
  const entries = new Map()
  // ### <id> [status]\n> question\n\nanswer...
  const re = /^###\s+([a-z0-9-]+)\s*(?:\[(held|broken|open)\])?\s*$/gm
  const marks = [...text.matchAll(re)]
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i][0].length
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length
    const body = text.slice(start, end)
    const answer = body.split("\n").filter((l) => !l.startsWith(">") && !l.startsWith("_")).join("\n").trim()
    entries.set(marks[i][1], { status: marks[i][2] || "open", answer })
  }
  return { text, entries }
}

function ledgerTemplate(title) {
  const head = `# ${title} — assumptions

Written before the game was, checked on every \`npm test\`. Each of these is a
HYPOTHESIS, not a decision: the point is that it is written down where it can be
found to be wrong. When one breaks, run \`node tools/assume.mjs break <id> "what
actually happened"\` — that is the moment the lesson is cheap to capture.

Answers marked _auto_ are verified by \`node tools/assume.mjs check\`. The rest
need a sentence from you; the checker will not accept a blank or a TODO.

`
  const body = QUESTIONS.map((q) => `### ${q.id} [open]
> ${q.q}
_${q.auto ? "auto — checked for you" : "answer below"}. ${q.why}_

${q.auto ? "" : "TODO"}
`).join("\n")
  return head + body
}

// --- the automatic checks ---------------------------------------------------

async function loadGame() {
  const cfg = (await import(join(ROOT, "relay.config.mjs"))).default
  const candidates = ["src/game/game.rules.mjs", `src/game/${cfg.key}.rules.mjs`, "src/game/keyhole.rules.mjs"]
  for (const c of candidates) {
    if (existsSync(join(ROOT, c))) return { cfg, rules: await import(join(ROOT, c)), path: c }
  }
  return { cfg, rules: null, path: null }
}

async function runAuto() {
  const out = new Map()
  const { cfg, rules, path } = await loadGame()
  const { makeRng } = await import(join(ROOT, "src/core/rng.mjs"))
  const { seedFor } = await import(join(ROOT, "src/core/seed.mjs"))
  const { dayForPuzzle } = await import(join(ROOT, "src/core/day.mjs"))
  const say = (id, pass, note) => out.set(id, { pass, note })

  // credits — needs no rules, so it runs before anything that might bail out.
  {
    const { checkCredits } = await import(join(ROOT, "src/core/credits.mjs"))
    const { loadCredits } = await import(join(ROOT, "src/server/credits.mjs"))
    let credits = null, problems
    try { credits = await loadCredits(ROOT, cfg); problems = checkCredits(credits) } catch (e) { problems = [e.message] }
    const n = problems.length ? 0 : Object.values(credits).reduce((a, l) => a + l.length, 0)
    say("credits", problems.length === 0, problems.join("; ") || `${n} credited — add every pack, font, sound and person you use`)
  }

  if (!rules) { for (const q of QUESTIONS) if (q.auto) say(q.id, false, "no rules file found"); return out }

  // identity-set. The template repo is allowed to still be Keyhole — that is
  // what it is. A scaffolded game deletes the marker and this starts biting.
  {
    if (existsSync(join(ROOT, ".relay-template"))) {
      say("identity-set", true, "this is the template itself, not a game")
    } else {
      const stale = []
      if (cfg.key === "keyhole") stale.push("key is still 'keyhole'")
      if (cfg.title === "Keyhole") stale.push("title is still 'Keyhole'")
      if (Date.parse(cfg.epoch + "T00:00:00Z") > Date.now() + 86400000) stale.push("epoch is in the future")
      say("identity-set", stale.length === 0, stale.join("; ") || "key, title and epoch are yours")
    }
  }

  // share-card. Art must exist, be big enough, not be a flat fill, and the
  // renderer must get through it. The template itself is allowed to be bare.
  {
    const art = join(ROOT, "themes", cfg.theme, "card.png")
    if (existsSync(join(ROOT, ".relay-template"))) {
      say("share-card", true, "this is the template itself, not a game")
    } else if (!existsSync(art)) {
      say("share-card", false, `no themes/${cfg.theme}/card.png — the card is a flat colour with a title on it`)
    } else {
      try {
        const { readPNG } = await import(join(ROOT, "src/server/png.mjs"))
        const { renderCard } = await import(join(ROOT, "src/server/og.mjs"))
        const { loadTheme } = await import(join(ROOT, "src/server/theme.mjs"))
        const img = readPNG(await readFile(art))
        const problems = []
        if (img.w < 1200 || img.h < 630) problems.push(`${img.w}x${img.h} is smaller than 1200x630 and will blur`)
        // Luminance spread over a coarse grid. A flat fill or a two-tone
        // placeholder has almost none; a picture has plenty.
        let n = 0, sum = 0, sq = 0
        for (let y = 0; y < img.h; y += 8) for (let x = 0; x < img.w; x += 8) {
          const j = (y * img.w + x) * 4
          const l = 0.299 * img.rgba[j] + 0.587 * img.rgba[j + 1] + 0.114 * img.rgba[j + 2]
          n++; sum += l; sq += l * l
        }
        const sd = Math.sqrt(sq / n - (sum / n) ** 2)
        if (sd < 12) problems.push(`luminance spread ${sd.toFixed(1)} — this is a flat fill, not a picture`)
        const theme = await loadTheme(ROOT, cfg.theme)
        const png = await renderCard({ theme, art, title: cfg.title, number: 1, headline: cfg.tagline || "", stats: [], footer: "" })
        if (!png || png.length < 1000) problems.push("renderCard produced nothing")
        say("share-card", problems.length === 0, problems.join("; ") || `themes/${cfg.theme}/card.png ${img.w}x${img.h}, spread ${sd.toFixed(0)}, renders — now run \`npm run card\` and LOOK at it`)
      } catch (e) {
        say("share-card", false, `card.png could not be read or rendered: ${e.message}`)
      }
    }
  }

  // rules-pure
  {
    const raw = await readFile(join(ROOT, path), "utf8")
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    const found = src.match(/Math\.random|Date\.now|performance\.now|new Date|document\.|window\./g)
    say("rules-pure", !found, found ? `found ${[...new Set(found)].join(", ")} in ${path}` : `${path} is pure`)
  }

  // deterministic
  {
    const a = JSON.stringify(rules.create(123456))
    const b = JSON.stringify(rules.create(123456))
    say("deterministic", a === b, a === b ? "same seed, same opening state" : "create() is not a function of its seed")
  }

  // practice-not-spoiler — does the tutorial seed collide with a real day?
  {
    if (rules.PRACTICE_SEED == null) say("practice-not-spoiler", true, "no practice seed declared")
    else {
      let clash = null
      for (let n = 1; n <= 400 && !clash; n++) {
        const day = dayForPuzzle(n, cfg.epoch)
        for (const salt of ["", process.env.DAILY_SALT || "relay-dev-salt"]) {
          if (seedFor({ gameKey: cfg.key, day, salt }) === rules.PRACTICE_SEED) clash = `#${n}`
        }
      }
      say("practice-not-spoiler", !clash, clash ? `practice seed is also puzzle ${clash}` : "practice seed hits no real day in the first 400")
    }
  }

  // The three that need to actually PLAY the game.
  if (typeof rules.moves !== "function") {
    for (const id of ["terminates", "metric-moves", "strip-not-fingerprint"]) {
      say(id, null, "cannot check: rules file exports no moves(state, rng)")
    }
    return out
  }

  const RUNS = 400, CAP = 5000
  const metrics = new Set(), stripsByPuzzle = new Map()
  let stuck = 0
  for (let i = 0; i < RUNS; i++) {
    const rng = makeRng(0xbeef + i)
    const s = rules.create(seedFor({ gameKey: cfg.key, day: dayForPuzzle(i + 1, cfg.epoch), salt: "check" }))
    let n = 0
    while (!s.over && n++ < CAP) {
      const m = rules.moves(s, rng)
      if (!m || !m.length) break
      rules.apply(s, m[Math.floor(rng.next() * m.length)])
    }
    if (!s.over) stuck++
    const r = rules.result(s, { seconds: 1 })
    metrics.add(r.metric)
    const strip = (r.events || []).join("")
    stripsByPuzzle.set(strip, (stripsByPuzzle.get(strip) || 0) + 1)
  }

  say("terminates", stuck === 0, stuck === 0
    ? `${RUNS} random runs all ended inside ${CAP} moves`
    : `${stuck}/${RUNS} random runs never reached an end state`)

  say("metric-moves", metrics.size > 1, metrics.size > 1
    ? `${metrics.size} distinct metric values across ${RUNS} runs`
    : `every run scored ${[...metrics][0]}`)

  // If nearly every run produces its own unique strip, the strip is an id.
  const uniques = [...stripsByPuzzle.values()].filter((n) => n === 1).length
  const ratio = uniques / RUNS
  say("strip-not-fingerprint", ratio < 0.5,
    `${stripsByPuzzle.size} distinct strips over ${RUNS} runs, ${(ratio * 100).toFixed(0)}% of them unique`)

  return out
}

// --- commands ----------------------------------------------------------------

async function check() {
  const cfg = (await import(join(ROOT, "relay.config.mjs"))).default
  if (!existsSync(LEDGER)) {
    console.log(yellow("no ASSUMPTIONS.md — writing one"))
    await writeFile(LEDGER, ledgerTemplate(cfg.title))
  }
  const ledger = await readLedger()
  const auto = await runAuto()
  let failed = 0, skipped = 0

  console.log(`\nassumptions — ${cfg.title}\n`)
  for (const q of QUESTIONS) {
    const entry = ledger.entries.get(q.id) || { status: "missing", answer: "" }
    if (entry.status === "broken") {
      console.log(`  ${yellow("broken")} ${q.id} ${dim("— recorded as wrong; see LESSONS.md")}`)
      continue
    }
    if (q.auto) {
      const a = auto.get(q.id)
      if (!a) { console.log(`  ${dim("skip")}   ${q.id}`); skipped++; continue }
      if (a.pass === null) { console.log(`  ${yellow("skip")}   ${q.id} ${dim("— " + a.note)}`); skipped++; continue }
      console.log(`  ${a.pass ? green("ok") + "    " : red("FAIL") + "  "} ${q.id} ${dim("— " + a.note)}`)
      if (!a.pass) failed++
    } else {
      const answered = entry.status !== "missing" && !PLACEHOLDER.test(entry.answer)
      console.log(`  ${answered ? green("ok") + "    " : red("FAIL") + "  "} ${q.id} ${dim(answered ? "answered" : "unanswered — " + q.q)}`)
      if (!answered) failed++
    }
  }
  console.log()
  if (skipped) console.log(dim(`${skipped} check(s) could not run.`))
  if (failed) {
    console.log(red(`${failed} assumption(s) unanswered or violated.`) + " Edit ASSUMPTIONS.md, or fix the game.")
    process.exit(1)
  }
  console.log(green("every assumption is written down and the checkable ones hold."))
}

async function breakOne() {
  const id = process.argv[3]
  const why = process.argv.slice(4).join(" ")
  if (!id || !why) { console.error('usage: assume break <id> "what actually happened"'); process.exit(1) }
  const ledger = await readLedger()
  if (!ledger || !ledger.entries.has(id)) { console.error(`no assumption "${id}" in ASSUMPTIONS.md`); process.exit(1) }
  const re = new RegExp(`^###\\s+${id}\\s*(?:\\[[a-z]+\\])?\\s*$`, "m")
  await writeFile(LEDGER, ledger.text.replace(re, `### ${id} [broken]`))
  await ensureLessons()
  const q = QUESTIONS.find((x) => x.id === id)
  await appendFile(LESSONS, `\n## ${id}\n\n**Assumed:** ${q ? q.q : id}\n\n**What actually happened:** ${why}\n\n**So:** \n\n`)
  console.log(`${id} marked broken. A lesson stub is waiting in LESSONS.md — finish the "So:" line while you still remember.`)
}

async function learn() {
  const text = process.argv.slice(3).join(" ")
  if (!text) { console.error('usage: assume learn "the lesson"'); process.exit(1) }
  await ensureLessons()
  await appendFile(LESSONS, `\n## note\n\n${text}\n\n`)
  console.log("recorded in LESSONS.md")
}

async function ensureLessons() {
  if (existsSync(LESSONS)) return
  const cfg = (await import(join(ROOT, "relay.config.mjs"))).default
  await writeFile(LESSONS, `# ${cfg.title} — lessons

Things this game found out that the template did not already know. Write them
while they still smart. When one generalises beyond this game, run
\`node tools/assume.mjs promote\` to send it up.

Leave this file empty if nothing was learned. An empty file is an honest result;
inventing lessons to fill it makes the next person trust the list less.
`)
}

async function promote() {
  if (!existsSync(LESSONS)) { console.log("no LESSONS.md — nothing learned yet, which is allowed"); return }
  const cfg = (await import(join(ROOT, "relay.config.mjs"))).default
  const body = (await readFile(LESSONS, "utf8")).split(/^## /m).slice(1)
  const real = body.filter((b) => b.trim() && !/\*\*So:\*\*\s*$/m.test(b.trim()))
  if (!real.length) { console.log("no finished lessons to promote (a stub with an empty 'So:' line does not count)"); return }

  const block = `\n---\n\n### From ${cfg.title} (${new Date().toISOString().slice(0, 10)})\n\n` +
    real.map((b) => "#### " + b.trim()).join("\n\n") + "\n"

  const target = process.argv.includes("--write") && process.env.RELAY_TEMPLATE
    ? join(process.env.RELAY_TEMPLATE, "docs/DESIGN-LESSONS.md")
    : null

  if (target && existsSync(target)) {
    await appendFile(target, block)
    console.log(`appended ${real.length} lesson(s) to ${target}`)
  } else {
    console.log(`\n${real.length} lesson(s) ready. Paste into the template's docs/DESIGN-LESSONS.md,`)
    console.log(`or set RELAY_TEMPLATE=<path to relay> and re-run with --write.\n`)
    console.log(block)
  }
}

async function init() {
  const cfg = (await import(join(ROOT, "relay.config.mjs"))).default
  await writeFile(LEDGER, ledgerTemplate(cfg.title))
  await ensureLessons()
  console.log("ASSUMPTIONS.md and LESSONS.md written")
}

const commands = { check, break: breakOne, learn, promote, init }
if (!commands[cmd]) { console.error(`unknown command "${cmd}"`); process.exit(1) }
await commands[cmd]()
