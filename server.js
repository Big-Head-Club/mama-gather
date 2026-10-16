// Relay host. Nothing in here knows what the game is.
//
// Routes are named for the procedure they call so that moving to tRPC later is
// a rename: POST /api/daily.submit, POST /api/daily.leaderboard, and so on.

import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

import config from "./relay.config.mjs"
import { openStore } from "./src/server/store.mjs"
import { renderCard } from "./src/server/og.mjs"
import { dayKey, puzzleNumber, dayForPuzzle, msUntilNextDay, nextHourAt } from "./src/core/day.mjs"
import { resolveDeadline, isBot, BOT_LEVELS, botLevelOf } from "./src/core/table.mjs"
import { seedFor, normaliseCrew } from "./src/core/seed.mjs"
import { modesOf, makeCode, normaliseCode, makeClaimCode, normaliseClaim, tableSeed, questRunSeed, questLegSeed } from "./src/core/modes.mjs"
import { decodeResult } from "./src/core/share.mjs"
import { makeRng } from "./src/core/rng.mjs"
import * as rules from "./src/game/game.rules.mjs"
import { loadTheme } from "./src/server/theme.mjs"
import { createTally } from "./src/server/tally/index.js"
import { vapidConfig, sendPush } from "./src/server/push.mjs"
import { loadCredits } from "./src/server/credits.mjs"
import { createHash } from "node:crypto"

const ROOT = fileURLToPath(new URL(".", import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const SALT = process.env.DAILY_SALT || "relay-dev-salt"
const SAVE = process.env.SAVE_PATH || join(ROOT, "save.json")
const BUILD = (process.env.RAILWAY_GIT_COMMIT_SHA ?? String(Date.now())).slice(0, 12)

const store = await openStore(SAVE)
// Analytics (tally, vendored under src/server/tally). The SQLite file sits next
// to save.json so it lands on the same volume with no extra env var. The
// dashboard lives at /admin/analytics/<TALLY_TOKEN>; the token is printed at
// boot if TALLY_TOKEN is not set.
const tally = createTally({ dir: process.env.TALLY_DIR || dirname(SAVE), tz: config.timezone })
const MODES = modesOf(config)
const CREDITS = await loadCredits(ROOT, config)

// Web Push. Off until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set (make them
// with `node tools/vapid.mjs`); with them off, no reminder button is shown.
const VAPID = vapidConfig(process.env, config.origin || process.env.PUBLIC_ORIGIN || "")
const pushSubs = () => (store.db.pushsubs ||= {})
const subId = (endpoint) => createHash("sha256").update(String(endpoint)).digest("base64url").slice(0, 24)

// Every push is empty; what it says waits on the subscription as `pending`
// until the service worker asks /api/push.latest for it.
async function pushTo(subs, message) {
  const out = { sent: 0, failed: 0, gone: 0 }
  for (const s of subs) {
    s.pending = message
    try {
      const r = await sendPush(s.subscription, { vapid: VAPID })
      if (r.ok) out.sent++
      else if (r.gone) { delete pushSubs()[s.id]; out.gone++ }
      else out.failed++
    } catch { out.failed++ }
  }
  store.touch()
  await store.flush()
  return out
}
const dailyMessage = () => ({ title: `${config.title} #${puzzleNumber(today(), config.epoch)} is up`, body: config.tagline || "", url: "/" })

// The template repo carries a marker; a scaffolded game does not. It is the one
// thing that distinguishes "this deploy is Relay showing itself off" from "this
// deploy is somebody's game", and it is why the summary page can live at / here
// without changing the route every real game depends on.
const IS_TEMPLATE = existsSync(join(ROOT, ".relay-template"))
const theme = await loadTheme(ROOT, config.theme)

// PUBLIC_ORIGIN has to be absolute for the unfurl to work at all. Falling back
// to the request's own Host header keeps localhost and preview deploys honest.
const originFor = (req) => {
  if (config.origin) return config.origin
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`
  const proto = req.headers["x-forwarded-proto"] || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https")
  return `${proto}://${host}`
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".webp": "image/webp",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".mp3": "audio/mpeg",
  ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
}

const json = (res, code, body) => {
  const s = JSON.stringify(body)
  res.writeHead(code, { "content-type": MIME[".json"], "content-length": Buffer.byteLength(s) })
  res.end(s)
}

const hits = new Map()
function rateLimited(ip, max, windowMs = 60000) {
  const now = Date.now()
  const live = (hits.get(ip) || []).filter((t) => now - t < windowMs)
  live.push(now)
  hits.set(ip, live)
  if (hits.size > 5000) hits.clear()
  return live.length > max
}

const readBody = (req) => new Promise((resolve, reject) => {
  let n = 0; const chunks = []
  req.on("data", (c) => { n += c.length; if (n > 1_000_000) { reject(new Error("tooBig")); req.destroy() } chunks.push(c) })
  req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}) } catch (e) { reject(e) } })
  req.on("error", reject)
})

