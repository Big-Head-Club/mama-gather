// The template's own tests. They check the primitives, not the example game —
// these are the things that must not break when you write a new game on top.

import { makeRng, hash } from "../src/core/rng.mjs"
import { dayKey, puzzleNumber, dayForPuzzle, msUntilNextDay, formatCountdown } from "../src/core/day.mjs"
import { seedFor, normaliseCrew, makeCrewCode } from "../src/core/seed.mjs"
import { strip, shareText, encodeResult, decodeResult, links } from "../src/core/share.mjs"
import config from "../relay.config.mjs"

let bad = 0
const ok = (name, cond, extra = "") => {
  if (cond) console.log("  ok  " + name)
  else { bad++; console.log("FAIL  " + name + " " + extra) }
}

// --- determinism ------------------------------------------------------------
{
  const a = makeRng(42), b = makeRng(42)
  ok("same seed, same stream", Array.from({ length: 50 }, () => a.next()).join() === Array.from({ length: 50 }, () => b.next()).join())
  const src = [1, 2, 3, 4, 5]
  makeRng(1).shuffle(src)
  ok("shuffle does not mutate its input", src.join() === "1,2,3,4,5")
  ok("hash is stable", hash("keyhole|2026-08-19") === hash("keyhole|2026-08-19"))
}

// --- the day ----------------------------------------------------------------
{
  ok("epoch is puzzle #1", puzzleNumber("2026-08-19", "2026-08-19") === 1)
  ok("puzzle numbers round-trip", dayForPuzzle(37, "2026-08-19") && puzzleNumber(dayForPuzzle(37, "2026-08-19"), "2026-08-19") === 37)
  ok("a timezone shifts the day boundary", typeof dayKey("America/Los_Angeles") === "string")
  const ms = msUntilNextDay("UTC")
  ok("countdown is inside one day", ms > 0 && ms <= 86400000, String(ms))
  ok("countdown formats", /^\d+:\d\d:\d\d$/.test(formatCountdown(ms)))
}

// --- seeds and crews --------------------------------------------------------
{
  const base = { gameKey: "keyhole", day: "2026-08-19", salt: "s" }
  ok("a crew gets its own puzzle", seedFor(base) !== seedFor({ ...base, crew: "ABC123" }))
  ok("two crews differ", seedFor({ ...base, crew: "ABC123" }) !== seedFor({ ...base, crew: "XYZ789" }))
  ok("the salt matters", seedFor(base) !== seedFor({ ...base, salt: "t" }))
  ok("two games on the same day differ", seedFor(base) !== seedFor({ ...base, gameKey: "other" }))
  ok("crew codes normalise", normaliseCrew(" ab-c12 ") === "ABC12")
  ok("short junk is not a crew", normaliseCrew("!!") === null)
  ok("generated codes avoid look-alikes", !/[IOL01]/.test(Array.from({ length: 40 }, () => makeCrewCode()).join("")))
}

