// Seeded randomness. Twenty-two of the games in this collection each carried
// their own copy of mulberry32; this is the last one.
//
// Everything here stays inside 32-bit integer space so a browser and a Node
// server draw the same numbers in the same order. That property is what lets
// the server re-play a run it did not watch.

export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeRng(seed) {
  const next = mulberry32(seed)
  const rng = {
    next,
    float: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),   // inclusive both ends
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // Fisher-Yates on a copy. Shuffling in place is the classic way to make a
    // "pure" generator quietly mutate the caller's content table.
    shuffle: (arr) => {
      const a = arr.slice()
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    },
    // n distinct picks, order shuffled
    sample: (arr, n) => rng.shuffle(arr).slice(0, n),
  }
  return rng
}

// FNV-1a. Used for every "turn this string into a seed" job in the template.
export function hash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
