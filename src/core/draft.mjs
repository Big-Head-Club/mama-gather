// The quest draft: three upgrades after a cleared leg, take one.
//
// Pure, seeded, shared by the server (which deals the offers) and by
// tools/sim-draft.mjs (which proves no upgrade and no build dominates). A game
// describes its upgrades as data and calls draft() from questOffers.
//
//   { id, label, rarity: "common"|"rare"|"epic", tags: ["time"], unlock?, max? }
//
// THE RULES THIS FILE ENFORCES, each one a thing a roguelite got wrong:
//   - Rarity is weighted by DEPTH. Commons never vanish: a late run dealt all
//     rares has no choices left in it, only the biggest number.
//   - Synergy bias is CAPPED (tagBias, default 2x). Enough that a build forms,
//     not so much that a run can never pivot.
//   - Meta unlocks WIDEN THE POOL. An `unlock` on an upgrade means it only
//     appears once that unlock is bought; nothing here adds power for owning
//     one. The daily never uses the draft at all, so it stays on the base game.
//   - `max` caps how many times one upgrade can be held.

export const RARITIES = ["common", "rare", "epic"]

export function rarityWeights(leg = 1) {
  const d = Math.max(0, leg - 1)
  return { common: 10, rare: Math.min(6, 2 + d * 0.5), epic: Math.min(3, d * 0.25) }
}

export const poolFor = (upgrades, unlocked = []) =>
  upgrades.filter((u) => !u.unlock || unlocked.includes(u.unlock))

export function draft({ upgrades, unlocked = [], held = [], leg = 1, rng, n = 3, tagBias = 2 }) {
  const count = (id) => held.filter((h) => h === id).length
  const heldTags = new Set(held.flatMap((id) => (upgrades.find((u) => u.id === id) || {}).tags || []))
  const w = rarityWeights(leg)
  const left = poolFor(upgrades, unlocked).filter((u) => !(u.max && count(u.id) >= u.max))
  const out = []
  while (out.length < n && left.length) {
    const weights = left.map((u) => (w[u.rarity || "common"] || 0) * ((u.tags || []).some((t) => heldTags.has(t)) ? Math.min(tagBias, 2) : 1))
    const total = weights.reduce((a, b) => a + b, 0)
    if (total <= 0) break
    let roll = rng.next() * total
    let i = 0
    while (i < left.length - 1 && roll >= weights[i]) roll -= weights[i++]
    out.push(left[i])
    left.splice(i, 1)
  }
  return out.map((u) => ({ id: u.id, label: u.label }))
}
