// The host. Owns identity, the day, the practice gate, the board, the share,
// and nothing about the game.
//
// THREE DOORS, one engine:
//
//   play with friends      TABLE   /t/<CODE>   a private board, right now
//   compete with strangers DAILY   /           one board a day, the world
//   go deep alone          QUEST   /quest      a chain of boards, a build
//
// A game opts into each one in relay.config.mjs. With only the daily on, this
// file behaves exactly as it did before the doors existed.
//
// THE LINK NEVER LANDS ON A MENU. A stranger tapping a result link, a crew link
// or a table link goes straight into the thing that was shared with them. The
// bare front page is the daily with one Play button; the table and the quest
// are small buttons under it, never a mode picker — a four-second patience
// budget cannot afford one, and a front page that said "Play with friends /
// Compete with strangers / Go deep alone" confused its own author.
//
// The order of the screens is the whole retention argument:
//
//   arrive -> (first ever? practice round) -> today's puzzle -> result -> share
//
// A stranger who taps a link from a group chat has about four seconds of
// patience. There is no sign-in, no splash, no cookie banner and no "are you
// sure". If they have never played, they get one throwaway round FIRST, because
// spending your one daily attempt learning the controls is how a daily game
// loses somebody on day one.

import config from "/relay.config.mjs"
import * as day from "/src/core/day.mjs"
import { normaliseCrew, makeCrewCode, randomSeed, seedFor } from "/src/core/seed.mjs"
import { shareText, strip, links, decodeResult } from "/src/core/share.mjs"
import { MODE_ORDER, modesOf, normaliseCode, normaliseClaim } from "/src/core/modes.mjs"
import { viaOf, returnVisit, startFacts } from "/src/core/via.mjs"
import { creditGroups, GROUP_LABELS } from "/src/core/credits.mjs"
import game from "/src/game/game.view.mjs"

const R = window.RELAY
const $ = (s) => document.querySelector(s)
// How a score is written on the board is the GAME's business, not the host's.
// This used to be `metric > 6 ? "X" : metric`, which is Keyhole's try counter
// hardcoded into the template.
const fmtMetric = (v) => String(config.metric.format ? config.metric.format(v) : v)
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n }

// --- identity ---------------------------------------------------------------
// Anonymous by default, forever if they like. A name is asked for exactly once,
// at the moment it buys something (a row on the board), and never before.
const PLAYER_KEY = "relay." + R.key + ".player"
const NAME_KEY = "relay." + R.key + ".name"
// The last table this browser was at. The URL never carries it (see newTable),
// so a reopened tab lands on the front page with a Rejoin button, not in a
// dead room.
const TABLE_KEY = "relay." + R.key + ".table"
const SEEN_KEY = "relay." + R.key + ".practiced"
const CLAIM_KEY = "relay." + R.key + ".claim"
let playerId = localStorage.getItem(PLAYER_KEY)
if (!playerId) {
  playerId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
  localStorage.setItem(PLAYER_KEY, playerId)
}

// A PORTAL'S SDK (build:portal --sdk crazygames|poki). The portal needs to know
// when play is happening, so it can pause its own chrome and time its ads. The
// script tag is injected by the build; everything here is a no-op without it,
// and nothing waits on an SDK that failed to load.
const portalSdk = (() => {
  const kind = R.portal && R.sdk
  let ready = null, runs = 0
  const init = () => (ready ||= (async () => {
    try {
      if (kind === "crazygames" && window.CrazyGames) { await window.CrazyGames.SDK.init(); return window.CrazyGames.SDK }
      if (kind === "poki" && window.PokiSDK) { await window.PokiSDK.init(); window.PokiSDK.gameLoadingFinished(); return window.PokiSDK }
    } catch { /* an ad blocker or a local file: play on without it */ }
    return null
  })())
  if (kind) init()
  return {
    // Poki asks for a commercial break before every gameplayStart after the
    // first, when the player has chosen to keep playing. The break decides for
    // itself whether an ad actually shows.
    async beforeRun() {
      const sdk = await init()
      if (kind === "poki" && sdk && runs > 0) { try { await sdk.commercialBreak(() => {}) } catch { /* no ad */ } }
      runs++
    },
    start() { init().then((sdk) => { try { if (kind === "crazygames" && sdk) sdk.game.gameplayStart(); if (kind === "poki" && sdk) sdk.gameplayStart() } catch { /* ignore */ } }) },
    stop() { init().then((sdk) => { try { if (kind === "crazygames" && sdk) sdk.game.gameplayStop(); if (kind === "poki" && sdk) sdk.gameplayStop() } catch { /* ignore */ } }) },
    active: !!kind,
  }
})()

async function api(proc, body) {
  if (R.portal) return localApi(proc, body)
  const res = await fetch("/api/" + proc, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ playerId }, body)),
  })
  if (!res.ok) throw new Error(proc + " " + res.status)
  return res.json()
}