const cleanName = (s) => String(s || "").replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, 16)
const today = () => dayKey(config.timezone)

function context({ day, crew, mode }) {
  const d = day || today()
  return {
    day: d,
    number: puzzleNumber(d, config.epoch),
    crew: crew || null,
    seed: seedFor({ gameKey: config.key, day: d, salt: SALT, crew, mode: mode || "daily" }),
  }
}

// --- procedures --------------------------------------------------------------

const procedures = {
  async "daily.getSeed"({ day, number, crew, playerId }) {
    const c = config.crews ? normaliseCrew(crew) : null
    // /d/<n> hands back a number, not a date — resolving it here keeps the
    // epoch in one place instead of duplicating the arithmetic in the client.
    const fromNumber = config.archive && Number.isInteger(number) && number > 0
      ? dayForPuzzle(number, config.epoch) : null
    const d = (config.archive && day) || fromNumber || today()
    const ctx = context({ day: d, crew: c })
    if (playerId) store.count(ctx.day, "open")
    return Object.assign(ctx, {
      isToday: ctx.day === today(),
      msUntilNextDay: msUntilNextDay(config.timezone),
      practiceSeed: rules.PRACTICE_SEED,
    })
  },

  async "player.me"({ playerId }) {
    if (!playerId) return { streak: 0, best: 0, playedToday: false, practiced: false }
    const p = store.player(playerId)
    const s = store.streak(playerId)
    return {
      streak: s.current, best: s.best, displayName: p.display_name,
      playedToday: !!store.getRun(playerId, today(), null),
      practiced: !!p.practiced,
    }
  },

  async "player.setName"({ playerId, displayName }) {
    if (!playerId) return { error: "noPlayer" }
    const name = cleanName(displayName)
    if (name.length < 3) return { error: "nameTooShort" }
    store.player(playerId).display_name = name
    store.touch()
    return { ok: true, displayName: name }
  },

  async "player.practiced"({ playerId }) {
    if (!playerId) return { ok: false }
    store.player(playerId).practiced = true
    store.touch()
    return { ok: true }
  },

  async "daily.submit"({ playerId, day, crew, log, claimed, displayName }) {
    if (!playerId) return { error: "noPlayer" }
    const c = config.crews ? normaliseCrew(crew) : null
    const d = day || today()
    if (d !== today()) return { error: "notToday" }          // archive days never score
    if (store.getRun(playerId, d, c)) return { error: "alreadyPlayed" }
    if (!Array.isArray(log) || log.length > 200) return { error: "badLog" }

    const ctx = context({ day: d, crew: c })
    // The whole anti-cheat, for a deterministic game: play the log ourselves.
    // The day NUMBER goes in beside the seed, because a game whose board opens
    // out over its first few weeks needs it to rebuild what the client played.
    const state = rules.replay(ctx.seed, log, { number: ctx.number })
    const r = rules.result(state, { seconds: Number(claimed && claimed.seconds) || 0 })
    if (claimed && Number.isFinite(claimed.metric) && claimed.metric !== r.metric) {
      store.player(playerId).flagged = true
      store.touch()
      return { error: "mismatch" }
    }
    if (!state.over) return { error: "unfinished" }

    const p = store.player(playerId)
    const name = cleanName(displayName) || p.display_name
    if (name && name.length >= 3) p.display_name = name

    store.putRun({
      id: `${playerId}|${d}|${c || ""}`, player_id: playerId, day: d, crew: c || "",
      metric: r.metric, tiebreak: r.tiebreak, payload: r, log,
      verified: true, created_at: Date.now(),
    })
    store.count(d, "finish")
    const streak = store.bumpStreak(playerId, d)
    const { all } = store.board(d, c, config.metric, 100)
    await store.flush()
    return {
      ok: true, verified: true,
      rank: all.findIndex((row) => row.player_id === playerId) + 1,
      of: all.length,
      streak: streak.current,
    }
  },

  async "daily.leaderboard"({ playerId, day, crew }) {
    const c = config.crews ? normaliseCrew(crew) : null
    const d = day || today()
    const { rows, all } = store.board(d, c, config.metric, 100)
    const row = (r, i) => ({
      rank: i + 1, playerId: r.player_id,
      displayName: store.db.players[r.player_id]?.display_name || null,
      metric: r.metric, payload: r.payload,
    })
    let me = null
    if (playerId) {
      const i = all.findIndex((r) => r.player_id === playerId)
      if (i >= 0) me = row(all[i], i)
    }
    return { day: d, crew: c, metric: config.metric, top: rows.map(row), me, played: all.length }
  },

  // =========================================================================
  // TABLE — play with friends
  // =========================================================================
  //
  // A private board, right now, on its own seed. Not a crew: a crew is a
  // recurring private DAILY, and "let's play a round" cannot wait for tomorrow.
  //
  // There is no lobby and no "everybody ready". People join a group chat at
  // three in the morning; the one who is asleep must never be able to block the
  // four who are awake. So a table resolves exactly the way the daily does — as
  // each run lands — and simply says who is still out.

  async "table.create"({ playerId, displayName, botLevel }) {
    if (!MODES.table) return { error: "noTable" }
    if (!playerId) return { error: "noPlayer" }
    let code = makeCode()
    for (let i = 0; store.room(code) && i < 20; i++) code = makeCode()
    const room = store.putRoom({
      code, mode: "table", host: playerId,
      seed: tableSeed({ gameKey: config.key, salt: SALT, code }),
      seats: MODES.table.seats, resolve: MODES.table.resolve,
      subs: {}, created_at: Date.now(),
      ...(MODES.table.resolve === "deadline"
        ? { deadline_at: nextHourAt(config.timezone, MODES.table.hour), bots: MODES.table.bots, botLevel: botLevelOf(botLevel) }
        : null),
    })
    nameFor(playerId, displayName)
    await store.flush()
    return tableView(room, playerId)
  },

  // The host can change how hard the empty seats play right up to the hour.
  // After it, the bots have played and the level is part of the result.
  async "table.botLevel"({ playerId, code, botLevel }) {
    const room = store.room(normaliseCode(code))
    if (!room) return { error: "noRoom" }
    if (room.resolve !== "deadline") return { error: "noBots" }
    if (room.host !== playerId) return { error: "notHost" }
    if (room.resolved || Date.now() >= room.deadline_at) return { error: "resolved" }
    if (!BOT_LEVELS.includes(botLevel)) return { error: "badLevel" }
    room.botLevel = botLevel
    store.touch()
    await store.flush()
    return tableView(room, playerId)
  },

  async "table.state"({ playerId, code }) {
    const room = store.room(normaliseCode(code))
    if (!room) return { error: "noRoom" }
    nameFor(playerId)
    return tableView(room, playerId)
  },

  async "table.submit"({ playerId, code, log, claimed, displayName }) {
    if (!MODES.table) return { error: "noTable" }
    if (!playerId) return { error: "noPlayer" }
    const room = store.room(normaliseCode(code))
    if (!room) return { error: "noRoom" }
    const deadline = room.resolve === "deadline"
    // A deadline table takes a changed move right up to the hour — the last one
    // counts. Every other table is one run per seat, as it always was.
    if (deadline && (room.resolved || Date.now() >= room.deadline_at)) return { error: "resolved" }
    if (room.subs[playerId] && !deadline) return { error: "alreadyPlayed" }
    if (!room.subs[playerId] && Object.keys(room.subs).length >= room.seats[1]) return { error: "tableFull" }
    if (!Array.isArray(log) || log.length > 200) return { error: "badLog" }

    const state = rules.replay(room.seed, log)
    const r = rules.result(state, { seconds: Number(claimed && claimed.seconds) || 0 })
    if (claimed && Number.isFinite(claimed.metric) && claimed.metric !== r.metric) {
      store.player(playerId).flagged = true; store.touch()
      return { error: "mismatch" }
    }
    if (!state.over) return { error: "unfinished" }

    nameFor(playerId, displayName)
    room.subs[playerId] = { metric: r.metric, tiebreak: r.tiebreak, payload: r, log, at: Date.now(), seconds: r.seconds }
    store.putRoom(room)
    await store.flush()
    return tableView(room, playerId)
  },

  // =========================================================================
  // QUEST — go deep alone
  // =========================================================================
  //
  // A chain of boards on one run seed, a loadout that grows inside the run, and
  // marks that outlive it. THE SERVER OWNS THE SEED AND THE PARAMS for every
  // leg, so a client cannot hand itself an easy board or a build it did not
  // earn — which is the same trick the daily already uses, applied per leg.

  async "quest.state"({ playerId }) {
    if (!MODES.quest) return { error: "noQuest" }
    if (!playerId) return { error: "noPlayer" }
    return questView(store.quest(playerId))
  },

  async "quest.start"({ playerId }) {
    if (!MODES.quest) return { error: "noQuest" }
    if (!playerId) return { error: "noPlayer" }
    const q = store.quest(playerId)
    if (q.run) return questView(q)                       // resuming is not restarting
    const n = (q.runs = (q.runs || 0) + 1)
    q.run = {
      n, leg: 1, marks: 0, offers: null,
      loadout: rules.loadoutFrom ? rules.loadoutFrom(q.meta.unlocked) : {},
      seed: questRunSeed({ gameKey: config.key, salt: SALT, playerId, run: n }),
    }
    store.touch(); await store.flush()
    return questView(q)
  },

  async "quest.submit"({ playerId, log, claimed }) {
    if (!MODES.quest) return { error: "noQuest" }
    if (!playerId) return { error: "noPlayer" }
    const q = store.quest(playerId)
    if (!q.run || q.run.offers) return { error: "noLeg" }
    if (!Array.isArray(log) || log.length > 200) return { error: "badLog" }

    const { seed, params } = legOf(q.run)
    const state = rules.replay(seed, log, params)
    const r = rules.result(state, { seconds: Number(claimed && claimed.seconds) || 0 })
    if (claimed && Number.isFinite(claimed.metric) && claimed.metric !== r.metric) {
      store.player(playerId).flagged = true; store.touch()
      return { error: "mismatch" }
    }
    if (!state.over) return { error: "unfinished" }

    // Cleared is the game's word, not the host's: a run ends when result() says
    // the leg was not won. Nothing here knows what winning a lock looks like.
    const cleared = !!(r.solved ?? r.home ?? r.won)
    if (!cleared) {
      const legs = q.run.leg - 1
      q.meta.marks += q.run.marks
      q.best = Math.max(q.best || 0, legs)
      const ended = { legs, marks: q.run.marks, run: q.run.n }
      q.run = null
      store.touch(); await store.flush()
      return Object.assign(questView(q), { ended, result: r })
    }

    q.run.marks += MODES.quest.marks
    // A run with an end: clearing the last leg is the win, and it ends the run
    // the same way a loss does, with everything banked. `legs: 0` never gets here.
    if (MODES.quest.legs && q.run.leg >= MODES.quest.legs) {
      const legs = q.run.leg
      q.meta.marks += q.run.marks
      q.best = Math.max(q.best || 0, legs)
      q.wins = (q.wins || 0) + 1
      const ended = { legs, marks: q.run.marks, run: q.run.n, won: true }
      q.run = null
      store.touch(); await store.flush()
      return Object.assign(questView(q), { ended, result: r })
    }
    // Anything the rules called a one-leg effect is spent HERE, on the leg
    // that just used it. Nothing else in the loop knows a leg has been played.
    // A game says what that means with spendLeg; the old default spent slots.
    if (rules.spendLeg) q.run.loadout = rules.spendLeg(q.run.loadout)
    else if (q.run.loadout && q.run.loadout.slots) q.run.loadout.slots = 0
    // The meta unlocks go in so they can WIDEN the pool (see src/core/draft.mjs).
    q.run.offers = rules.questOffers
      ? rules.questOffers(q.run.leg, q.run.loadout, makeRng(hashLeg(q.run)), { unlocked: q.meta.unlocked || [] })
      : []
    store.touch(); await store.flush()
    return Object.assign(questView(q), { result: r })
  },

  async "quest.pick"({ playerId, offer }) {
    if (!MODES.quest) return { error: "noQuest" }
    const q = store.quest(playerId)
    if (!q.run || !q.run.offers) return { error: "noOffer" }
    if (!q.run.offers.some((o) => o.id === offer)) return { error: "badOffer" }
    q.run.loadout = rules.applyOffer ? rules.applyOffer(q.run.loadout, offer) : q.run.loadout
    // Marks an offer hands out are banked immediately; a loadout is not a wallet.
    q.run.marks += q.run.loadout.marks || 0
    q.run.loadout.marks = 0
    q.run.offers = null
    q.run.leg += 1
    store.touch(); await store.flush()
    return questView(q)
  },

  // Spending marks is the only thing that survives a run, so it is the only
  // thing worth protecting: the moment a player has one, they are offered a
  // claim code.
  async "quest.buy"({ playerId, unlock }) {
    if (!MODES.quest) return { error: "noQuest" }
    const q = store.quest(playerId)
    const u = (rules.QUEST_UNLOCKS || []).find((x) => x.id === unlock)
    if (!u) return { error: "noUnlock" }
    if ((q.meta.unlocked || []).includes(u.id)) return { error: "alreadyOwned" }
    if (q.meta.marks < u.cost) return { error: "tooPoor" }
    q.meta.marks -= u.cost
    q.meta.unlocked = (q.meta.unlocked || []).concat(u.id)
    store.touch(); await store.flush()
    return questView(q)
  },

  // =========================================================================
  // IDENTITY — the one thing a quest cannot survive without
  // =========================================================================
  //
  // Everything else in this template is derivable from a seed and a log, which
  // is both the anti-cheat and the backup. A quest save is the first thing that
  // is not. The identity behind it is a UUID in localStorage, so a cleared
  // browser used to cost a streak and can now cost thirty hours.
  //
  // No account, no password, no email. One code, minted at the moment there is
  // something to lose, that adopts this player on another device.

  // =========================================================================
  // PUSH — the reminder that brings somebody back tomorrow
  // =========================================================================

  async "push.key"() {
    return { publicKey: VAPID ? VAPID.publicKey : null }
  },

  // One subscription per browser endpoint. `room` ties it to a deadline table,
  // which then gets at most two pushes: "closes soon" and "results are in".
  async "push.subscribe"({ playerId, subscription, room }) {
    if (!VAPID) return { error: "noPush" }
    const endpoint = subscription && subscription.endpoint
    if (!playerId || !/^https:\/\//.test(endpoint || "")) return { error: "badSubscription" }
    const id = subId(endpoint)
    const prev = pushSubs()[id]
    const code = room ? normaliseCode(room) : null
    pushSubs()[id] = {
      id, player_id: playerId,
      subscription: { endpoint, keys: subscription.keys || null },
      rooms: [...new Set([...((prev && prev.rooms) || []), ...(code ? [code] : [])])].slice(-20),
      created_at: (prev && prev.created_at) || Date.now(),
      pending: (prev && prev.pending) || null,
    }
    store.touch()
    await store.flush()
    return { ok: true }
  },

  async "push.latest"({ endpoint }) {
    const sub = endpoint && pushSubs()[subId(endpoint)]
    if (sub && sub.pending) {
      const m = sub.pending
      sub.pending = null
      store.touch()
      return m
    }
    return dailyMessage()
  },

  async "player.claim"({ playerId }) {
    if (!playerId) return { error: "noPlayer" }
    return { code: store.claimFor(playerId, makeClaimCode) }
  },

  async "player.adopt"({ code }) {
    const c = normaliseClaim(code)
    const id = c && store.adopt(c)
    if (!id) return { error: "noSuchCode" }
    return { playerId: id, displayName: store.player(id).display_name || null }
  },
}

// --- helpers the procedures share --------------------------------------------

function nameFor(playerId, displayName) {
  if (!playerId) return null
  const p = store.player(playerId)
  const n = cleanName(displayName)
  if (n && n.length >= 3) { p.display_name = n; store.touch() }
  return p.display_name
}

// What a table looks like from one seat. The board is everyone who has finished,
// and `waiting` is everyone who opened it and has not — which is the only piece
// of social pressure this mode needs.
// Freeze a deadline table's standings on the room the first time anyone looks
// after the hour (or the sweep below gets there first). Idempotent.
function settle(room) {
  if (room.resolve !== "deadline" || room.resolved) return false
  const res = resolveDeadline({ room, rules, metric: config.metric, now: Date.now() })
  if (!res) return false
  room.resolved = res
  store.putRoom(room)
  return true
}

// Resolve every table whose hour has passed, once a minute, so a table nobody
// opens still has its result waiting — and so "results are in" can go out.
setInterval(() => {
  const now = Date.now()
  for (const room of Object.values(store.db.rooms)) {
    if (room.resolve !== "deadline") continue
    const watching = () => Object.values(pushSubs()).filter((s) => (s.rooms || []).includes(room.code))
    // Two hours out, once, and only to the people who have not committed yet.
    if (VAPID && !room.reminded && !room.resolved && room.deadline_at > now && room.deadline_at - now <= 2 * 3600e3) {
      room.reminded = true
      store.putRoom(room)
      const waiting = watching().filter((s) => !room.subs[s.player_id])
      if (waiting.length) pushTo(waiting, { title: `Table ${room.code} closes soon`, body: `${Object.keys(room.subs).length} in so far.`, url: `/t/${room.code}` })
    }
    if (settle(room) && VAPID) {
      const all = watching()
      if (all.length) pushTo(all, { title: `Table ${room.code}: results are in`, body: "", url: `/t/${room.code}` })
    }
  }
}, 60000).unref()

function tableView(room, playerId) {
  if (room.resolve === "deadline") {
    settle(room)
    const level = botLevelOf(room.botLevel)
    const name = (id) => (isBot(id) ? `Bot ${id.slice(4)} · ${level[0].toUpperCase() + level.slice(1)}` : store.db.players[id]?.display_name || null)
    const base = {
      code: room.code, seed: room.seed, seats: room.seats, resolve: room.resolve,
      botLevel: level, bots: room.bots || 0,
      metric: config.metric, isHost: playerId === room.host,
      played: !!(playerId && room.subs[playerId]),
      deadlineAt: room.deadline_at, msUntilDeadline: Math.max(0, room.deadline_at - Date.now()),
      // Who is in, never what they did: the reveal is the whole event.
      committed: Object.keys(room.subs).map((id) => ({ playerId: id, displayName: name(id) })),
      full: Object.keys(room.subs).length >= room.seats[1],
    }
    if (!room.resolved) return Object.assign(base, { resolved: false, top: [] })
    return Object.assign(base, {
      resolved: true,
      top: room.resolved.standings.map((r) => ({
        rank: r.rank, playerId: r.id, bot: r.bot, displayName: name(r.id), metric: r.metric, payload: r.payload,
      })),
    })
  }
  const rows = store.roomBoard(room.code, config.metric).map((r, i) => ({
    rank: i + 1, playerId: r.player_id,
    displayName: store.db.players[r.player_id]?.display_name || null,
    metric: r.metric, payload: r.payload,
  }))
  return {
    code: room.code, seed: room.seed, seats: room.seats, resolve: room.resolve,
    metric: config.metric,
    played: !!(playerId && room.subs[playerId]),
    isHost: playerId === room.host,
    top: rows,
    full: rows.length >= room.seats[1],
  }
}

// The seed AND the difficulty for the leg you are on, both derived here. A
// client that could name its own params could name itself an easy run.
function legOf(run) {
  const seed = questLegSeed(run.seed, run.leg)
  const params = rules.questParams ? rules.questParams(run.leg, run.loadout) : undefined
  return { seed, params }
}

const hashLeg = (run) => questLegSeed(run.seed, run.leg * 1000 + 7)

function questView(q) {
  const out = {
    meta: { marks: q.meta.marks, unlocked: q.meta.unlocked || [] },
    unlocks: rules.QUEST_UNLOCKS || [],
    best: q.best || 0,
    run: null,
  }
  if (q.run) {
    const { seed, params } = legOf(q.run)
    out.run = {
      n: q.run.n, leg: q.run.leg, marks: q.run.marks,
      loadout: q.run.loadout, offers: q.run.offers,
      // Only ever the CURRENT leg. Handing over the chain would hand over the
      // whole run, and a quest you can read ahead in is a quest you can plan
      // around instead of react to.
      seed, params,
    }
  }
  return out
}

// --- html --------------------------------------------------------------------
//
// Meta tags are rendered per URL, server-side. A single-page app that sets its
// og:image from JavaScript has no unfurl at all: scrapers do not run scripts.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))

async function page(req, { number, crew, resultToken }) {
  const origin = originFor(req)
  const r = resultToken ? config.share.fromToken(decodeResult(resultToken) || {}) : null
  const n = number || puzzleNumber(today(), config.epoch)
  // THE UNFURL IS THE NAME AND A GREAT PICTURE, NOTHING ELSE (Mack, 2026-09-28): no day number,
  // no score, no "one a day / no sign-in". The chat client prints the title and description under
  // the image, so the image carries no words at all. A game that wants the old scoreboard card
  // sets share.textCard: true.
  const plain = !config.share.textCard
  const title = plain ? config.title : r ? `${config.title} #${n} — ${config.share.headline(r)}` : `${config.title} #${n}`
  const desc = plain ? config.description : r ? `${config.share.statLine(r)} · ${config.description}` : config.description
  const card = `${origin}/api/og.png?${new URLSearchParams(Object.assign(
    { d: n, v: BUILD }, crew ? { c: crew } : null, resultToken ? { r: resultToken } : null))}`

  const html = await readFile(join(ROOT, "public/index.html"), "utf8")
  return html
    .replaceAll("%TITLE%", esc(title))
    .replaceAll("%DESC%", esc(desc))
    .replaceAll("%CARD%", esc(card))
    .replaceAll("%ORIGIN%", esc(origin))
    .replaceAll("%NAME%", esc(config.title))
    .replaceAll("%THEME%", esc(config.theme))
    .replaceAll("%STAGE%", config.stage === "fixed" ? "fixed" : "fill")
    .replaceAll("%BUILD%", esc(BUILD))
    .replaceAll("%CONFIG%", JSON.stringify({
      key: config.key, title: config.title, tagline: config.tagline,
      metric: config.metric, practiceGate: config.practiceGate, practice: config.practice,
      crews: config.crews, archive: config.archive, number: n, origin,
      modes: MODES,
      // Doors the GAME adds to the front page, beyond the ones the host knows
      // about. A mode nobody can find from the front page does not exist.
      doors: Array.isArray(config.doors) ? config.doors : [],
      credits: CREDITS,
    }))
}

// --- server ------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?"
  const url = new URL(req.url, "http://x")
  const path = decodeURIComponent(url.pathname)

  try {
    if (await tally.handler(req, res)) return
    // "Today's board is up", to everyone who asked. tools/push-daily.mjs calls
    // this once a day. Guarded by the analytics token, and only when one is set.
    if (req.method === "POST" && process.env.TALLY_TOKEN && path === "/admin/push/" + process.env.TALLY_TOKEN) {
      if (!VAPID) return json(res, 400, { error: "noVapidKeys" })
      return json(res, 200, await pushTo(Object.values(pushSubs()), dailyMessage()))
    }
    if (req.method === "POST" && path.startsWith("/api/")) {
      const fn = procedures[path.slice(5)]
      if (!fn) return json(res, 404, { error: "noSuchProcedure" })
      if (rateLimited(ip, path.endsWith("submit") ? 20 : 120)) return json(res, 429, { error: "rateLimited" })
      return json(res, 200, await fn(await readBody(req)))
    }

    // WHO THE RATE LIMITER THINKS YOU ARE. Behind a proxy this is the one thing
    // that cannot be measured from outside: a deployed edge rewrites
    // x-forwarded-for, so "two clients, correctly bucketed" and "one bucket for
    // the whole world" look identical from any single machine — and the second
    // is a launch blocker, because the game then stops at 120 requests a minute.
    // Ten lines and one request settle it. Guarded by the analytics token, and
    // it echoes nothing the caller does not already know about itself.
    if (path.startsWith("/admin/whoami/") && path.slice(14) === (process.env.TALLY_TOKEN || "")) {
      return json(res, 200, {
        resolved: ip,
        forwardedFor: req.headers["x-forwarded-for"] || null,
        envoyExternal: req.headers["x-envoy-external-address"] || null,
        realIp: req.headers["x-real-ip"] || null,
        socket: req.socket.remoteAddress || null,
      })
    }

    // The manifest is the GAME's, not the template's: it used to be a static
    // file that called every game "Relay". Installing to a Home Screen is what
    // lets an iPhone receive a reminder at all, so the name has to be right.
    if (path === "/manifest.webmanifest") {
      const body = JSON.stringify({
        name: config.title, short_name: config.title, description: config.description,
        start_url: "/", scope: "/", display: "standalone",
        background_color: theme.ground, theme_color: theme.ground,
        icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
      })
      res.writeHead(200, { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache" })
      return res.end(body)
    }

    // The Home Screen and notification icon, drawn from the theme: the game's
    // initial in the ground colour on ink. It used to be a manifest entry
    // pointing at an icon.png nobody had made, which is a 404 on every install.
    if (path === "/icon.png") {
      const png = await iconPng()
      res.writeHead(200, { "content-type": "image/png", "content-length": png.length, "cache-control": "public, max-age=86400" })
      return res.end(png)
    }

    if (path === "/api/og.png" && !config.share.textCard) {
      // The picture alone: the theme's plate, full bleed, 1200x630.
      const png = await readFile(join(ROOT, "themes", config.theme, "card.png"))
      res.writeHead(200, { "content-type": "image/png", "content-length": png.length, "cache-control": "public, max-age=86400" })
      return res.end(png)
    }

    if (path === "/api/og.png") {
      const n = Number(url.searchParams.get("d")) || puzzleNumber(today(), config.epoch)
      const token = url.searchParams.get("r")
      const r = token ? config.share.fromToken(decodeResult(token) || {}) : null
      // If the game can draw its own picture from the run, let it. The link
      // carries whatever the game put in its token; the seed comes from the day
      // the puzzle number resolves to.
      let artImage = null
      if (r && config.share.cardArt) {
        try {
          const day = dayForPuzzle(n, config.epoch)
          const ctx = day ? context({ day, crew: url.searchParams.get("c") }) : null
          if (ctx) artImage = await config.share.cardArt({ seed: ctx.seed, number: n, result: r, moves: r.moves })
        } catch { artImage = null }
      }
      const png = await renderCard({
        theme, art: join(ROOT, "themes", config.theme, "card.png"), artImage,
        title: config.title, number: n, crew: url.searchParams.get("c"),
        headline: r ? config.share.headline(r) : config.tagline,
        stats: r ? statsFor(r) : [],
        footer: "one a day / no sign-in",
      })
      res.writeHead(200, {
        "content-type": "image/png", "content-length": png.length,
        // Long cache: the URL already carries everything that can change, and
        // chat clients keep the first card they scraped for a given URL anyway.
        "cache-control": "public, max-age=86400, immutable",
      })
      return res.end(png)
    }

    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end() }

    // On the template's own deploy, / is the summary and the game is at /play.
    // In a real game / is the game and this branch never fires.
    if (IS_TEMPLATE && (path === "/" || path === "/about")) {
      const html = (await readFile(join(ROOT, "public/about.html"), "utf8")).replaceAll("%ORIGIN%", esc(originFor(req)))
      res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" })
      return res.end(html)
    }

    const archive = /^\/d\/(\d+)$/.exec(path)
    // /t/<CODE> is the link you paste in the chat, /quest is the door you keep
    // for yourself. Both are the same page; the client reads the path.
    const table = /^\/t\/([A-Za-z0-9]{4,8})$/.exec(path)
    if (path === "/" || path === "/play" || path === "/quest" || archive || table) {
      const html = await page(req, {
        number: archive ? Number(archive[1]) : null,
        crew: config.crews ? normaliseCrew(url.searchParams.get("c")) : null,
        resultToken: url.searchParams.get("r"),
      })
      res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" })
      return res.end(html)
    }

    const safe = normalize(path).replace(/^(\.\.[/\\])+/, "")
    // public/ first, then the module tree the browser imports directly, then the
    // one config file that lives at the root because it is the file you edit.
    const ALLOW_ROOT = new Set(["/relay.config.mjs"])
    for (const base of ["public", ""]) {
      if (base === "" && !safe.startsWith("/src/") && !safe.startsWith("/themes/") && !ALLOW_ROOT.has(safe)) continue
      const file = join(ROOT, base, safe)
      if (!file.startsWith(ROOT) || !existsSync(file) || file.endsWith("/")) continue
      const buf = await readFile(file).catch(() => null)
      if (!buf) continue
      res.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
        "cache-control": url.search.includes("v=") ? "public, max-age=31536000, immutable" : "no-cache",
        "content-length": buf.length,
      })
      return res.end(buf)
    }

    res.writeHead(404, { "content-type": "text/plain" })
    res.end("not found")
  } catch (e) {
    json(res, 500, { error: String((e && e.message) || e) })
  }
})

