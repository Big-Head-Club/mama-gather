// Seeds, and crews.
//
// CREW is the one idea in here that earns the "prospers in the group chat but
// does not require it" line. A crew is not a room, a lobby, a server object or
// a database row — it is six characters in the query string that salt the daily
// seed. Open the plain link and you are playing World, the same puzzle as
// everyone. Open a link with ?c=K7RM2P and you are playing your group's own
// private puzzle, which nobody outside the chat has ever seen.
//
// It costs nothing to run and it converts a link into a private competition,
// which is what a group chat actually wants. It was invented for the emojivas
// games and it should have been in every daily since.

import { hash } from "./rng.mjs"

// No I/O/0/1 — these codes get read aloud and retyped.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const CREW_LEN = 6

export function normaliseCrew(raw) {
  const c = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
  return c.length >= 3 ? c : null
}

export function makeCrewCode(random = Math.random) {
  let s = ""
  for (let i = 0; i < CREW_LEN; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return s
}

// The game key is in here so two games deployed on the same day never hand out
// the same puzzle, and the salt is in here so nobody can precompute next week.
export function seedFor({ gameKey, day, salt = "", crew = null, mode = "daily" }) {
  return hash([gameKey, day, salt, crew || "", mode].join("|"))
}

export function randomSeed(random = Math.random) {
  return (random() * 0xffffffff) >>> 0
}