// A PORTAL BUILD HAS NO SERVER (tools/build-portal.mjs). The same procedures,
// answered on the device: the day's seed from the day itself, the streak and
// the practice gate in localStorage, nothing ranked. The game code cannot tell.
const LOCAL_KEY = "relay." + R.key + ".local"
function localApi(proc) {
  let s = {}
  try { s = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") } catch { s = {} }
  const save = () => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)) } catch { /* private mode */ } }
  const today = day.dayKey(config.timezone)
  const st = s.streak || { current: 0, best: 0, last_day: null }
  switch (proc) {
    case "daily.getSeed":
      return {
        day: today, number: day.puzzleNumber(today, config.epoch), crew: null,
        seed: seedFor({ gameKey: R.key, day: today, salt: "portal" }),
        isToday: true, msUntilNextDay: day.msUntilNextDay(config.timezone),
        practiceSeed: seedFor({ gameKey: R.key, day: "practice", salt: "portal", mode: "practice" }),
      }
    case "player.me": {
      const alive = st.last_day === today || st.last_day === day.previousDay(today)
      return { streak: alive ? st.current : 0, best: st.best, playedToday: false, practiced: !!s.practiced, displayName: null }
    }
    case "player.practiced":
      s.practiced = true; save()
      return { ok: true }
    case "daily.submit":
      if (st.last_day !== today) {
        st.current = st.last_day === day.previousDay(today) ? st.current + 1 : 1
        st.best = Math.max(st.best, st.current)
        st.last_day = today
        s.streak = st; save()
      }
      return { ok: true, local: true, streak: st.current }
    case "daily.leaderboard":
      return { top: [], me: null, played: 0 }
    default:
      return { error: "offline" }
  }
}

// --- url --------------------------------------------------------------------
const params = new URLSearchParams(location.search)
const archiveMatch = /^\/d\/(\d+)$/.exec(location.pathname)
const tableMatch = /^\/t\/([A-Za-z0-9]{4,8})$/.exec(location.pathname)
const questPath = location.pathname === "/quest"
let crew = R.crews ? normaliseCrew(params.get("c")) : null
// Read once, at arrival: the router rewrites the URL (a table link goes back to
// /), so asking later would call every table invite "direct".
const VIA = viaOf({ search: location.search, referrer: document.referrer })
const challengeToken = params.get("r")
const challenge = challengeToken ? config.share.fromToken(decodeResult(challengeToken) || {}) : null

// Which doors this game actually has. An old config with no `modes` block gets
// the daily and nothing else, which is what it used to have.
const doors = R.modes || { daily: true }
const hasDoor = (id) => !!doors[id]
const doorCount = MODE_ORDER.filter(hasDoor).length

let ctx = null            // { day, number, seed, crew, isToday, msUntilNextDay }
let me = null             // { streak, playedToday, practiced, displayName }
let live = null           // mounted game instance
let splash = null         // the game's own title-screen backdrop, if it has one
let lastResult = null
let table = null          // the room we are sitting at, if any
let quest = null          // the quest save, if we have opened that door

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on")
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2200)
}

function setCrew(code) {
  crew = code || null
  const p = new URLSearchParams(location.search)
  if (crew) p.set("c", crew); else p.delete("c")
  history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""))
}

// --- screens ----------------------------------------------------------------

function clearStage() {
  if (live && live.destroy) live.destroy()
  live = null
  if (splash && splash.destroy) splash.destroy()
  splash = null
  clearInterval(screenResult._t)
  $("#stage").replaceChildren()
}

function screenHome() {
  clearStage()
  // A GAME MAY OWN THE BACKDROP OF ITS OWN TITLE SCREEN. Without this the host
  // decides what every game in the collection looks like before anyone has
  // played it — which is the one screen most likely to decide whether it gets
  // played at all. The seed handed over is deliberately NOT today's: a title
  // screen showing today's room would spoil it.
  if (game.splash) splash = game.splash($("#stage"), { seed: (ctx.seed ^ 0x5a17ed) >>> 0, number: ctx.number })
  const wrap = el("div", "screen stack center" + (game.splash ? " on-splash" : ""))

  if (challenge) {
    // Somebody sent this link after playing. Lead with THEIR result — the whole
    // reason the link was tapped — and make the button the answer to it.
    const c = el("div", "stack")
    c.append(el("div", "label", "you were sent this"))
    c.append(el("div", "big", config.share.headline(challenge)))
    c.append(el("div", "muted", config.share.statLine(challenge)))
    wrap.append(c)
  } else {
    // The one place the name is said. The page has no wordmark above the stage
    // any more, so the day's number travels with the name here.
    wrap.append(el("div", "label", `#${ctx.number}`))
    wrap.append(el("div", "big", R.title.toUpperCase()))
    wrap.append(el("div", "muted", R.tagline))
  }

  if (crew) wrap.append(el("div", "label", `crew ${crew} — your group's own puzzle`))
  if (!ctx.isToday) wrap.append(el("div", "label", `from the archive — #${ctx.number} does not score`))

  const play = el("button", "btn", challenge ? "Beat it" : (me && me.playedToday && ctx.isToday ? "See today's result" : "Play"))
  play.onclick = () => {
    if (me && me.playedToday && ctx.isToday) return screenBoard()
    if (R.practiceGate && !me?.practiced && !localStorage.getItem(SEEN_KEY)) return startRun("gate")
    startRun("daily")
  }
  wrap.append(play)

  if (R.practice) {
    const p = el("button", "btn ghost", "Practice round")
    p.onclick = () => startRun("practice")
    wrap.append(p)
  }
  // The other doors, small, under Play. The front page used to be a menu of
  // three modes ("Play with friends / Compete with strangers / Go deep alone")
  // and nothing on it said "play". Now it is the daily with one Play button;
  // a table and a quest are a tap further down.
  if (!challenge) {
    const last = localStorage.getItem(TABLE_KEY)
    if (last && hasDoor("table")) {
      const b = el("button", "btn ghost", "Rejoin " + last)
      b.onclick = () => screenTable(last)
      wrap.append(b)
    }
    if (hasDoor("table")) {
      const b = el("button", "btn ghost", "Play with friends")
      b.onclick = newTable
      wrap.append(b)
    }
    if (hasDoor("quest")) {
      const b = el("button", "btn ghost", "Quest")
      b.onclick = goQuest
      wrap.append(b)
    }
  }
  if (me && me.streak > 0) wrap.append(el("div", "label", `${me.streak} day streak`))

  // A GAME MAY ADD A DOOR OF ITS OWN. The host knows about the daily, a table
  // and a quest; a game that has built something else — a versus board, an
  // editor, an archive of its own — had nowhere to put it, and a mode nobody
  // can find from the front page does not exist. `doors` in the config is a
  // list of { label, href } and they sit under Play with the rest.
  if (!challenge) {
    for (const d of R.doors || []) {
      const b = el("button", "btn ghost", d.label)
      b.onclick = () => { location.href = d.href }
      wrap.append(b)
    }
  }

  // The two glyphs that used to sit in the page corners — a "?" and a globe —
  // are gone. What they opened lives here instead, as words, at the foot of the
  // one screen where a player is deciding what to do. A menu made of two icons
  // in opposite corners is not a menu; it is two things nobody presses.
  const feet = el("div", "feet")
  const howLink = el("button", "textlink", "How to play")
  howLink.onclick = () => howSheet()
  feet.append(howLink)
  if (R.crews) {
    const crewLink = el("button", "textlink", crew ? `Crew ${crew}` : "Play with a crew")
    crewLink.onclick = crewSheet
    feet.append(crewLink)
  }
  if (creditGroups(R.credits).length) {
    const creditsLink = el("button", "textlink", "CREDITS")
    creditsLink.setAttribute("data-credits", "")
    creditsLink.onclick = screenCredits
    feet.append(creditsLink)
  }
  wrap.append(feet)
  // our other games, under everything else on the door (gameaday shelf; in flow, never over play)
  const shelf = el("div", "gad-shelf")
  wrap.append(shelf)
  // the shelf pulls the other games' share art (a megabyte each): it waits until this page has loaded and
  // settled, so the game's own forest, models and sounds come first
  gad((G) => { const go = () => G.shelf({ container: shelf, gameId: R.key }); if (window.requestIdleCallback) requestIdleCallback(() => setTimeout(go, 1500), { timeout: 3000 }); else setTimeout(go, 2500) })

  $("#stage").append(wrap)
}

