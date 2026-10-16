// Prove the store round-trips through a real Postgres: write through one store,
// flush, open a second store on the same database, read it back.
//
//   node tools/store-roundtrip.mjs                    DATABASE_URL from the env
//   node tools/store-roundtrip.mjs psql:<dbname>      a local server, through psql
//
// The psql form exists so the SQL itself is tested on a laptop with no driver
// installed: it shells out to psql and substitutes the parameters as literals.
// It is a test harness, never a production path.

import { execFileSync } from "node:child_process"
import { openStore } from "../src/server/store.mjs"

const target = process.argv[2] || process.env.DATABASE_URL
if (!target) { console.error("usage: node tools/store-roundtrip.mjs [psql:<db> | postgres url]  (or set DATABASE_URL)"); process.exit(2) }

function psqlExec(dbname) {
  const lit = (v) => (v == null ? "null" : "'" + String(v).replace(/'/g, "''") + "'")
  return async (query, params = []) => {
    const sql = query.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]))
    const isSelect = /^\s*select/i.test(sql)
    const wrapped = isSelect ? `select coalesce(json_agg(t), '[]'::json) from (${sql}) t` : sql
    const out = execFileSync("psql", ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-h", process.env.PGHOST || "/tmp", "-d", dbname, "-c", wrapped], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    return isSelect ? JSON.parse(out.trim() || "[]") : []
  }
}

const exec = target.startsWith("psql:") ? psqlExec(target.slice(5)) : undefined
const open = () => (exec ? openStore(null, { exec }) : openStore(null, { databaseUrl: target }))

const say = (name, cond, extra = "") => { console.log((cond ? "  ok  " : "FAIL  ") + name + (extra ? " " + extra : "")); if (!cond) process.exitCode = 1 }
const id = "roundtrip-" + Date.now().toString(36)

const a = await open()
say("opens on postgres and applies its own schema", a.kind === "postgres")
a.player(id).display_name = "Round Trip"
a.putRun({ id: `${id}|2026-09-14|`, player_id: id, day: "2026-09-14", crew: "", metric: 3, tiebreak: -9, payload: { note: "it's a quote" }, log: [{ picks: [1, 2, 3, 0] }], verified: true, created_at: Date.now() })
a.bumpStreak(id, "2026-09-14")
a.putRoom({ code: "RT" + Date.now().toString(36).slice(-4).toUpperCase(), seed: 42, subs: { [id]: { metric: 3, tiebreak: 0, log: [], at: 1 } } })
const code = a.claimFor(id, () => "RTRT-" + Date.now().toString(36).slice(-4).toUpperCase())
await a.flush()

const b = await open()
say("a player comes back", b.db.players[id] && b.db.players[id].display_name === "Round Trip")
say("a run comes back with its payload intact", b.getRun(id, "2026-09-14", null)?.payload.note === "it's a quote")
say("a streak comes back", b.streak(id).current === 1)
say("a claim code comes back as a plain string", b.adopt(code) === id)

b.player(id).display_name = "Changed"
await b.flush()
const c = await open()
say("a changed document is written again", c.db.players[id].display_name === "Changed")