// --- the share artifact -----------------------------------------------------
{
  const events = ["miss", "near", "hit"]
  const s = strip(events)
  ok("strip renders one glyph per beat", [...s].length >= 3)
  const text = shareText({ title: "KEYHOLE", number: 1, lines: ["2/6 · 3s"], strips: [s], url: "https://x.test/d/1" })
  const lines = text.split("\n")
  ok("share text is at most four lines", lines.length <= 4, String(lines.length))
  ok("the link is the last line", lines[lines.length - 1].startsWith("http"))
  ok("no hashtags", !text.includes("#" + "hashtag") && !/\s#[a-z]/i.test(text))

  const t = { n: 1, t: 2, s: 1, d: 3 }
  ok("result tokens round-trip", JSON.stringify(decodeResult(encodeResult(t))) === JSON.stringify(t))
  ok("a bad token decodes to null, not a throw", decodeResult("!!!!") === null)
  const l = links({ origin: "https://x.test", number: 7, crew: "ABC123", result: t })
  ok("links are absolute", l.invite.startsWith("https://") && l.card.startsWith("https://"))
  ok("the invite link carries no result", !l.invite.includes("r="))
  ok("the result link carries one", l.result.includes("r="))
}


// --- where they came from, and whether they came back -----------------------
{
  const { viaOf, returnVisit, VIAS } = await import("../src/core/via.mjs")
  ok("an explicit via wins", viaOf({ search: "?via=push&c=ABC123" }) === "push")
  ok("an unknown via is ignored", viaOf({ search: "?via=spam" }) === "direct")
  ok("a result link is a share", viaOf({ search: "?r=abc" }) === "share")
  ok("a crew link is a share", viaOf({ search: "?c=ABC123" }) === "share")
  ok("the cart shelf is a cart", viaOf({ referrer: "https://hundred-carts-production.up.railway.app/" }) === "cart")
  ok("reddit by referrer", viaOf({ referrer: "https://www.reddit.com/r/x" }) === "reddit")
  ok("a portal by referrer", viaOf({ referrer: "https://www.crazygames.com/game/x" }) === "portal")
  ok("a junk referrer is direct", viaOf({ referrer: "not a url" }) === "direct")
  ok("every via is a known one", VIAS.includes(viaOf({})))

  const d0 = returnVisit({ firstDay: null, lastReturnDay: null, today: "2026-09-14" })
  ok("day zero is not a return", !d0.fire && d0.firstDay === "2026-09-14")
  const d1 = returnVisit({ firstDay: d0.firstDay, lastReturnDay: d0.lastReturnDay, today: "2026-09-15" })
  ok("the next day is a return, one day in", d1.fire && d1.days === 1)
  const again = returnVisit({ firstDay: d1.firstDay, lastReturnDay: d1.lastReturnDay, today: "2026-09-15" })
  ok("a second load the same day does not fire twice", !again.fire)
  const d7 = returnVisit({ firstDay: "2026-09-14", lastReturnDay: "2026-09-15", today: "2026-09-21" })
  ok("a week later counts seven days", d7.fire && d7.days === 7)
  const { startFacts } = await import("../src/core/via.mjs")
  const s0 = startFacts({ firstDay: "2026-09-14", startedBefore: null, today: "2026-09-14" })
  ok("a first start is new, day zero", s0.new === true && s0.days_since_first === 0)
  const s1 = startFacts({ firstDay: "2026-09-14", startedBefore: "1", today: "2026-09-15" })
  ok("a later start is not new, and says how many days in", s1.new === false && s1.days_since_first === 1)
  ok("a start with no first day is day zero", startFacts({ firstDay: null, startedBefore: null, today: "2026-09-14" }).days_since_first === 0)
}

// --- deadline tables --------------------------------------------------------
{
  const { nextHourAt } = await import("../src/core/day.mjs")
  const { resolveDeadline, botLog } = await import("../src/core/table.mjs")
  const { modesOf } = await import("../src/core/modes.mjs")

  const now = Date.parse("2026-09-14T12:00:00Z")            // 05:00 in Los Angeles
  const at = nextHourAt("America/Los_Angeles", 21, now)
  const hourThere = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hourCycle: "h23" }).format(new Date(at)))
  ok("a deadline lands on the hour, on the day's wall clock", hourThere === 21 && new Date(at).getUTCMinutes() === 0, new Date(at).toISOString())
  ok("a deadline is later today, not tomorrow", at > now && at - now < 86400000)
  const past = nextHourAt("America/Los_Angeles", 3, now)
  ok("an hour already gone today is tomorrow's", past > now && past - now < 86400000)
  const dst = nextHourAt("America/Los_Angeles", 21, Date.parse("2026-11-01T12:00:00Z"))
  ok("the hour survives a daylight-saving change", new Date(dst).toISOString() === "2026-11-02T05:00:00.000Z", new Date(dst).toISOString())

  const m = modesOf({ modes: { table: { seats: [3, 6], resolve: "deadline", hour: 20 } } })
  ok("a deadline table is a mode", m.table.resolve === "deadline" && m.table.hour === 20 && m.table.bots === 3)

  // A four-door game written inline, so the template tests no game by name.
  const fake = {
    create: (seed) => ({ target: seed % 4, guesses: 0, over: false, solved: false }),
    apply(s, m) { if (s.over || !m || !(m.pick >= 0 && m.pick < 4)) return s; s.guesses++; if (m.pick === s.target) s.solved = s.over = true; else if (s.guesses >= 4) s.over = true; return s },
    replay(seed, log) { const s = this.create(seed); for (const m of log || []) this.apply(s, m); return s },
    result: (s) => ({ metric: s.solved ? s.guesses : 9, tiebreak: 0, events: [] }),
    moves: (s) => [0, 1, 2, 3].map((pick) => ({ pick })),
  }
  fake.replay = fake.replay.bind(fake)
  const seed = 1237
  const room = {
    code: "ABCDEF", resolve: "deadline", seed, bots: 3, deadline_at: at,
    subs: { alice: { log: [{ pick: seed % 4 }], seconds: 12, payload: { metric: 1 } } },
  }
  const metric = { dir: "asc" }
  ok("an open table does not resolve", resolveDeadline({ room, rules: fake, metric, now: at - 1 }) === null)
  const res = resolveDeadline({ room, rules: fake, metric, now: at })
  ok("at the hour, bots fill the empty seats", res && res.humans === 1 && res.bots === 2 && res.standings.length === 3)
  ok("the solver ranks with the best score", res.standings[0].metric === 1 && res.standings.find((r) => r.id === "alice").metric === 1)
  ok("resolving twice gives the same table", JSON.stringify(resolveDeadline({ room, rules: fake, metric, now: at + 5000 })) === JSON.stringify(res))

  const forged = { ...room, subs: { mallory: { log: [{ pick: 9 }], payload: { metric: 1 } } } }
  const fr = resolveDeadline({ room: forged, rules: fake, metric, now: at })
  ok("a claimed score never ranks; the replayed log does", fr.standings.find((r) => r.id === "mallory").metric !== 1)
  ok("a bot plays a board to its end from moves alone", fake.replay(seed, botLog(fake, seed, 1)).over)
}