// The gameaday SDK loads deferred from another origin: call it when it is there, never let it touch the game.
function gad(fn) {
  const go = () => { if (window.GameADay) try { fn(window.GameADay) } catch {} }
  if (window.GameADay) go(); else addEventListener("load", go, { once: true })
}
gad((G) => G.start({ gameId: R.key }))

// One mount for every mode. `opts.seed` and `opts.params` are how a table hands
// over its board and a quest leg hands over its difficulty and your army — the
// SERVER owns both, so a client cannot deal itself an easy leg.
function startRun(mode, opts = {}) {
  if (portalSdk.active) return portalSdk.beforeRun().then(() => startRunNow(mode, opts))
  return startRunNow(mode, opts)
}

function startRunNow(mode, opts = {}) {
  clearStage()
  portalSdk.start()
  const seed = opts.seed != null ? opts.seed
    : mode === "daily" ? ctx.seed : mode === "gate" ? ctx.practiceSeed : randomSeed()
  const started = Date.now()
  if (window.tally) {
    let facts = { days_since_first: 0, new: false }
    try {
      facts = startFacts({ firstDay: localStorage.getItem(FIRST_KEY), startedBefore: localStorage.getItem(STARTED_KEY), today: day.dayKey(config.timezone) })
      localStorage.setItem(STARTED_KEY, "1")
    } catch { /* storage blocked: the start still counts, just not as new */ }
    tally("start", { mode, via: VIA, crew: !!crew, ...facts })
  }
  live = game.mount($("#stage"), {
    seed, mode, params: opts.params,
    // SEED DECIDES WHAT IS DRAWN, NUMBER DECIDES WHICH DAY IT IS DRAWN FOR.
    // A seed is a hash, so a game with a story arc, a ladder, or an on-ramp
    // that opens its early days out cannot recover the day from it, and was
    // forced to scramble its own progression. GRUK logged this and BANK SHOT
    // was the second game to need it. The server passes the same number into
    // replay, so the board it rebuilds is the board that was played.
    number: mode === "gate" ? 1 : ctx.number,
    // The gate round is allowed to talk. The daily never is.
    coach: mode === "gate",
    finish: (state, result) => {
      const seconds = Math.round((Date.now() - started) / 1000)
      // SNAPSHOT THE INPUT LOG HERE, while the game is still mounted. The next
      // screen calls clearStage(), which destroys the instance and nulls `live`
      // — so reading `live.log` from screenResult() always came back empty, and
      // the fallback that covered it (`state.guesses`) was Keyhole's own shape.
      // Every other game silently submitted [], was rejected as a mismatch, and
      // had its player FLAGGED for cheating on an honest run.
      // THE SEED THE RUN ACTUALLY USED, not the day's. A practice round, a table
      // and a quest leg all play a different board from today's, so a result
      // screen that redraws from ctx.seed replays the log against the WRONG
      // board — and it looks convincing, because it is the right log.
      const r = Object.assign({}, result, { seconds, number: ctx.number, mode, seed, log: (live && live.log) || [] })
      lastResult = r
      portalSdk.stop()
      // Analytics milestones, named the same in every game so dashboards line
      // up: win/lose when the result says which, finish when it does not.
      if (window.tally) {
        const won = r.won ?? r.solved ?? r.win
        tally(typeof won === "boolean" ? (won ? "win" : "lose") : "finish", { mode, seconds, score: r.metric })
      }
      if (mode === "gate") { localStorage.setItem(SEEN_KEY, "1"); api("player.practiced").catch(() => {}); return screenGateDone(r) }
      if (mode === "table") return sendTable(r)
      if (mode === "quest") return sendQuest(r)
      screenResult(r, state)
    },
  })
}

