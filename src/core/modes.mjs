// THE THREE DOORS.
//
//   play with friends      -> TABLE   a private match, right now, on its own board
//   compete with strangers -> DAILY   one board a day, the world's leaderboard
//   go deep alone          -> QUEST   a chain of boards, a build that grows
//
// One idea underneath all three: N submissions against a seeded world. What
// changes between the modes is who the N are, when it resolves, and whether
// anything carries over.
//
//                 who            resolves               carries
//   daily         everyone       as each run lands      a streak
//   table         a named few    as each run lands      nothing
//   quest         you            when you fail a leg    a loadout, then a meta
//
// A GAME OPTS IN. `modes` in relay.config.mjs says which doors exist, and a
// game that only wants the daily says so and the rest of this file never runs.
// The point of the template is not that every game is three games.

import { hash } from "./rng.mjs"

// No I/O/0/1: these get read aloud in a group chat and retyped by somebody
// squinting at a phone. Same alphabet as a crew code, deliberately — one
// shape of code in the whole product.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const CODE_LEN = 6

export const MODES = {
  table: {
    id: "table",
    label: "Play with friends",
    blurb: "A private board, right now. Send the code, everyone plays the same one.",
  },
  daily: {
    id: "daily",
    label: "Compete with strangers",
    blurb: "One board a day, the same one for the whole world.",
  },
  quest: {
    id: "quest",
    label: "Go deep alone",
    blurb: "A run of boards that get harder. Pick an upgrade after each one.",
  },
}
// The order the doors are shown in, which is also the order they matter in for
// a game that has all three: the friend you send it to arrives first.
export const MODE_ORDER = ["table", "daily", "quest"]

// --- what a config is asking for --------------------------------------------
//
// Normalised once, here, so nothing downstream has to cope with `true` in one
// place and `{ seats: 4 }` in another. An old config with no `modes` block gets
// the daily and nothing else, which is exactly what it used to have.

export function modesOf(config) {
  const m = config.modes || { daily: true }
  const out = {}

  if (m.daily) out.daily = { id: "daily" }

  if (m.table) {
    const t = m.table === true ? {} : m.table
    const seats = Array.isArray(t.seats) ? t.seats : [2, Number(t.seats) || 8]
    out.table = {
      id: "table",
      // How many people the RULES can host. `parallel` can host anybody —
      // everyone plays the same board alone and the scores are compared — so
      // the ceiling there is a social one, not a technical one.
      seats: [Math.max(2, seats[0] | 0), Math.max(2, seats[1] | 0)],
      // "parallel": N people, one board, N separate runs, ranked. Needs NOTHING
      //             from the rules that the daily did not already need, which is
      //             why nearly every game can have this.
      // "shared":   N people inside ONE simulation, resolved together. Needs the
      //             rules to genuinely support N sides. Opt in only when true.
      // "deadline": the group-chat shape. Everyone commits whenever they like
      //             during the day, nobody sees anyone's result, and the whole
      //             table resolves together at one hour. The result is the post.
      //             Works on ANY rules (it is parallel with the reveal held
      //             back); a game with real N-side rules exports resolveTable.
      resolve: ["shared", "deadline"].includes(t.resolve) ? t.resolve : "parallel",
    }
    if (out.table.resolve === "deadline") {
      // The hour on the wall clock of config.timezone, 0-23.
      out.table.hour = Number.isInteger(t.hour) && t.hour >= 0 && t.hour < 24 ? t.hour : 21
      // Bots sit down at resolution until the table has this many seats, so a
      // table one person opened still plays. Never more than the rules hold.
      out.table.bots = Math.min(Math.max(0, Number(t.bots ?? out.table.seats[0]) | 0), out.table.seats[1])
    }
  }

  if (m.quest) {
    const q = m.quest === true ? {} : m.quest
    out.quest = {
      id: "quest",
      // 0 means "until you fail", which is the honest roguelite answer. A number
      // means the run has an end and finishing it is the win.
      legs: Number(q.legs) || 0,
      // What a leg pays into the meta. Flat, because a per-leg curve is a dial
      // nobody can feel and every game would guess at it differently.
      marks: Number(q.marks) || 1,
    }
  }
  return out
}

export const enabledModes = (config) => MODE_ORDER.filter((id) => modesOf(config)[id]).map((id) => MODES[id])

// --- codes ------------------------------------------------------------------

export function makeCode(random = Math.random) {
  let s = ""
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return s
}

export function normaliseCode(raw) {
  const c = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
  return c.length >= 4 ? c : null
}

// A claim code is a longer one, in two halves, because it is the only thing
// standing between a player and losing a thirty-hour quest to a cleared browser.
// It is read once and pasted, never retyped from memory.
export function makeClaimCode(random = Math.random) {
  const half = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("")
  return `${half()}-${half()}`
}
export const normaliseClaim = (raw) =>
  String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8).replace(/^(.{4})(.{4})$/, "$1-$2") || null

// --- seeds ------------------------------------------------------------------
//
// Every mode derives from the same salted hash so no two modes, games or days
// ever collide, and so nobody can precompute next week from a seed they have.

export const tableSeed = ({ gameKey, salt = "", code }) => hash([gameKey, "table", salt, code].join("|"))
export const questRunSeed = ({ gameKey, salt = "", playerId, run }) => hash([gameKey, "quest", salt, playerId, run].join("|"))
// Each leg of a run is its own board, derived from the run so the whole chain
// is reproducible from one number and the server can re-run it.
export const questLegSeed = (runSeed, leg) => hash([runSeed, "leg", leg].join("|"))
