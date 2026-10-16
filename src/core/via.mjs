// Where a player came from, and whether they came back.
//
// Tally hashes an IP with a daily salt, so the dashboard's "visitor" is a
// stranger again tomorrow. That makes the one number a daily lives or dies on —
// did they come back — unmeasurable from tally alone. The host already keeps an
// anonymous player id for the streak, so it says the two things tally cannot
// work out: which door a player came through, and how many days since they
// first played. Pure, so the tests can pin both.

export const VIAS = ["share", "cart", "portal", "push", "discord", "reddit", "steam", "direct"]

const DAY_MS = 86400000

// An explicit ?via= wins, because every channel we own can stamp its links.
// Then the shapes a link carries on its own: a result token or a crew code is
// something a person pasted into a chat. Then the referrer, for the channels
// that do not let us stamp anything.
export function viaOf({ search = "", referrer = "" } = {}) {
  const p = new URLSearchParams(search)
  const said = String(p.get("via") || "").toLowerCase()
  if (VIAS.includes(said)) return said
  if (p.get("r") || p.get("c")) return "share"
  let host = ""
  try { host = referrer ? new URL(referrer).hostname : "" } catch { host = "" }
  if (/hundred-carts|carts\./.test(host)) return "cart"
  if (/discord/.test(host)) return "discord"
  if (/reddit|redd\.it/.test(host)) return "reddit"
  if (/crazygames|poki|itch\.(io|zone)|newgrounds/.test(host)) return "portal"
  if (/steam/.test(host)) return "steam"
  return "direct"
}

export const daysBetween = (fromDay, toDay) =>
  Math.round((Date.parse(toDay + "T00:00:00Z") - Date.parse(fromDay + "T00:00:00Z")) / DAY_MS)

// What to remember and what to fire on a load. Fires `return` at most once per
// day, and never on the first day: a visitor on day zero has not returned.
// What a `start` says about the player, so a scoreboard can find day zero:
// D1 is returns one day in over the players who were new the day before, and
// `return` never fires on day zero. `new` is true on a player's very first start.
export function startFacts({ firstDay, startedBefore, today }) {
  return { days_since_first: firstDay ? Math.max(0, daysBetween(firstDay, today)) : 0, new: !startedBefore }
}

export function returnVisit({ firstDay, lastReturnDay, today }) {
  const first = firstDay || today
  const days = daysBetween(first, today)
  const fire = days >= 1 && lastReturnDay !== today
  return { firstDay: first, lastReturnDay: fire ? today : lastReturnDay || null, fire, days }
}