function screenGateDone(r) {
  clearStage()
  const wrap = el("div", "screen stack center")
  wrap.append(el("div", "label", "practice round"))
  wrap.append(el("div", "big", "THAT'S THE IDEA"))
  wrap.append(el("div", "muted", "That one didn't count. Today's is a different one, and you get one go at it."))
  const b = el("button", "btn", "Play today's")
  b.onclick = () => startRun("daily")
  wrap.append(b)
  $("#stage").append(wrap)
}

async function screenResult(r, state) {
  clearStage()
  const wrap = el("div", "screen stack center")
  // A GAME MAY SHOW THE THING THE PLAYER JUST MADE. Some games end in a number
  // and some end in an artefact — a board, a route, a picture — and for those
  // the result screen was throwing it away and printing a percentage. The game
  // gets the seed, the day and its own input log, so it can rebuild exactly
  // what happened rather than being handed a summary of it.
  if (game.resultArt) {
    const art = el("div", "resultart")
    wrap.append(art)
    try { game.resultArt(art, { seed: r.seed ?? ctx.seed, number: ctx.number, log: r.log || [], result: r }) } catch { art.remove() }
  }
  wrap.append(el("div", "label", r.mode === "daily" ? `${R.title} #${ctx.number}` : "practice — not scored"))
  wrap.append(el("div", "big", config.share.headline(r)))
  wrap.append(el("div", "muted", config.share.statLine(r)))
  const s = el("div", "strip", strip(r.events, game.glyphs))
  wrap.append(s)

  const rank = el("div", "label", "")
  wrap.append(rank)

  // A portal forbids links out, and a share is a link.
  if (!R.portal) {
    const share = el("button", "btn", "Share")
    share.onclick = () => doShare(r)
    wrap.append(share)
  }

  // The countdown and the streak lived only in the rail, which is a desktop-
  // only element — so on a phone, where every one of these links is actually
  // opened, the game never told anybody when the next puzzle lands. That is the
  // one line half the dailies in the collection forgot.
  if (ctx.isToday) {
    const next = el("div", "label", "")
    wrap.append(next)
    clearInterval(screenResult._t)
    let ms = ctx.msUntilNextDay
    const tick = () => {
      const s = me && me.streak > 0 ? `${me.streak} day streak · ` : ""
      next.textContent = `${s}next puzzle in ${day.formatCountdown(ms)}`
      ms -= 1000
    }
    tick(); screenResult._t = setInterval(tick, 1000)
    const remind = remindButton("Remind me tomorrow")
    if (remind) wrap.append(remind)
  }

  if (R.practice) {
    const p = el("button", "btn ghost", "Practice again")
    p.onclick = () => startRun("practice")
    wrap.append(p)
  }
  if (r.mode === "daily") {
    const end = el("div", "gad-end")
    wrap.append(end)
    gad((G) => G.end({ container: end, gameId: R.key, score: r.metric }))
  }
  $("#stage").append(wrap)

  if (r.mode !== "daily" || !ctx.isToday) return
  try {
    const out = await api("daily.submit", {
      day: ctx.day, crew, log: r.log || [],
      claimed: { metric: r.metric, seconds: r.seconds },
      displayName: localStorage.getItem(NAME_KEY) || undefined,
    })
    // Nothing to rank against on a portal: the streak moves, nobody is asked
    // for a name for a board that does not exist.
    if (out.local) { rank.remove(); me = await api("player.me"); return }
    if (out.error === "alreadyPlayed") { rank.textContent = "today's run is already in"; return }
    if (out.error) { rank.textContent = "not scored: " + out.error; return }
    rank.textContent = `#${out.rank} of ${out.of}`
    me = await api("player.me")
    if (!localStorage.getItem(NAME_KEY)) askName()
    } catch {
    rank.textContent = "offline — score kept on this device only"
  }
}

function askName() {
  openSheet((body) => {
    body.append(el("h2", null, "Name for the board"))
    body.append(el("p", "muted", "Optional. Your score already counts without one."))
    const input = el("input")
    input.maxLength = 16; input.placeholder = "3–16 characters"
    input.style.cssText = "width:100%;padding:12px;font:inherit;border-radius:10px;border:var(--rule-w) solid var(--rule);background:var(--panel-2);color:var(--ink)"
    body.append(input)
    const save = el("button", "btn", "Save")
    save.onclick = async () => {
      const n = input.value.trim()
      if (n.length < 3) return toast("3 characters or more")
      const out = await api("player.setName", { displayName: n })
      if (out.error) return toast(out.error)
      localStorage.setItem(NAME_KEY, out.displayName)
      closeSheet()
    }
    body.append(save)
    const skip = el("button", "btn ghost", "Stay anonymous")
    skip.onclick = () => { localStorage.setItem(NAME_KEY, ""); closeSheet() }
    body.append(skip)
  })
}