// --- the quest draft --------------------------------------------------------
{
  const { draft, rarityWeights, poolFor } = await import("../src/core/draft.mjs")
  const U = [
    { id: "a", label: "A", rarity: "common", tags: ["x"] },
    { id: "b", label: "B", rarity: "common", tags: ["y"] },
    { id: "c", label: "C", rarity: "rare", tags: ["x"] },
    { id: "d", label: "D", rarity: "epic", tags: ["z"] },
    { id: "e", label: "E", rarity: "common", tags: ["z"], unlock: "gate", max: 1 },
  ]
  const offers = draft({ upgrades: U, rng: makeRng(7) })
  ok("a draft deals three distinct offers", offers.length === 3 && new Set(offers.map((o) => o.id)).size === 3)
  ok("the same seed deals the same draft", JSON.stringify(draft({ upgrades: U, rng: makeRng(7) })) === JSON.stringify(offers))
  ok("an epic never shows on the first leg", Array.from({ length: 200 }, (_, i) => draft({ upgrades: U, rng: makeRng(i), leg: 1 })).flat().every((o) => o.id !== "d"))
  ok("commons never vanish, however deep", rarityWeights(99).common > 0)
  ok("an unlock widens the pool, and only then", !poolFor(U).some((u) => u.id === "e") && poolFor(U, ["gate"]).some((u) => u.id === "e"))
  ok("max caps a held upgrade out of the draft", Array.from({ length: 100 }, (_, i) => draft({ upgrades: U, unlocked: ["gate"], held: ["e"], rng: makeRng(i) })).flat().every((o) => o.id !== "e"))
  const tagged = (held) => Array.from({ length: 2000 }, (_, i) => draft({ upgrades: U, held, rng: makeRng(i), leg: 5, n: 1 })).flat().filter((o) => o.id === "a" || o.id === "c").length
  const bias = tagged(["a"]) / tagged([])
  ok("held tags pull the draft, capped at about 2x", bias > 1.1 && bias < 2.05, bias.toFixed(2))

}

