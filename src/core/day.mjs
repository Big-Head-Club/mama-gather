// What day is it, which puzzle is that, and what seed does it get.
//
// THE DAY BOUNDARY IS A DESIGN DECISION, NOT A DETAIL. Three of the games in
// this collection each picked a different one (UTC, America/Los_Angeles, and
// the player's own timezone) and they behave very differently in a group chat:
//
//   one global boundary  -> everyone races the SAME puzzle at the same instant.
//                           Someone in Berlin can spoil someone in Vancouver,
//                           but the chat is always talking about one puzzle.
//   per-player boundary  -> nobody is ever spoiled, and the chat is a mess,
//                           because "today's" means a different puzzle per person.
//
// A link you paste into a group chat wants the first one. Relay defaults to a
// single global boundary and lets you move it (DAY_TZ) so the day flips at a
// civilised hour for wherever most of your players are, rather than at 00:00 UTC
// which is mid-afternoon in California.

const DAY_MS = 86400000

export function dayKey(tz = "UTC", now = Date.now()) {
  if (tz === "UTC") return new Date(now).toISOString().slice(0, 10)
  // en-CA gives YYYY-MM-DD, which is the whole reason to use it here
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(now))
}

export function puzzleNumber(day, epoch) {
  return Math.floor((Date.parse(day + "T00:00:00Z") - Date.parse(epoch + "T00:00:00Z")) / DAY_MS) + 1
}

export function dayForPuzzle(n, epoch) {
  return new Date(Date.parse(epoch + "T00:00:00Z") + (n - 1) * DAY_MS).toISOString().slice(0, 10)
}

export function previousDay(day) {
  return new Date(Date.parse(day + "T00:00:00Z") - DAY_MS).toISOString().slice(0, 10)
}

// Milliseconds until the day flips, for the "next puzzle in 4:21:07" countdown
// that every daily game needs and half of them forget.
export function msUntilNextDay(tz = "UTC", now = Date.now()) {
  const today = dayKey(tz, now)
  let lo = now, hi = now + DAY_MS + 7200000
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (dayKey(tz, mid) === today) lo = mid
    else hi = mid
  }
  return Math.ceil(hi - now)
}

// How far a timezone's wall clock is ahead of UTC at one instant, in ms.
function offsetAt(tz, t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000
}

// The instant a wall clock in `tz` next reads `hour`:00 — a deadline table's
// resolve time. "Resolves at 9pm" has to mean 9pm where the day boundary is,
// for everyone in the chat, so it is computed on the same timezone as the day.
export function nextHourAt(tz = "UTC", hour = 21, now = Date.now()) {
  for (let d = 0; d < 3; d++) {
    const day = dayKey(tz, now + d * DAY_MS)
    const wall = Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`)
    // Two passes, because the offset at the guess can differ from the offset at
    // the answer across a daylight-saving change.
    let t = wall - offsetAt(tz, wall)
    t = wall - offsetAt(tz, t)
    if (t > now) return t
  }
  return now + DAY_MS
}

export function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}