async function doShare(r) {
  window.tally && tally("share", { mode: r.mode })
  const l = links({ origin: R.origin || location.origin, number: ctx.number, crew, result: config.share.token(r) })
  const text = shareText({
    title: R.title.toUpperCase(), number: ctx.number,
    lines: [config.share.statLine(r) + (crew ? ` · crew ${crew}` : "")],
    strips: [strip(r.events, game.glyphs)],
    url: l.result,
  })
  try {
    if (navigator.share) { await navigator.share({ text }); return }
    await navigator.clipboard.writeText(text)
    toast("Copied — paste it in the chat")
  } catch { /* the user dismissed the sheet */ }
}

async function screenBoard() {
  clearStage()
  const wrap = el("div", "screen stack")
  wrap.append(el("div", "label", crew ? `crew ${crew}` : "today, everyone"))
  const list = el("ol", "board"); wrap.append(list)
  const back = el("button", "btn ghost", "Back"); back.onclick = screenHome; wrap.append(back)
  $("#stage").append(wrap)
  fillBoard(list)
}

async function fillBoard(list) {
  list.replaceChildren(el("li", null, "loading…"))
  try {
    const { top, me: mine } = await api("daily.leaderboard", { day: ctx.day, crew })
    list.replaceChildren()
    if (!top.length) { list.append(el("li", "muted", "Nobody has finished yet today.")); return }
    for (const row of top.slice(0, 20)) {
      const li = el("li", row.playerId === playerId ? "me" : null)
      li.append(el("span", "r", String(row.rank)))
      li.append(el("span", "n", row.displayName || "anon"))
      li.append(el("span", "v", fmtMetric(row.metric)))
      list.append(li)
    }
    if (mine && mine.rank > 20) {
      const li = el("li", "me")
      li.append(el("span", "r", String(mine.rank)))
      li.append(el("span", "n", mine.displayName || "you"))
      li.append(el("span", "v", fmtMetric(mine.metric)))
      list.append(li)
    }
  } catch { list.replaceChildren(el("li", "muted", "Board unavailable.")) }
}

// --- play with friends ------------------------------------------------------

// Bots sit in the empty seats of a deadline table. The one who opens the table
// picks how hard they play; the choice is remembered for their next table.
const BOT_KEY = "relay." + R.key + ".bots"
const BOT_LEVELS = ["easy", "normal", "hard"]
const savedBotLevel = () => { const v = localStorage.getItem(BOT_KEY); return BOT_LEVELS.includes(v) ? v : "normal" }

function botPicker() {
  const row = el("div", "seg")
  row.setAttribute("role", "radiogroup")
  row.setAttribute("aria-label", "Bots")
  row.append(el("span", "label", "bots"))
  for (const lvl of BOT_LEVELS) {
    const b = el("button", "seg-opt", lvl[0].toUpperCase() + lvl.slice(1))
    b.setAttribute("role", "radio")
    b.setAttribute("aria-checked", String(table.botLevel === lvl))
    b.onclick = async () => {
      if (table.botLevel === lvl) return
      const out = await api("table.botLevel", { code: table.code, botLevel: lvl }).catch(() => null)
      if (!out || out.error) return toast(out && out.error === "resolved" ? "The bots have already played" : "Could not change the bots")
      localStorage.setItem(BOT_KEY, lvl)
      table = out
      screenTable(table.code)
    }
    row.append(b)
  }
  return row
}

async function newTable() {
  const out = await api("table.create", { displayName: localStorage.getItem(NAME_KEY) || undefined, botLevel: savedBotLevel() }).catch(() => null)
  if (!out || out.error) return toast("Could not start a table")
  // The address bar stays bare on purpose. Writing /t/CODE into it made every
  // table this tab ever opened its permanent home page: a bookmark, a
  // restored tab and a link somebody sent all look the same to the router.
  // The code lives in storage instead, and the front page offers it back.
  localStorage.setItem(TABLE_KEY, out.code)
  table = out
  screenTable(out.code)
}

