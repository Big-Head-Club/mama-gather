// The animal roster. Pure data: the rules and the generator read abilities and
// terrain from here, the view reads props and names. One species is wired for
// now (fox); the others are listed so the generator's terrain table and the
// view's prop table have somewhere to grow.

export const SPECIES = {
  fox: {
    name: "Fox", mom: "fox", baby: "kit", babies: "kits", biome: "forest",
    ability: "squeeze",                 // slips through gaps in fences
    abilityLine: "A fox squeezes through gaps in fences.",
    spots: ["log", "burrow", "fern", "stump"],
    exit: "den",
  },
}
export const DEFAULT_SPECIES = "fox"

// Which abilities open which cell codes. The solver and the sim both ask this. Brush is cover, not a
// wall: everyone walks it, it only hides the line.
export const ABILITY_CELLS = { squeeze: ["GAP"], swim: ["WATER"] }
