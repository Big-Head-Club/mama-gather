// Print a generated level as text, with the solver's route.  node tools/ascii.mjs [seed] [tier]
import { generate } from "../src/game/gen.mjs"
import { C } from "../src/game/sim.mjs"
const seed = Number(process.argv[2] || 1), tier = process.argv[3] || "tiny"
const t0 = performance.now()
const lv = generate(seed, tier)
const ms = performance.now() - t0
const ch = { [C.GROUND]: ".", [C.TREE]: "T", [C.ROCK]: "o", [C.FENCE]: "#", [C.GAP]: "=", [C.SPOT]: "?", [C.PLATFORM]: "^", [C.RAMP]: "/", [C.EXIT]: "X" }
const rows = []
for (let z = 0; z < lv.h; z++) { rows.push([]); for (let x = 0; x < lv.w; x++) rows[z].push(ch[lv.grid[z * lv.w + x]] || "?") }
for (const p of lv.solve.route) if (rows[Math.floor(p[1])][Math.floor(p[0])] === ".") rows[Math.floor(p[1])][Math.floor(p[0])] = "·"
for (const p of lv.solve.route) if (rows[Math.floor(p[1])][Math.floor(p[0])] === "^") rows[Math.floor(p[1])][Math.floor(p[0])] = "˄"
for (const si of lv.babies) rows[lv.spots[si].z][lv.spots[si].x] = "B"
rows[lv.start[1]][lv.start[0]] = "S"
console.log(rows.map((r) => r.join("")).join("\n"))
console.log(`tier ${tier} ${lv.w}x${lv.h} spots ${lv.spots.length} babies ${lv.babies.length} optimal ${(lv.solve.ticks / 30).toFixed(1)}s (3★ ≤ ${(lv.solve.t3 / 30).toFixed(1)}s, 2★ ≤ ${(lv.solve.t2 / 30).toFixed(1)}s) dist ${lv.solve.dist}m attempt ${lv.attempt} gen ${ms.toFixed(0)}ms`)