async function screenTable(code) {
  clearStage()
  if (!table || table.code !== code) {
    const out = await api("table.state", { code }).catch(() => null)
    if (!out || out.error) { toast("That table has gone"); localStorage.removeItem(TABLE_KEY); return screenHome() }
    table = out
  }
  const wrap = el("div", "screen stack center")
  wrap.append(el("div", "label", "table"))
  wrap.append(el("div", "big", table.code))

  if (table.resolve === "deadline") {
    // Commit alone, resolve together. Before the hour: who is in, never what
    // they did, and a clock. After: the table, bots and all.
    const hour = new Date(table.deadlineAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    if (!table.resolved) {
      const names = table.committed.map((c) => c.displayName || "anon")
      wrap.append(el("div", "muted", names.length
        ? `${names.length} in: ${names.join(", ")}. Everyone's result shows at ${hour}.`
        : `Send the link. Everyone plays this board, and it all shows at ${hour}.`))
      const clock = el("div", "label", "")
      wrap.append(clock)
      let ms = table.msUntilDeadline
      const tick = () => { clock.textContent = `resolves in ${day.formatCountdown(ms)}`; ms -= 1000; if (ms < -1500) screenTable(table.code) }
      tick(); clearInterval(screenResult._t); screenResult._t = setInterval(tick, 1000)
      // A BUTTON GETS A LABEL. The fact that a changed move replaces the old one
      // is said by the label itself, not by a line under it.
      const play = el("button", "btn", table.played ? "Change move" : "Play")
      play.onclick = () => startRun("table", { seed: table.seed })
      wrap.append(play)
      const tell = remindButton("Tell me the result", table.code)
      if (tell) wrap.append(tell)
      if (table.isHost && table.bots > 0) wrap.append(botPicker())
    } else {
      const list = el("ol", "board")
      table.top.forEach((row) => {
        const li = el("li", row.playerId === playerId ? "me" : null)
        li.append(el("span", "r", String(row.rank)))
        li.append(el("span", "n", row.displayName || "anon"))
        li.append(el("span", "v", fmtMetric(row.metric)))
        list.append(li)
      })
      wrap.append(list)
      wrap.append(el("div", "label", `resolved at ${hour}`))
    }
  } else if (!table.played) {
    wrap.append(el("div", "muted", table.top.length
      ? `${table.top.length} in so far. Same board for all of you.`
      : "Send the link, then play. Everyone gets this same board."))
    const play = el("button", "btn", "Play")
    play.onclick = () => startRun("table", { seed: table.seed })
    wrap.append(play)
  } else {
    const list = el("ol", "board")
    table.top.forEach((row) => {
      const li = el("li", row.playerId === playerId ? "me" : null)
      li.append(el("span", "r", String(row.rank)))
      li.append(el("span", "n", row.displayName || "anon"))
      li.append(el("span", "v", fmtMetric(row.metric)))
      list.append(li)
    })
    wrap.append(list)
    wrap.append(el("div", "label", "everyone who opens the link plays this board"))
  }

  const copy = el("button", "btn ghost", "Copy the link")
  copy.onclick = async () => {
    await navigator.clipboard.writeText(`${R.origin || location.origin}/t/${table.code}`)
    toast("Link copied — paste it in the chat")
  }
  wrap.append(copy)
  if (doorCount > 1) {
    const back = el("button", "btn ghost", "Back")
    back.onclick = () => { history.replaceState(null, "", "/"); localStorage.removeItem(TABLE_KEY); table = null; screenHome() }
    wrap.append(back)
  }
  $("#stage").append(wrap)
}

async function sendTable(r) {
  const out = await api("table.submit", {
    code: table.code, log: r.log || [],
    claimed: { metric: r.metric, seconds: r.seconds },
    displayName: localStorage.getItem(NAME_KEY) || undefined,
  }).catch(() => null)
  if (!out || out.error) { toast(out ? out.error : "offline"); return screenTable(table.code) }
  table = out
  if (!localStorage.getItem(NAME_KEY)) askName()
  screenTable(table.code)
}

// --- go deep alone ----------------------------------------------------------

async function goQuest() {
  history.replaceState(null, "", "/quest")
  const out = await api("quest.state").catch(() => null)
  if (!out || out.error) { toast("Quest unavailable"); return screenHome() }
  quest = out
  screenQuest()
}

function screenQuest() {
  clearStage()
  const run = quest.run
  // A GAME MAY OWN ITS QUEST SCREENS: the draft, the map between legs and the
  // shop are where a campaign's look lives, and three plain buttons cannot carry
  // a house rule's icon or a run map. The host keeps the calls; the game draws.
  if (game.questScreen) {
    const call = (name, body, fail) => async () => {
      const out = await api(name, body).catch(() => null)
      if (!out || out.error) return toast(fail)
      quest = out; screenQuest()
    }
    game.questScreen($("#stage"), {
      quest, run, limit: modesOf(R).quest && modesOf(R).quest.legs,
      pick: (id) => call("quest.pick", { offer: id }, "Could not take that")(),
      begin: () => startRun("quest", { seed: run.seed, params: run.params }),
      start: call("quest.start", undefined, "Could not start"),
      buy: (id) => call("quest.buy", { unlock: id }, "Not enough marks")(),
      back: doorCount > 1 ? () => { history.replaceState(null, "", "/"); screenHome() } : null,
    })
    return
  }
  const wrap = el("div", "screen stack center")

  if (run && run.offers) {
    // The pick between legs is the whole of a roguelite. It is a screen of
    // three buttons and nothing else on it.
    wrap.append(el("div", "label", `leg ${run.leg} cleared`))
    wrap.append(el("div", "big", "TAKE ONE"))
    for (const o of run.offers) {
      // A BUTTON GETS A LABEL AND NOTHING ELSE. These had a line of explanation
      // under each one, which is three subtitles on a screen whose whole job is
      // to be read in two seconds. If an offer needs explaining, the label is
      // wrong — so the label is the effect.
      const b = el("button", "btn", o.label)
      b.onclick = async () => {
        const out = await api("quest.pick", { offer: o.id }).catch(() => null)
        if (!out || out.error) return toast("Could not take that")
        quest = out; screenQuest()
      }
      wrap.append(b)
    }
  } else if (run) {
    wrap.append(el("div", "label", `run ${run.n}`))
    wrap.append(el("div", "big", `LEG ${run.leg}`))
    wrap.append(el("div", "muted", `${run.marks} marks banked this run`))
    const play = el("button", "btn", run.leg === 1 ? "Begin" : "Next leg")
    play.onclick = () => startRun("quest", { seed: run.seed, params: run.params })
    wrap.append(play)
  } else {
    wrap.append(el("div", "big", "QUEST"))
    wrap.append(el("div", "muted", quest.best
      ? `Your deepest run reached leg ${quest.best}.`
      : "A run of boards that get harder. It ends when you lose one."))
    const start = el("button", "btn", "Start a run")
    start.onclick = async () => {
      const out = await api("quest.start").catch(() => null)
      if (!out || out.error) return toast("Could not start")
      quest = out; screenQuest()
    }
    wrap.append(start)

    // The shop. Only ever shown between runs, because a shop you can open
    // mid-run is a pause button on a game whose whole point is commitment.
    if (quest.unlocks.length) {
      wrap.append(el("div", "label", `${quest.meta.marks} marks`))
      for (const u of quest.unlocks) {
        const owned = quest.meta.unlocked.includes(u.id)
        const b = el("button", "btn ghost", owned ? `${u.label} — owned` : `${u.label} — ${u.cost}`)
        b.disabled = owned || quest.meta.marks < u.cost
        b.onclick = async () => {
          const out = await api("quest.buy", { unlock: u.id }).catch(() => null)
          if (!out || out.error) return toast("Not enough marks")
          quest = out; screenQuest()
        }
        wrap.append(b)
      }
    }
  }

  if (doorCount > 1) {
    const back = el("button", "btn ghost", "Back")
    back.onclick = () => { history.replaceState(null, "", "/"); screenHome() }
    wrap.append(back)
  }
  $("#stage").append(wrap)
}

async function sendQuest(r) {
  const out = await api("quest.submit", {
    log: r.log || [], claimed: { metric: r.metric, seconds: r.seconds },
  }).catch(() => null)
  if (!out || out.error) { toast(out ? out.error : "offline"); return screenQuest() }
  quest = out
  if (out.ended) {
    clearStage()
    if (game.questEnd) {
      game.questEnd($("#stage"), { ended: out.ended, result: out.result, quest: out, again: screenQuest })
      if (out.meta.marks > 0 && !localStorage.getItem(CLAIM_KEY)) claimSheet()
      return
    }
    const wrap = el("div", "screen stack center")
    wrap.append(el("div", "label", `run ${out.ended.run}`))
    wrap.append(el("div", "big", out.ended.legs ? `${out.ended.legs} LEGS` : "NO LEGS"))
    wrap.append(el("div", "muted", `${out.ended.marks} marks banked. They keep.`))
    const b = el("button", "btn", "Again")
    b.onclick = screenQuest
    wrap.append(b)
    $("#stage").append(wrap)
    // A quest save is the first thing here that cannot be recomputed from a
    // seed and a log, so this is the moment the code is worth having — not on
    // arrival, when there was nothing to lose.
    if (out.meta.marks > 0 && !localStorage.getItem(CLAIM_KEY)) claimSheet()
    return
  }
  screenQuest()
}

// --- keeping a save you cannot recompute ------------------------------------

function claimSheet() {
  openSheet(async (body) => {
    body.append(el("h2", null, "Keep this run"))
    body.append(el("p", "muted", "Your marks live on this device only. This code moves them to another one. No account, no email — write it down or paste it somewhere."))
    const out = await api("player.claim").catch(() => null)
    if (!out || out.error) { body.append(el("p", "muted", "Offline — try again later.")); return }
    localStorage.setItem(CLAIM_KEY, out.code)
    const code = el("div", "big", out.code)
    code.style.cssText = "font-family:var(--mono);letter-spacing:.08em"
    body.append(code)
    const copy = el("button", "btn", "Copy it")
    copy.onclick = async () => { await navigator.clipboard.writeText(out.code); toast("Copied") }
    body.append(copy)
    const done = el("button", "btn ghost", "Done"); done.onclick = closeSheet
    body.append(done)
  })
}

// --- reminders ----------------------------------------------------------------
// One button, shown only where the browser can actually deliver a push (on an
// iPhone that means the game was added to the Home Screen) and only when the
// server has keys. Silent failure reads as "reminders do not work", so every
// way this can fail says so.
let pushKey = null
const REMIND_KEY = "relay." + R.key + ".remind"
const canPush = () => !R.portal && !!pushKey && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window

function remindButton(label, room) {
  if (!canPush() || (!room && localStorage.getItem(REMIND_KEY))) return null
  const b = el("button", "btn ghost", label)
  b.onclick = async () => {
    try {
      if ((await Notification.requestPermission()) !== "granted") return toast("Notifications are off for this site")
      const reg = await navigator.serviceWorker.ready
      const raw = Uint8Array.from(atob(pushKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw }))
      const out = await api("push.subscribe", { subscription: sub.toJSON(), room })
      if (out.error) return toast("Could not turn reminders on")
      if (!room) localStorage.setItem(REMIND_KEY, "1")
      window.tally && tally("push_subscribe", { where: room ? "table" : "daily" })
      toast(room ? "We'll tell you the result" : "Reminder on")
      b.remove()
    } catch { toast("Could not turn reminders on") }
  }
  return b
}