// --- the postgres store, against a fake driver ------------------------------
//
// The real SQL is exercised by tools/store-roundtrip.mjs against a live server.
// This pins the part that is easy to get wrong without one: that a flush sends
// only what changed, and a second store opened on the same rows sees it all.
{
  const { openStore, SCHEMA, UPSERT, neonEndpoint, neonHttp } = await import("../src/server/store.mjs")
  ok("neon's http endpoint swaps the first host label for api.",
    neonEndpoint("postgresql://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/db?sslmode=require") === "https://api.us-east-2.aws.neon.tech/sql")
  {
    let seen = null
    const fake = async (u, init) => { seen = { u, init }; return { ok: true, json: async () => ({ rows: [{ one: 1 }] }) } }
    const rows = await neonHttp("postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/db", fake)("select $1::int as one", [1])
    ok("a neon query posts the connection string and returns rows",
      rows[0].one === 1 && seen.init.headers["Neon-Connection-String"].startsWith("postgresql://") && JSON.parse(seen.init.body).params[0] === 1)
  }
  const table = new Map()
  const sent = []
  const exec = async (query, params) => {
    if (query === SCHEMA) return []
    if (query.startsWith("select kind, id, doc")) return [...table.values()].map((r) => ({ ...r, doc: JSON.stringify(r.doc) }))
    if (query === UPSERT) {
      const docs = JSON.parse(params[0])
      sent.push(docs.length)
      for (const d of docs) table.set(d.kind + "|" + d.id, d)
      return []
    }
    throw new Error("unexpected query: " + query.slice(0, 40))
  }
  const a = await openStore(null, { exec })
  a.player("p1").display_name = "Ada"
  a.bumpStreak("p1", "2026-09-14")
  await a.flush()
  ok("a flush writes the new documents", sent.at(-1) === 2, JSON.stringify(sent))
  await a.flush()
  ok("a flush with nothing changed writes nothing", sent.length === 1, JSON.stringify(sent))
  const b = await openStore(null, { exec })
  ok("a second store reads what the first wrote", b.db.players.p1.display_name === "Ada" && b.streak("p1").current === 1)
  ok("with no DATABASE_URL the store is still a JSON file", (await openStore("/nonexistent-dir-relay/save.json", { databaseUrl: "" })).kind === "json")
}

// --- web push ---------------------------------------------------------------
{
  const { vapidConfig, vapidToken, sendPush, publicKeyObject } = await import("../src/server/push.mjs")
  const { generateKeyPairSync, verify } = await import("node:crypto")
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  const pub = publicKey.export({ format: "jwk" })
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]).toString("base64url")
  const vapid = vapidConfig({ VAPID_PUBLIC_KEY: raw, VAPID_PRIVATE_KEY: privateKey.export({ format: "jwk" }).d }, "https://game.example")
  ok("push is off without keys", vapidConfig({}) === null)
  ok("the subject defaults to the game's origin", vapid.subject === "https://game.example")

  const endpoint = "https://fcm.googleapis.com/fcm/send/abc123"
  const now = Date.parse("2026-09-14T12:00:00Z")
  const jwt = vapidToken({ endpoint, vapid, now })
  const [h, c, s] = jwt.split(".")
  const claims = JSON.parse(Buffer.from(c, "base64url"))
  ok("the token's audience is the push service origin", claims.aud === "https://fcm.googleapis.com")
  ok("the token expires inside a day", claims.exp > now / 1000 && claims.exp <= now / 1000 + 86400)
  ok("the token verifies against the public key", verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKeyObject(raw), dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")))

  let seen = null
  const r = await sendPush({ endpoint }, { vapid, now, fetchImpl: async (u, init) => { seen = { u, init }; return { status: 201 } } })
  ok("a push is an empty POST with a vapid header", r.ok && seen.init.method === "POST" && !seen.init.body && /^vapid t=[^,]+, k=/.test(seen.init.headers.authorization) && seen.init.headers.ttl)
  const gone = await sendPush({ endpoint }, { vapid, fetchImpl: async () => ({ status: 410 }) })
  ok("a 410 means the subscription is gone", gone.gone && !gone.ok)
  ok("a non-https endpoint is refused without a request", (await sendPush({ endpoint: "http://x" }, { vapid, fetchImpl: () => { throw new Error("fetched") } })).gone)
}

