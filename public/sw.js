// The service worker. Two jobs, both about coming back:
//
//   1. PUSH. The server sends an empty push (see src/server/push.mjs). This
//      wakes, asks /api/push.latest what to say for this subscription, and
//      shows it. Tapping it opens the game with ?via=push, so the scoreboard
//      can tell a reminder that worked from one that did not.
//   2. OFFLINE. Static files (the host, the game, the theme) are kept from the
//      last visit, so a player on a train still gets a board. The API is never
//      cached: the host already plays unscored when it cannot reach it.

const CACHE = "relay-static-v1"
const STATIC = /^\/(src|themes)\/|^\/(app\.css|icon\.(svg|png)|manifest\.webmanifest)$/

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== "GET" || url.origin !== location.origin) return
  const isPage = e.request.mode === "navigate"
  if (!isPage && !STATIC.test(url.pathname)) return
  // Network first, always: a stale host after a deploy is worse than a slow
  // one. The cache is only what answers when the network does not.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE)
    try {
      const res = await fetch(e.request)
      if (res.ok) cache.put(isPage ? "/__page" : e.request, res.clone())
      return res
    } catch {
      return (await cache.match(isPage ? "/__page" : e.request)) || Response.error()
    }
  })())
})

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let msg = { title: "Today's board is up", body: "", url: "/" }
    try {
      const sub = await self.registration.pushManager.getSubscription()
      const res = await fetch("/api/push.latest", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub && sub.endpoint }),
      })
      if (res.ok) msg = Object.assign(msg, await res.json())
    } catch { /* a notification with the default words beats none: iOS revokes a silent push */ }
    const url = new URL(msg.url || "/", location.origin)
    url.searchParams.set("via", "push")
    await self.registration.showNotification(msg.title, { body: msg.body, icon: "/icon.png", data: { url: url.pathname + url.search }, tag: "relay" })
  })())
})

self.addEventListener("notificationclick", (e) => {
  e.notification.close()
  const target = (e.notification.data && e.notification.data.url) || "/?via=push"
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    for (const c of open) if ("focus" in c) { await c.navigate(target).catch(() => {}); return c.focus() }
    return self.clients.openWindow(target)
  })())
})