// --- credits ----------------------------------------------------------------
// A plain screen: every entry, grouped. The same shape as steam-shell's: the
// thing is linked, then "by" the maker, then the licence. Reached from a text
// link at the foot of the front screen, never a button.
function screenCredits() {
  clearStage()
  const wrap = el("div", "screen credits")
  wrap.append(el("div", "big center", "CREDITS"))
  for (const [group, list] of creditGroups(R.credits)) {
    wrap.append(el("h2", null, (GROUP_LABELS[group] || group).toUpperCase()))
    const ul = el("ul", "credit-list")
    for (const c of list) {
      const li = el("li")
      // A portal build carries no outbound links (see tools/build-portal.mjs),
      // so there the thing is named and not linked.
      if (c.url && !R.portal) {
        const a = el("a", null, c.what)
        a.href = c.url; a.target = "_blank"; a.rel = "noopener"
        li.append(a)
      } else li.append(el("span", null, c.what))
      if (c.who) li.append(el("span", "who", " by " + c.who))
      if (c.licence) li.append(el("span", "lic", c.licence))
      ul.append(li)
    }
    wrap.append(ul)
  }
  const back = el("button", "btn ghost", "Back")
  back.onclick = screenHome
  wrap.append(back)
  $("#stage").append(wrap)
}