// --- credits ----------------------------------------------------------------
{
  const { checkCredits, RELAY_CREDITS } = await import("../src/core/credits.mjs")
  ok("the config credits cleanly", checkCredits(config.credits).length === 0, checkCredits(config.credits).join("; "))
  ok("a missing block fails", checkCredits(undefined).length === 1)
  ok("an empty block fails", checkCredits({ art: [], code: [] }).length === 1)
  ok("an entry that names nobody fails", checkCredits({ art: [{ what: "tiles" }] }).some((p) => p.includes("names nobody")))
  ok("a bad url fails", checkCredits({ art: [{ what: "tiles", who: "Kenney", url: "kenney.nl" }] }).length === 1)
  ok("an unknown group fails", checkCredits({ misc: [] }).length >= 1)
  ok("Relay's own debts are in the config", RELAY_CREDITS.code.every((c) => (config.credits.code || []).some((x) => x.what === c.what && x.who === c.who)))
  ok("music is a group, as in steam-shell", checkCredits({ music: [{ what: "theme", who: "Someone" }] }).length === 0)

  const { loadCredits } = await import("../src/server/credits.mjs")
  const { mkdtemp, writeFile: wf } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const dir = await mkdtemp(tmpdir() + "/relay-credits-")
  ok("with no credits.json the config block is used", (await loadCredits(dir, config)) === config.credits)
  await wf(dir + "/credits.json", JSON.stringify({ art: [{ what: "tiles", who: "Kenney", url: "https://kenney.nl", licence: "CC0" }] }))
  ok("a credits.json beside the config wins", (await loadCredits(dir, config)).art[0].who === "Kenney")
}

// --- the portal build -------------------------------------------------------
{
  const { execFileSync } = await import("node:child_process")
  const { mkdtemp, readFile: rf } = await import("node:fs/promises")
  const { existsSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const out = await mkdtemp(tmpdir() + "/relay-portal-")
  let built = true
  try { execFileSync(process.execPath, [new URL("../tools/build-portal.mjs", import.meta.url).pathname, "--out", out], { stdio: "pipe" }) } catch { built = false }
  ok("the portal build finishes", built)
  const html = built ? await rf(out + "/index.html", "utf8") : ""
  const client = built ? await rf(out + "/src/client/relay.mjs", "utf8") : ""
  ok("a portal page loads nothing from another origin", built && !/https?:\/\//.test(html))
  ok("a portal page has no analytics, worker or manifest", built && !/t\.js|sw\.js|manifest/.test(html))
  ok("a portal page says it is a portal", built && /"portal":true/.test(html))
  ok("every import in a portal build is relative", built && !/from\s*["']\/(?!\/)/.test(client) && client.includes('from "../../src/core/day.mjs"'))
  ok("a portal build carries the game and its theme", built && existsSync(out + "/src/game") && existsSync(out + "/app.css"))
}

// --- config sanity ----------------------------------------------------------
{
  ok("config declares an epoch", /^\d{4}-\d{2}-\d{2}$/.test(config.epoch))
  ok("config declares a metric direction", ["asc", "desc"].includes(config.metric.dir))
  ok("share lines are one line each", !config.share.statLine({ solved: true, tries: 2, seconds: 3 }).includes("\n"))
  ok("the share token omits the answer", !JSON.stringify(config.share.token({ number: 1, tries: 2, solved: true, seconds: 3 })).includes("lock"))
}

console.log(bad ? `\n${bad} failing` : "\nall green")
process.exit(bad ? 1 : 0)