let iconCache = null
async function iconPng() {
  if (iconCache) return iconCache
  // A game that drew its own icon ships it; otherwise draw one.
  const own = join(ROOT, "themes", config.theme, "icon.png")
  if (existsSync(own)) return (iconCache = await readFile(own))
  const { writePNG } = await import("./src/server/png.mjs")
  const { drawText, textWidth, GLYPH_H } = await import("./src/server/font.mjs")
  const S = 512
  const rgb = (hex) => { const h = String(hex || "#000").replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0) }
  const [r, g, b] = rgb(theme.ink)
  const buf = Buffer.alloc(S * S * 4)
  for (let i = 0; i < buf.length; i += 4) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255 }
  const ch = (config.title || "?").trim()[0].toUpperCase()
  const scale = 40
  drawText(buf, S, S, ch, Math.round((S - textWidth(ch, scale)) / 2), Math.round((S - GLYPH_H * scale) / 2), scale, rgb(theme.ground))
  return (iconCache = writePNG(S, S, buf))
}

// What goes on the card's stat tiles is the GAME's business. This used to read
// r.tries and r.solved — Keyhole's fields, in the host.
function statsFor(r) {
  if (config.share.stats) return config.share.stats(r) || []
  const out = []
  if (r.metric != null) out.push({ value: String(r.metric), label: config.metric.label, accent: true })
  if (r.seconds != null) out.push({ value: `${r.seconds}s`, label: "time" })
  return out
}

server.listen(PORT, async () => {
  console.log(`${config.title} on :${PORT} — puzzle #${puzzleNumber(today(), config.epoch)} (${today()}, ${config.timezone})`)
  await tally.ready
  console.log("dashboard:", tally.dashboardUrl(process.env.PUBLIC_ORIGIN || config.origin || `http://localhost:${PORT}`))
})

process.on("SIGTERM", async () => { await store.flush(); process.exit(0) })
process.on("SIGINT", async () => { await store.flush(); process.exit(0) })