// --- sheets -----------------------------------------------------------------

function openSheet(fill) {
  const sheet = $("#sheet"), body = sheet.querySelector(".sheet-body")
  body.replaceChildren(); fill(body)
  sheet.hidden = false
  sheet.onclick = (e) => { if (e.target === sheet) closeSheet() }
}
function closeSheet() { $("#sheet").hidden = true }

function howSheet() {
  openSheet((body) => {
    body.append(el("h2", null, "How to play"))
    for (const line of game.how) body.append(el("p", "muted", line))
    const b = el("button", "btn", "Got it"); b.onclick = closeSheet; body.append(b)
  })
}

function crewSheet() {
  openSheet((body) => {
    body.append(el("h2", null, crew ? `Crew ${crew}` : "World"))
    body.append(el("p", "muted", crew
      ? "Everyone who opens your link plays this crew's own puzzle — a different one from the world's, and nobody outside the chat has seen it."
      : "You're playing the world's puzzle, the same one as everybody. Start a crew and your group chat gets its own daily instead."))
    if (crew) {
      const copy = el("button", "btn", "Copy crew link")
      copy.onclick = async () => {
        await navigator.clipboard.writeText(links({ origin: R.origin || location.origin, number: ctx.number, crew }).invite)
        toast("Crew link copied")
      }
      body.append(copy)
      const leave = el("button", "btn ghost", "Leave — play World")
      leave.onclick = async () => { setCrew(null); closeSheet(); await boot() }
      body.append(leave)
    } else {
      const start = el("button", "btn", "Start a crew")
      start.onclick = async () => { setCrew(makeCrewCode()); closeSheet(); await boot() }
      body.append(start)
    }
  })
}

// --- did they come back -----------------------------------------------------
// Tally forgets a visitor overnight on purpose, so the host counts the return
// itself: first day stored beside the player id, `return` once per day after it.
// The day is this device's clock read on the game's timezone, not the server's:
// an archive link hands back an old ctx.day, and a return is a fact about the
// visit, not about which puzzle it opened.
const FIRST_KEY = "relay." + R.key + ".first"
const BACK_KEY = "relay." + R.key + ".back"
const STARTED_KEY = "relay." + R.key + ".started"
let countedReturn = false
function countReturn() {
  if (countedReturn) return
  countedReturn = true
  try {
    // tally's own client now sends a daily `visit` with days_since_first for every
    // game, so the host no longer fires `return` (that would count a comeback
    // twice). It still records the first day, which `start`'s facts read.
    const v = returnVisit({ firstDay: localStorage.getItem(FIRST_KEY), lastReturnDay: localStorage.getItem(BACK_KEY), today: day.dayKey(config.timezone) })
    localStorage.setItem(FIRST_KEY, v.firstDay)
    if (v.lastReturnDay) localStorage.setItem(BACK_KEY, v.lastReturnDay)
  } catch { /* storage blocked: the game still plays, the return just is not counted */ }
}

// --- boot -------------------------------------------------------------------

async function boot() {
  // The service worker keeps the game playable offline and receives reminders.
  // Neither is worth delaying the first screen for, so neither is awaited.
  if ("serviceWorker" in navigator && !R.portal && !boot.sw) {
    boot.sw = true
    navigator.serviceWorker.register("/sw.js").catch(() => {})
    api("push.key").then((k) => { pushKey = k.publicKey || null }).catch(() => {})
  }
  try {
    ctx = await api("daily.getSeed", { number: archiveMatch ? Number(archiveMatch[1]) : undefined, crew })
  } catch {
    // Fully playable with the API down. The score just does not post.
    const d = day.dayKey(config.timezone)
    ctx = { day: d, number: R.number, seed: (Math.random() * 0xffffffff) >>> 0, isToday: true, msUntilNextDay: 0, practiceSeed: 1 }
    toast("Offline — playing unscored")
  }
  try { me = await api("player.me") } catch { me = { streak: 0, playedToday: false, practiced: !!localStorage.getItem(SEEN_KEY) } }
  $("#num").textContent = "#" + ctx.number
  countReturn()

  // THE ROUTER, and the whole of the "never land on a menu" rule.
  //   /t/<CODE>   a table somebody sent you       -> straight in
  //   /quest      your own door, bookmarked        -> straight in
  //   ?r= ?c= /d/ a result, a crew, an archive day -> straight into the daily
  //   /           the front page                   -> the daily, with Play;
  //                                                   table and quest under it
  if (tableMatch && hasDoor("table")) {
    // A link somebody sent: straight in, and the code is remembered. The URL
    // is put back to / so a refresh or a restored tab lands on the front page
    // with Rejoin, rather than in this room for the rest of the tab's life.
    const code = normaliseCode(tableMatch[1])
    localStorage.setItem(TABLE_KEY, code)
    history.replaceState(null, "", "/")
    return screenTable(code)
  }
  if (questPath && hasDoor("quest")) return goQuest()
  screenHome()
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet() })

boot()
