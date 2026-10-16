// THE ONLY FILE YOU HAVE TO EDIT TO MAKE A NEW GAME.
//
// Everything else in src/ is the host: the link, the card, the day, the board,
// the streak, the practice gate. You bring src/game/<your game>.mjs and this.

export default {
  // --- identity -------------------------------------------------------------
  key: "mama-gather",                  // salts the seed; never change it after launch
  title: "Mama Gather",                // working title (Mack's spec calls it a placeholder)
  tagline: "Find your kits. Lead them home.",
  description: "You are a fox mother in a forest. Find your kits hidden in logs, ferns and burrows, and they fall in line behind you. Collect them all and reach the den. Nothing can go wrong; the only question is how fast. One forest a day, the same for everyone.",
  // This file is imported by BOTH the server and the browser, so it may not
  // touch `process` unguarded — that is a blank page in production.
  origin: (typeof process !== "undefined" && process.env.PUBLIC_ORIGIN) || "",

  // --- the day --------------------------------------------------------------
  epoch: "2026-10-16",                 // the day puzzle #1 was published
  timezone: "America/Los_Angeles",

  // --- the run --------------------------------------------------------------
  // Ranked on the best finish in ticks, re-simulated from the stick log. The
  // clock the client claims is never used; attempts are the tiebreak.
  metric: {
    key: "ticks", label: "best", dir: "asc",
    format: (v) => (v >= 999999 ? "—" : clock(v)),
  },

  practiceGate: true,
  practice: true,                      // unlimited practice on random seeds, never scored
  archive: true,
  crews: false,

  modes: {
    daily: true,
  },

  verify: "resim",

  // --- look -----------------------------------------------------------------
  theme: "forest",
  stage: "fill",
  favicon: "🦊",

  // --- credits --------------------------------------------------------------
  credits: {
    art: [
      { what: "Nature Kit, the 3D forest (trees, rocks, logs, ferns, cliffs, fences)", who: "Kenney", url: "https://kenney.nl", licence: "CC0" },
      { what: "Cube Pets, the fox and her kits", who: "Kenney", url: "https://kenney.nl", licence: "CC0" },
    ],
    audio: [
      { what: "Digital Audio (the kits' squeaks) and Impact Sounds (footsteps)", who: "Kenney", url: "https://kenney.nl", licence: "CC0" },
      { what: "Ninja Adventure sounds (rustling grass, the finish jingle)", who: "Pixel-boy", url: "https://pixel-boy.itch.io/ninja-adventure-asset-pack", licence: "CC0" },
    ],
    music: [
      { what: "Farm Frolics, from Music Loops", who: "Kenney", url: "https://kenney.nl", licence: "CC0" },
    ],
    type: [
      { what: "Space Grotesk", who: "Florian Karsten", url: "https://github.com/floriankarsten/space-grotesk", licence: "SIL Open Font License 1.1" },
    ],
    code: [
      { what: "three.js (the 3D view)", who: "three.js authors", url: "https://threejs.org", licence: "MIT" },
      { what: "tally", who: "Dan Viau", url: "https://github.com/Big-Head-Club/tally", licence: "MIT" },
      { what: "Seeded randomness (mulberry32)", who: "Tommy Ettinger", url: "https://gist.github.com/tommyettinger/46a874533244883189143505d203312c", licence: "Public domain" },
      { what: "String hashing (FNV-1a)", who: "Glenn Fowler, Landon Curt Noll and Kiem-Phong Vo", url: "http://www.isthe.com/chongo/tech/comp/fnv/", licence: "Public domain" },
    ],
    people: [
      { what: "Game design", who: "Mack Flavelle" },
      { what: "Build", who: "Claude Code (Anthropic)", url: "https://claude.com/claude-code" },
    ],
  },

  // --- share ----------------------------------------------------------------
  share: {
    statLine: (r) => (r.solved
      ? `${clock(r.ticks)} · ${"★".repeat(r.stars)}${"☆".repeat(3 - r.stars)} · ${r.babies} kits · ${r.attempts} run${r.attempts === 1 ? "" : "s"}`
      : `${r.found || 0}/${r.babies} kits · didn't make the den`),
    headline: (r) => (r.solved ? (r.stars === 3 ? "ALL HOME, FAST" : r.stars === 2 ? "ALL HOME" : "HOME, EVENTUALLY") : "STILL OUT THERE"),
    stats: (r) => (r.solved
      ? [
        { value: clock(r.ticks), label: "time", accent: true },
        { value: "★".repeat(r.stars), label: "stars" },
        { value: String(r.attempts), label: "runs" },
      ]
      : [{ value: `${r.found || 0}/${r.babies}`, label: "kits", accent: true }]),
    token: (r) => ({ n: r.number, k: r.ticks, s: r.stars, a: r.attempts, b: r.babies, f: r.found }),
    fromToken: (t) => ({ number: t.n, ticks: t.k, stars: t.s, attempts: t.a, babies: t.b, found: t.f, solved: t.k >= 0, events: [] }),
  },
}

function clock(ticks) {
  const s = Math.max(0, ticks) / 30
  const m = Math.floor(s / 60), r = s - m * 60
  return m ? `${m}:${r.toFixed(1).padStart(4, "0")}` : `${r.toFixed(1)}s`
}
