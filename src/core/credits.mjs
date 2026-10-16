// Credits: everyone whose work is in the game, named and linked.
//
// The rule is to credit generously, wherever it is due — a pack of sound
// effects, a font, a hash function somebody put in the public domain in 1991.
// A game that ships somebody's work without their name on it has not finished
// shipping. So the block is required: `assume check` fails without it, and the
// home screen always has a way in.
//
//   credits: {
//     art:    [{ what, who, url, licence }],
//     audio:  [...], music: [...], type: [...], code: [...], people: [...],
//   }
//
// or the same object as credits.json beside relay.config.mjs, which wins. It
// is the shape steam-shell reads too, so a game credits once for both. A line
// reads "<what> by <who>", the `what` linked — never "made by", which is the
// club-naming phrase ship-check bans.

export const CREDIT_GROUPS = ["art", "audio", "music", "type", "code", "people"]
export const GROUP_LABELS = { art: "Art", audio: "Audio", music: "Music", type: "Type", code: "Code", people: "People" }

// What Relay itself is built on. A scaffolded game starts with these already
// in its block, so the host's debts are never the game's to remember.
export const RELAY_CREDITS = {
  code: [
    { what: "tally", who: "Dan Viau", url: "https://github.com/Big-Head-Club/tally", licence: "MIT" },
    { what: "Seeded randomness (mulberry32)", who: "Tommy Ettinger", url: "https://gist.github.com/tommyettinger/46a874533244883189143505d203312c", licence: "Public domain" },
    { what: "String hashing (FNV-1a)", who: "Glenn Fowler, Landon Curt Noll and Kiem-Phong Vo", url: "http://www.isthe.com/chongo/tech/comp/fnv/", licence: "Public domain" },
  ],
}

// Every problem with a credits block, as sentences. Empty means it is fine.
export function checkCredits(credits) {
  if (!credits || typeof credits !== "object") return ["relay.config.mjs has no credits block"]
  const problems = []
  let entries = 0
  for (const [group, list] of Object.entries(credits)) {
    if (!CREDIT_GROUPS.includes(group)) { problems.push(`credits.${group} is not a group (use ${CREDIT_GROUPS.join(", ")})`); continue }
    if (!Array.isArray(list)) { problems.push(`credits.${group} is not a list`); continue }
    list.forEach((c, i) => {
      entries++
      const at = `credits.${group}[${i}]`
      if (!c || !String(c.what || "").trim()) problems.push(`${at} says nothing about what was used`)
      if (!c || !String(c.who || "").trim()) problems.push(`${at} names nobody`)
      if (c && c.url != null && !/^https?:\/\/\S+$/.test(c.url)) problems.push(`${at} has a url that is not a link`)
    })
  }
  if (!entries) problems.push("the credits block is empty; Relay's own entries belong in it at least")
  return problems
}

// Groups in display order, empty ones dropped.
export const creditGroups = (credits) =>
  CREDIT_GROUPS.map((g) => [g, (credits && credits[g]) || []]).filter(([, list]) => list.length)
