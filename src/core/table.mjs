// Resolving a deadline table. Pure: the server calls it, the tests call it, and
// the same room resolves to the same standings however many times it is asked.
//
// THE SHAPE: commit alone, resolve together, read it in the chat. Commits land
// any time before the hour and nobody sees anyone's result. At the hour the
// server replays every stored log through the rules — the claimed score in a
// submission is never what ranks — sits bots in the empty seats, and ranks the
// lot once. A player who was asleep never blocks the four who were awake, and
// a table one person opened still plays.

import { makeRng, hash } from "./rng.mjs"

// Every table with bots offers exactly these three, Normal by default. The one
// who opens the table picks; the level shows on every bot's row.
export const BOT_LEVELS = ["easy", "normal", "hard"]
export const botLevelOf = (v) => (BOT_LEVELS.includes(v) ? v : "normal")

// A bot plays a board with nothing but the rules. A game with a real opponent
// model exports botLog(seed, rng, params, level) and owns what the three
// levels mean; otherwise the bot plays random legal moves from `moves` at every
// level, which is the weakest competent-looking player. A game that seats bots
// should ship its own botLog, and `npm run sim:ladder` fails until it does.
export function botLog(rules, seed, i, params, level = "normal", maxMoves = 200) {
  const rng = makeRng(hash([seed, "bot", i].join("|")))
  if (rules.botLog) return rules.botLog(seed, rng, params, botLevelOf(level)) || []
  if (!rules.moves) return []
  const s = rules.create(seed, params)
  const log = []
  for (let k = 0; k < maxMoves && !s.over; k++) {
    const options = rules.moves(s, rng)
    if (!options || !options.length) break
    const move = rng.pick(options)
    log.push(move)
    rules.apply(s, move)
  }
  return log
}

export const isBot = (id) => String(id).startsWith("bot:")

// null while the table is still open. Once resolved, the standings are frozen
// on the room by the caller and handed straight back from then on.
export function resolveDeadline({ room, rules, metric, now = Date.now() }) {
  if (!room || room.resolve !== "deadline") return null
  if (room.resolved) return room.resolved
  if (!(now >= room.deadline_at)) return null

  const logs = {}
  for (const [id, sub] of Object.entries(room.subs || {})) logs[id] = sub.log || []
  const humans = Object.keys(logs).length
  const bots = Math.max(0, (room.bots || 0) - humans)
  for (let i = 1; i <= bots; i++) logs["bot:" + i] = botLog(rules, room.seed, i, undefined, botLevelOf(room.botLevel))

  let rows
  if (rules.resolveTable) {
    // Real N-side rules: one simulation, every log in it at once.
    rows = rules.resolveTable(room.seed, logs)
  } else {
    rows = Object.entries(logs).map(([id, log]) => {
      const state = rules.replay(room.seed, log)
      const claimed = (room.subs[id] && room.subs[id].seconds) || 0
      const r = rules.result(state, { seconds: claimed })
      return { id, metric: r.metric, tiebreak: r.tiebreak, payload: r }
    })
  }

  const dir = metric && metric.dir === "asc" ? 1 : -1
  // Ties break by a seat hash, never by arrival: arrival time rewards whoever
  // happened to be awake first.
  const seat = (id) => hash([room.seed, "seat", id].join("|"))
  rows.sort((a, b) => (a.metric - b.metric) * dir || (b.tiebreak - a.tiebreak) || seat(a.id) - seat(b.id))

  return {
    at: room.deadline_at, humans, bots,
    standings: rows.map((r, i) => ({ rank: i + 1, id: r.id, bot: isBot(r.id), metric: r.metric, tiebreak: r.tiebreak, payload: r.payload })),
  }
}
