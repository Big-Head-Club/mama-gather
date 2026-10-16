// Send "today's board is up" to everyone who asked for a reminder.
//
//   TALLY_TOKEN=... node tools/push-daily.mjs https://your-game.up.railway.app
//
// Run it once a day, a little after the day flips — a Railway cron service
// with this as its start command is the whole setup. The server does the
// sending (it holds the subscriptions and the keys); this only asks it to, and
// prints how many went, how many failed, and how many were dead and dropped.

const origin = (process.argv[2] || process.env.PUBLIC_ORIGIN || "").replace(/\/+$/, "")
const token = process.env.TALLY_TOKEN
if (!origin || !token) { console.error("usage: TALLY_TOKEN=... node tools/push-daily.mjs <origin>"); process.exit(2) }

const res = await fetch(`${origin}/admin/push/${token}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "daily" }),
})
const body = await res.json().catch(() => ({}))
console.log(res.status, JSON.stringify(body))
if (!res.ok || body.error) process.exit(1)
