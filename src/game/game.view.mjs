// Mama Gather — view. The 3D forest, one thumbstick, a counter, a clock and a corner map. The sim is
// driven from here at 30 Hz; every stick change goes in the log with its tick; the server replays it.

import { create, apply, advance, result, stars, HZ } from "./game.rules.mjs"
import { generate, weekdayForDay } from "./gen.mjs"
import { C, cellAt, babyAt, isSleeper } from "./sim.mjs"
import { makeWorld } from "./world.mjs"
import { makeStick, STICK_CSS } from "./stick.mjs"
import { audio, sfx } from "./sound.mjs"
import { drawMap, drawMini } from "./map2d.mjs"
import { tw, onTweak, mountTweaks } from "./tweaks.mjs"
import { SPECIES } from "./kit.mjs"
import config from "../../relay.config.mjs"

const REDUCED = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
const TOUCH = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches
const DEBUG = typeof location !== "undefined" && /[?&]debug/.test(location.search)
// ?pump=1: drive the frame loop from a MessageChannel as well, which Chrome does not freeze when the
// tab is not focused (automation runs at 1 fps on rAF alone; log-run found this, 2026-09-17).
const PUMP = typeof location !== "undefined" && /[?&]pump/.test(location.search)
function makeLoop(fn) {
  let on = true, last = 0
  const step = (now) => { if (!on) return; try { fn(now) } catch (e) { console.error(e) } }
  if (PUMP) {
    const mc = new MessageChannel()
    mc.port1.onmessage = () => { if (!on) return; const now = performance.now(); if (now - last >= 15) { last = now; step(now) } setTimeout(() => mc.port2.postMessage(0), 4) }
    mc.port2.postMessage(0)
  } else {
    const raf = (now) => { if (!on) return; step(now); requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
  }
  return { stop() { on = false } }
}

const clock = (ticks) => { const s = Math.max(0, ticks) / HZ; const m = Math.floor(s / 60), r = s - m * 60; return m ? `${m}:${r.toFixed(1).padStart(4, "0")}` : `${r.toFixed(1)}` }
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n }
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms) } catch {} }
const look = () => ({ viewH: tw().zoom === "close" ? 12.5 : tw().zoom === "wide" ? 18 : 15, camLift: tw().cam === "high" ? 1.45 : 1, prints: tw().prints !== "off", antics: tw().antics !== "off", ghost: tw().ghost !== "off" })
// a little fox face for the counter: ears, head, nose
const FACE = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 2l5 4h4l5-4v7a7 7 0 0 1-14 0z" fill="currentColor"/><circle cx="10" cy="13" r="1.6" fill="#2b1200"/></svg>`
const tipSeen = (k) => { try { return localStorage.getItem("mg.tip." + k) === "1" } catch { return false } }
const tipMark = (k) => { try { localStorage.setItem("mg.tip." + k, "1") } catch {} }

const CSS = `
.mg { position:absolute; inset:0; overflow:hidden; touch-action:none; user-select:none; -webkit-user-select:none; background:var(--ground); }
.mg-canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.mg-hud { position:absolute; left:0; right:0; top:0; padding:max(10px, env(safe-area-inset-top)) 12px 0; display:flex; justify-content:space-between; align-items:flex-start; pointer-events:none; z-index:6; }
.mg-hud > * { pointer-events:auto; }
.mg-pill { display:flex; align-items:center; gap:8px; background:rgba(0,0,0,.42); border-radius:999px; padding:8px 14px; font-family:var(--display); font-weight:700; letter-spacing:.06em; color:#fff; font-size:20px; box-shadow:0 3px 0 rgba(0,0,0,.25); }
.mg-pill small { font-size:11px; letter-spacing:.2em; opacity:.75; font-weight:500; }
.mg-pill.done { background:#ffd23f; color:#2b1200; }
.mg-dots { display:flex; gap:3px; flex-wrap:wrap; max-width:120px; }
.mg-dots i { width:16px; height:16px; display:block; color:rgba(255,255,255,.28); transition:transform .25s, color .25s; }
.mg-dots i.on { color:#ffb15e; filter:drop-shadow(0 0 4px #ffb15e); }
.mg-dots i.pop { transform:scale(1.5); }
.mg-pill.done .mg-dots i.on { color:#2b1200; filter:none; }
.mg-clock { font-variant-numeric:tabular-nums; min-width:5.2ch; text-align:right; }
.mg-menu-btn { width:44px; height:44px; border-radius:50%; border:0; background:rgba(0,0,0,.42); color:#fff; font-size:22px; line-height:1; box-shadow:0 3px 0 rgba(0,0,0,.25); }
.mg-right { display:flex; gap:8px; align-items:center; }
.mg-cap { position:absolute; left:50%; transform:translateX(-50%); top:calc(max(10px, env(safe-area-inset-top)) + 62px); background:rgba(0,0,0,.55); color:#fff; padding:10px 16px; border-radius:14px; font-family:var(--display); font-weight:600; font-size:17px; max-width:min(92vw, 420px); text-align:center; z-index:6; pointer-events:none; transition:opacity .3s; }
.mg-cap[hidden] { display:none; }
.mg-keys { position:absolute; left:50%; transform:translateX(-50%); bottom:calc(14px + env(safe-area-inset-bottom)); display:flex; gap:10px; align-items:center; color:rgba(255,255,255,.8); font-size:12px; letter-spacing:.18em; text-transform:uppercase; z-index:6; pointer-events:none; }
.mg-keys kbd { font:700 12px var(--display); background:rgba(255,255,255,.14); border:1.5px solid rgba(255,255,255,.4); border-radius:6px; padding:3px 7px; color:#fff; letter-spacing:.05em; }
.mg-mini { position:absolute; right:12px; bottom:calc(12px + env(safe-area-inset-bottom)); width:104px; height:104px; border-radius:14px; box-shadow:0 0 0 2px rgba(255,255,255,.35), 0 4px 0 rgba(0,0,0,.25); z-index:6; pointer-events:none; background:#07301a; }
.mg-mini[hidden] { display:none; }
.mg-tag { position:absolute; transform:translate(-50%, -100%); background:rgba(0,0,0,.6); color:#fff; padding:5px 10px; border-radius:10px; font:700 15px var(--display); z-index:5; pointer-events:none; white-space:nowrap; }
.mg-tag[hidden] { display:none; }
.mg-menu { position:absolute; inset:0; z-index:9; background:rgba(5,25,12,.72); display:flex; align-items:center; justify-content:center; padding:16px; }
.mg-menu[hidden] { display:none; }
.mg-card { width:min(92vw, 420px); max-height:calc(100% - 24px); overflow:auto; background:#0e4a26; border-radius:22px; padding:22px 20px; display:flex; flex-direction:column; gap:12px; box-shadow:0 14px 0 rgba(0,0,0,.35), 0 0 0 3px rgba(255,255,255,.12); color:#fbfff5; text-align:center; }
.mg-card h2 { margin:0; font:700 30px/1.05 var(--display); letter-spacing:.02em; }
.mg-card .mg-stars { font-size:44px; letter-spacing:.1em; line-height:1; color:#ffd23f; }
.mg-card .mg-stars .off { color:rgba(255,255,255,.22); }
.mg-card .mg-stars .pop { display:inline-block; animation:mg-star .5s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes mg-star { from { transform:scale(0) rotate(-40deg); } to { transform:scale(1) rotate(0); } }
.mg-card .mg-time { font:700 54px/1 var(--display); font-variant-numeric:tabular-nums; }
.mg-card .mg-best { font:700 18px/1.2 var(--display); color:#ffd23f; letter-spacing:.04em; }
.mg-card .mg-sub { opacity:.8; font-size:15px; }
.mg-card .btn { width:100%; min-width:0; }
.mg-card .btn.ghost { font-size:15px; }
.mg-card canvas { width:100%; border-radius:14px; display:block; }
.mg-legend { display:flex; gap:14px; justify-content:center; font-size:12px; letter-spacing:.12em; text-transform:uppercase; opacity:.85; }
.mg-legend i { display:inline-block; width:18px; height:3px; vertical-align:middle; margin-right:6px; border-radius:2px; background:#ff8a3d; }
.mg-legend i.opt { background:repeating-linear-gradient(90deg, #fff 0 5px, transparent 5px 9px); }
.mg-res { display:flex; flex-direction:column; gap:10px; align-items:center; width:100%; }
.mg-res canvas { width:min(100%, 380px); border-radius:16px; box-shadow:0 0 0 3px rgba(255,255,255,.14); }
.mg-res .mg-stars { font-size:46px; color:#ffd23f; letter-spacing:.08em; line-height:1; }
.mg-res .mg-stars .off { color:rgba(255,255,255,.22); }
.mg-res .mg-time { font:700 60px/1 var(--display); font-variant-numeric:tabular-nums; }
.mg-res .mg-sub { opacity:.85; font-size:16px; }
.mg-row { display:flex; gap:8px; }
.mg-row .btn { flex:1; min-width:0; padding-inline:12px; }
/* THE DOOR: the forest is the window, the words are one bar across its foot. On a wide screen the bar is one
   row (title, Play, Practice, links) with the other games as a short strip under it, not a phone column with
   a shelf taller than the game (Mack, 2026-10-16: "our games look stupid on computer when more than 50% of the
   screen is filled with sdk menu"). */
.screen.on-splash .gad-shelf { zoom:.78; margin-top:12px; }
.screen.on-splash .gad-end { zoom:.78; }
@container (min-width: 760px) {
  #stage > .screen.on-splash { max-width:none; display:grid; grid-template-columns:1fr auto auto auto; grid-template-areas:"title play practice links" "shelf shelf shelf shelf"; align-items:center; column-gap:22px; row-gap:10px; text-align:left; padding:16px 36px 8px; }
  #stage > .screen.on-splash > * { margin-top:0; }
  .screen.on-splash .mg-doortitle { grid-area:title; display:flex; flex-direction:column; gap:2px; min-width:0; }
  .screen.on-splash .mg-doortitle .big { font-size:clamp(26px, 3.2cqw, 40px); }
  .screen.on-splash .mg-doortitle .label { margin:0; }
  .screen.on-splash .mg-doortitle .muted { margin:0; }
  .screen.on-splash .mg-play { grid-area:play; width:auto; min-width:240px; margin:0; }
  .screen.on-splash .mg-practice { grid-area:practice; width:auto; min-width:0; margin:0; }
  .screen.on-splash .feet { grid-area:links; flex-direction:column; align-items:flex-start; gap:6px; margin:0; }
  .screen.on-splash .gad-shelf { grid-area:shelf; zoom:.58; margin:0; }
  .screen.on-splash > .label:not(.mg-doortitle *), .screen.on-splash > .mg-doornote { grid-column:1 / -1; margin:0; }
}
/* THE RESULT: the map beside the words on a wide screen, the shelf short */
@container (min-width: 760px) {
  #stage > .screen:has(.resultart) { max-width:960px; display:grid; grid-template-columns:minmax(0, 420px) 1fr; grid-template-areas:"art head" "art stat" "art strip" "art rank" "art share" "art next" "art remind" "art practice" "end end"; column-gap:36px; row-gap:10px; align-items:center; text-align:left; }
  #stage > .screen:has(.resultart) > * { margin-top:0; }
  #stage > .screen:has(.resultart) .resultart { grid-area:art; align-self:start; }
  #stage > .screen:has(.resultart) .gad-end { grid-area:end; zoom:.6; }
  #stage > .screen:has(.resultart) .btn { width:auto; min-width:220px; }
}
/* MENUS ARE BARS: the pause bar and the run bar sit on the bottom edge, carried to the window edges; the
   lesser choices share a row; the world stays visible above */
.mg-menu { align-items:flex-end; justify-content:center; padding:0; background:rgba(5,25,12,.38); }
.mg-card { width:100%; max-width:none; border-radius:0; padding:18px 16px calc(16px + env(safe-area-inset-bottom)); box-shadow:0 -1px 0 rgba(255,255,255,.18); gap:10px; max-height:calc(100% - 12px); }
.mg-card h2 { font-size:22px; }
.mg-card .mg-row .btn.ghost { font-size:14px; padding:12px 8px; }
.mg-card .mg-links { display:flex; gap:18px; justify-content:center; flex-wrap:wrap; }
.mg-card .mg-links button { background:none; border:0; color:#fbfff5; font:600 14px var(--display); letter-spacing:.06em; text-decoration:underline; text-underline-offset:3px; padding:6px 2px; cursor:pointer; opacity:.9; }
.mg-card.mg-pause { max-width:none; }
.mg-card.mg-pause .mg-inner { width:min(100%, 560px); margin:0 auto; display:flex; flex-direction:column; gap:10px; }
.mg-card.mg-run .mg-inner { width:min(100%, 560px); margin:0 auto; display:flex; flex-direction:column; gap:10px; align-items:center; }
.mg-card.mg-run canvas { width:min(100%, 300px); }
@container (min-width: 760px) {
  .mg-card.mg-run .mg-inner { width:min(100%, 900px); display:grid; grid-template-columns:260px 1fr auto; grid-template-areas:"map stars btns" "map time btns" "map best btns" "map next btns" "map legend btns"; column-gap:28px; row-gap:4px; align-items:center; text-align:left; }
  .mg-card.mg-run canvas { grid-area:map; width:260px; }
  .mg-card.mg-run .mg-stars { grid-area:stars; font-size:36px; }
  .mg-card.mg-run .mg-time { grid-area:time; font-size:48px; }
  .mg-card.mg-run .mg-best { grid-area:best; }
  .mg-card.mg-run .mg-next { grid-area:next; }
  .mg-card.mg-run .mg-legend { grid-area:legend; justify-content:flex-start; }
  .mg-card.mg-run .mg-btns { grid-area:btns; display:flex; flex-direction:column; gap:10px; min-width:240px; }
  .mg-card.mg-run .mg-btns .mg-row { flex-direction:column; }
  .mg-card.mg-run .mg-btns .btn { width:100%; }
  .mg-card.mg-pause .mg-inner { width:min(100%, 760px); }
}
.mg-dbg { position:absolute; left:12px; bottom:calc(12px + env(safe-area-inset-bottom)); background:rgba(0,0,0,.6); color:#fff; font:12px/1.4 var(--mono); padding:8px 10px; border-radius:8px; z-index:7; white-space:pre; }
${STICK_CSS}
`

function css() {
  if (document.getElementById("mg-css")) return
  const st = document.createElement("style"); st.id = "mg-css"; st.textContent = CSS; document.head.append(st)
}
const todFor = (number) => (tw().tod === "day" ? 2 : tw().tod === "night" ? 6 : number ? weekdayForDay(number, config.epoch) : 1)

export default {
  glyphs: { three: "\u{1F7E8}", two: "\u{1F7E7}", one: "\u{1F7E9}", quit: "⬛" },
  how: [
    "You are a fox mother. Drag anywhere to walk. A log, fern, stump or burrow that rustles has one of your kits inside: walk up and it falls in line behind you.",
    "Find every kit, then take the line home to the den. Nothing can go wrong; the clock is the only pressure. Three stars for a fast run, and you can run the same forest again for a better time.",
    "Bigger forests have mud that slows her, ponds she walks round, a kit that sleeps until she stays beside it, and one that runs between two hiding places. The corner map remembers what she has seen.",
    "The strip shows how each run ended, never where the kits were. One forest a day, the same for everyone.",
  ],

  // The front screen: a forest, her, and a line of kits trotting behind her.
  splash(stage, { seed, number }) {
    css()
    const host = el("div", "mg"); host.dataset.bleed = ""
    host.style.cssText = "pointer-events:none"
    stage.prepend(host)
    let dead = false, loop = null, world = null
    const lv = generate((seed ^ 0x77) >>> 0, "tiny")
    const pts = lv.solve.route.concat(lv.solve.route.slice().reverse())
    makeWorld(host, lv, { splash: true, lookOpts: Object.assign(look(), { viewH: 11 }), tod: todFor(number) }).then((w) => {
      if (dead) { w.destroy(); return }
      world = w
      loop = makeLoop((now) => { if (!dead) w.splashStep(now, pts) })
    }).catch(() => {})
    const veil = el("div"); veil.style.cssText = "position:absolute;inset:0;background:linear-gradient(180deg, rgba(5,30,14,.15), rgba(5,30,14,.55) 70%);pointer-events:none"
    host.append(veil)
    // the host builds the door after this returns: group its title lines and name its buttons so the bar can be one row
    requestAnimationFrame(() => {
      const sc = stage.querySelector(".screen.on-splash"); if (!sc || sc.querySelector(".mg-doortitle")) return
      const kids = [...sc.children]
      const big = kids.find((k) => k.classList.contains("big")); if (!big) return
      const i = kids.indexOf(big)
      const title = el("div", "mg-doortitle")
      const take = [kids[i - 1] && kids[i - 1].classList.contains("label") ? kids[i - 1] : null, big, kids[i + 1] && kids[i + 1].classList.contains("muted") ? kids[i + 1] : null].filter(Boolean)
      sc.insertBefore(title, take[0]); for (const k of take) title.append(k)
      for (const b of sc.querySelectorAll(":scope > .btn")) b.classList.add(b.classList.contains("ghost") ? "mg-practice" : "mg-play")
      for (const l of sc.querySelectorAll(":scope > .label")) l.classList.add("mg-doornote")
    })
    return { destroy() { dead = true; if (loop) loop.stop(); if (world) world.destroy(); host.remove() } }
  },

  // The payoff: the map from above with the route she walked drawn in over two seconds, the solver's
  // route dashed beneath it.
  resultArt(root, { seed, number, log, result: r }) {
    css()
    const st = create(seed, { number })
    for (const m of log || []) apply(st, m)
    const res = result(st)
    const lv = st.level
    const wrap = el("div", "mg-res")
    const c = document.createElement("canvas"); c.width = 760; c.height = 760
    wrap.append(c)
    const sEl = el("div", "mg-stars"); sEl.innerHTML = starHtml(res.stars)
    wrap.append(sEl)
    wrap.append(el("div", "mg-time", res.solved ? clock(res.ticks) + "s" : "—"))
    wrap.append(el("div", "mg-sub", nextStarLine(res)))
    const lg = el("div", "mg-legend"); lg.innerHTML = `<span><i></i>yours</span><span><i class="opt"></i>fastest</span>`; wrap.append(lg)
    root.append(wrap)
    const route = res.route || (st.att && st.att.path) || null
    const t0 = performance.now()
    const draw = () => {
      const p = REDUCED ? 1 : Math.min(1, (performance.now() - t0) / 2200)
      drawMap(c, lv, { route, optimal: lv.solve.route, progress: p, stars: res.stars })
      if (p < 1) requestAnimationFrame(draw)
    }
    draw()
  },

  mount(root, { seed, mode, number, coach, finish }) {
    css(); mountTweaks()
    // the host queued its start event a moment ago; flush it before the level generates and the models parse,
    // or the batch timer fires seconds late and the start looks lost
    try { window.tally && window.tally.flush && window.tally.flush() } catch {}
    // ?debug&tier=big forces a tier on a local run (never scored: the server replays with the day's own tier)
    const forced = DEBUG ? new URLSearchParams(location.search).get("tier") : null
    const state = create(seed, forced ? { number, tier: forced } : { number })
    const lv = state.level
    const species = SPECIES[lv.species] || SPECIES.fox
    const log = []
    let destroyed = false, done = false
    const push = (m) => { log.push(m); apply(state, m) }

    const host = el("div", "mg"); host.dataset.bleed = ""
    root.append(host)
    // HUD
    const hud = el("div", "mg-hud")
    const counter = el("div", "mg-pill")
    const count = el("span", "", `0/${lv.babies.length}`)
    const dots = el("div", "mg-dots")
    for (let i = 0; i < lv.babies.length; i++) { const f = el("i"); f.innerHTML = FACE; dots.append(f) }
    counter.append(el("small", "", species.babies.toUpperCase()), count, dots)
    const right = el("div", "mg-right")
    const clk = el("div", "mg-pill mg-clock", "0.0")
    const menuBtn = el("button", "mg-menu-btn", "≡"); menuBtn.setAttribute("aria-label", "Menu")
    right.append(clk, menuBtn)
    hud.append(counter, right)
    host.append(hud)
    const cap = el("div", "mg-cap"); cap.hidden = true; host.append(cap)
    const tag = el("div", "mg-tag"); tag.hidden = true; host.append(tag)
    if (!TOUCH) { const k = el("div", "mg-keys"); k.innerHTML = "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>or hold the mouse</span>"; host.append(k) }
    // the corner map: what she has seen so far. Off on the tiny days (it would be most of the screen's worth of forest)
    const mini = document.createElement("canvas"); mini.className = "mg-mini"; mini.width = 208; mini.height = 208; mini.setAttribute("aria-label", "Map of what she has seen")
    host.append(mini)
    let miniOn = lv.w > 20; try { const v = localStorage.getItem("mg.mini"); if (v === "1") miniOn = true; if (v === "0") miniOn = false } catch {}
    mini.hidden = !miniOn
    const seen = new Map(), miniCache = {}
    let miniAt = 0
    const dbg = DEBUG ? el("div", "mg-dbg") : null; if (dbg) host.append(dbg)
    // ?debug exposes the level and an input hook so a script can drive a run (tools/phone-check, hand checks)
    if (DEBUG) window.__mg = { state, lv, input: (d, s) => stickInput(d, s), get att() { return state.att } }

    // menu / end panel
    const menu = el("div", "mg-menu"); menu.hidden = true; host.append(menu)
    const card = el("div", "mg-card"); menu.append(card)
    // a card is the whole screen: the HUD, caption and map go away under it (the clock pill overlapped the stars on an SE)
    const openMenu = (fill) => { card.replaceChildren(); fill(card); menu.hidden = false; cap.hidden = true; hud.style.visibility = "hidden"; mini.style.visibility = "hidden"; stick.release() }
    const closeMenu = () => { menu.hidden = true; hud.style.visibility = ""; mini.style.visibility = ""; showCap() }
    menu.addEventListener("pointerdown", (e) => e.stopPropagation())
    menuBtn.onclick = () => {
      if (world && world.inFinale) return
      audio()
      openMenu((c) => {
        c.classList.add("mg-pause")
        const inner = el("div", "mg-inner"); c.append(inner)
        const row1 = el("div", "mg-row")
        const b1 = el("button", "btn", "Keep going"); b1.onclick = closeMenu
        const b2 = el("button", "btn ghost", "Start over"); b2.onclick = () => { closeMenu(); restart() }
        row1.append(b1, b2); inner.append(row1)
        const links = el("div", "mg-links")
        const b3 = el("button", "", sfx.muted() ? "Sound off" : "Sound on"); b3.onclick = () => { sfx.setMuted(!sfx.muted()); b3.textContent = sfx.muted() ? "Sound off" : "Sound on"; if (sfx.muted()) sfx.musicOff(); else if (tw().music === "on") sfx.music() }
        const b4 = el("button", "", `Map ${miniOn ? "on" : "off"}`); b4.onclick = () => { miniOn = !miniOn; mini.hidden = !miniOn; b4.textContent = `Map ${miniOn ? "on" : "off"}`; try { localStorage.setItem("mg.mini", miniOn ? "1" : "0") } catch {} }
        const b5 = el("button", "", `Hint ring ${hintOn ? "on" : "off"}`); b5.onclick = () => { hintOn = !hintOn; world && world.setHintRing(hintOn); b5.textContent = `Hint ring ${hintOn ? "on" : "off"}`; try { localStorage.setItem("mg.hintring", hintOn ? "1" : "0") } catch {} }
        const b6 = el("button", "", state.best >= 0 ? "Done for today" : "Give up for today"); b6.onclick = () => { closeMenu(); endDay() }
        links.append(b3, b4, b5, b6); inner.append(links)
      })
    }
    let hintOn = tw().hint === "on"; try { if (localStorage.getItem("mg.hintring") === "1") hintOn = true } catch {}

    // world
    let world = null, loop = null
    let simTick = 0, lastNow = 0, paused = false
    let stuckSpot = -1, capStep = 0, tipUntil = 0
    const stickInput = (d, s) => {
      if (done || destroyed || !state.att) return
      if (world && world.inFinale) return
      audio()
      const a = state.att
      if (!a.started) { simTick = 0; if (s === 0) return }
      push({ t: Math.floor(simTick), d, s })
    }
    const stick = makeStick(host, {
      toWorld: (sx, sy) => (world ? world.toWorld(sx, sy) : [sx, sy]),
      onChange: stickInput,
      aimFrom: TOUCH ? null : () => (world ? world.momScreen() : [0, 0]),
    })
    const events = {
      kit: (n, b) => {
        sfx.kit(n); buzz(18); count.textContent = `${n}/${lv.babies.length}`
        const f = dots.children[n - 1]; if (f) { f.classList.add("on", "pop"); setTimeout(() => f.classList.remove("pop"), 300) }
        if (n === lv.babies.length) { sfx.allfound(); buzz([30, 40, 60]); counter.classList.add("done"); capStep = Math.max(capStep, 3); showCap() } else { capStep = Math.max(capStep, 2); showCap() }
      },
      rustle: (dx) => sfx.rustle(dx / 6),
      snore: (dx) => sfx.snore(dx / 6),
      step: (mud) => sfx.step(mud),
      chirp: (i) => sfx.chirp(i),
    }
    const CAPS = ["Drag anywhere to walk.", "A spot that rustles has a kit inside. Walk up to it.", "She's following you. Find the other one.", "All found. The den is lit: take them home.", ""]
    function showCap() {
      if (coach) {
        const text = CAPS[Math.min(capStep, CAPS.length - 1)]
        cap.hidden = !text; cap.textContent = text
      } else if (performance.now() > tipUntil) cap.hidden = true
    }
    // one-time tips for the wrinkles, the first time each is met (remembered on this device)
    function tip(key, text) {
      if (coach || tipSeen(key)) return
      tipMark(key)
      cap.hidden = false; cap.textContent = text; tipUntil = performance.now() + 4500
      setTimeout(() => { if (performance.now() >= tipUntil - 50) showCap() }, 4600)
    }

    function restart() {
      push({ r: 1 })
      simTick = 0; stuckSpot = -1
      count.textContent = `0/${lv.babies.length}`; counter.classList.remove("done")
      for (const d of dots.children) d.classList.remove("on")
      clk.textContent = "0.0"
      capStep = 0; showCap()
      stick.release()
      if (world) world.setGhost(state.bestPath)
    }
    function endDay() {
      if (done) return
      done = true
      push({ q: 1 })
      sfx.musicOff()
      finish(state, result(state))
    }
    function runEnd(h) {
      // a finished run: show it, offer another or the day's end
      const ticks = h.ticks
      const nextLine = nextStarLine({ solved: true, ticks, stars: h.stars, t3: lv.solve.t3, t2: lv.solve.t2 })
      const newBest = state.bestAt === state.attempts
      sfx.done(); buzz([40, 30, 40, 30, 120])
      if (window.tally) tally("run", { ticks, stars: h.stars, attempt: state.attempts, tier: state.tier })
      openMenu((c) => {
        c.classList.add("mg-run")
        const inner = el("div", "mg-inner"); c.append(inner)
        const mc = document.createElement("canvas"); mc.width = 400; mc.height = 400; inner.append(mc)
        drawMap(mc, lv, { route: newBest && state.bestPath ? state.bestPath : lastPath, optimal: lv.solve.route, stars: h.stars })
        const s = el("div", "mg-stars"); s.innerHTML = starHtml(h.stars, true); inner.append(s)
        inner.append(el("div", "mg-time", clock(ticks) + "s"))
        inner.append(el("div", "mg-best", state.attempts > 1 ? (newBest ? "New best" : `Best ${clock(state.best)}s`) : ""))
        inner.append(el("div", "mg-sub mg-next", nextLine))
        const lg = el("div", "mg-legend"); lg.innerHTML = `<span><i></i>yours</span><span><i class="opt"></i>fastest</span>`; inner.append(lg)
        const btns = el("div", "mg-btns"); inner.append(btns)
        if (coach) {
          const b = el("button", "btn", "Got it"); b.onclick = () => { closeMenu(); endDay() }; btns.append(b)
        } else {
          const row = el("div", "mg-row")
          const again = el("button", "btn", "Run it again"); again.onclick = () => { closeMenu(); restart() }
          const fin = el("button", "btn ghost", "Done for today"); fin.onclick = () => { closeMenu(); endDay() }
          row.append(again, fin); btns.append(row)
          btns.append(el("div", "mg-sub", `Run ${state.attempts}. Only your best time counts.`))
        }
      })
    }
    let lastPath = null

    // a hidden tab pauses the clock (simulating forty seconds in one frame is a death nobody saw); under the
    // automation pump the tab reports hidden while it is plainly being driven, so the pump never pauses
    const onVis = () => { if (PUMP) return; if (document.hidden) paused = true; else { paused = false; lastNow = 0 } }
    document.addEventListener("visibilitychange", onVis)
    onTweak(() => { if (world) world.setLook(look()); if (tw().music === "on" && !sfx.muted()) sfx.music(); else sfx.musicOff() })
    const unlock = () => { audio(); if (tw().music === "on" && !sfx.muted()) sfx.music() }
    host.addEventListener("pointerdown", unlock, { once: true })
    addEventListener("keydown", unlock, { once: true })

    makeWorld(host, lv, { lookOpts: look(), tod: todFor(number) }).then((w) => {
      if (destroyed) { w.destroy(); return }
      world = w
      w.setHintRing(hintOn)
      if (DEBUG) w.showDebug(true)
      w.onKitHome = (i) => { sfx.chirp(i) }
      restart()
      loop = makeLoop((now) => {
        if (destroyed) return
        const dt = paused || !lastNow ? 0 : Math.min(0.1, (now - lastNow) / 1000); lastNow = now
        stick.poll()
        const a = state.att
        if (a && !done && menu.hidden && !w.inFinale) {
          if (a.started) simTick += dt * HZ
          advance(state, Math.floor(simTick))
          if (!state.att) {
            // the attempt ended (she reached the den): the line files in, then the card
            const h = state.history[state.history.length - 1]
            lastPath = a.path
            // the finish happened inside advance(), which is not a move: write the finishing tick into the log as the
            // stick in force at that tick, so a replay (the server's, the result screen's) reaches the den too
            if (h && h.done) log.push({ t: a.doneAt, d: a.d, s: a.s })
            w.frame(now, { att: a, events })
            if (h && h.done) { clk.textContent = clock(h.ticks); w.finale(a, () => runEnd(h)) }
            return
          }
          clk.textContent = clock(a.tick)
          // stuck assist: nothing found for a while (shorter on the small maps), the nearest uncollected baby rustles from anywhere
          if (a.started && a.tick - a.lastFind > lv.stuck * HZ && a.got.length < lv.babies.length) {
            let bi = -1, bd = Infinity
            lv.babies.forEach((si, b) => { if (a.got.indexOf(si) >= 0) return; const p = babyAt(lv, b, a.tick); const dx = p.x - a.x, dz = p.z - a.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = p.moving ? -1 : (p.at === 1 ? lv.wanderers.find((x) => x.baby === b).to : si) } })
            stuckSpot = bi
          } else stuckSpot = -1
          // what she has seen: every spot inside the hint radius, and whether a kit was sitting in it
          for (let i = 0; i < lv.spots.length; i++) {
            const sp = lv.spots[i]; const dx = sp.x + 0.5 - a.x, dz = sp.z + 0.5 - a.z
            if (dx * dx + dz * dz > lv.hint * lv.hint) continue
            let kit = false
            lv.babies.forEach((si, b) => { if (a.got.indexOf(si) >= 0) return; const p = babyAt(lv, b, a.tick); if (!p.moving && Math.floor(p.x) === sp.x && Math.floor(p.z) === sp.z) kit = true })
            if (kit || !seen.has(i)) seen.set(i, kit)
          }
          // the first time she meets a wrinkle
          if (!coach) {
            const here = cellAt(lv, Math.floor(a.x), Math.floor(a.z))
            if (here === C.MUD) tip("mud", "Mud. She's slow in it.")
            lv.babies.forEach((si, b) => {
              if (a.got.indexOf(si) >= 0) return
              const p = babyAt(lv, b, a.tick); const dx = p.x - a.x, dz = p.z - a.z, d2 = dx * dx + dz * dz
              if (p.moving && d2 < 14 * 14) tip("wander", "That kit's on the run. Catch it, or wait where it stops.")
              if (isSleeper(lv, b) && d2 <= lv.hint * lv.hint) tip("sleep", "That one's asleep. Stay beside it to wake it.")
            })
          }
          // the counter over the den when she arrives early
          const ex = lv.exit[0] + 0.5 - a.x, ez = lv.exit[1] + 0.5 - a.z
          if (a.got.length < lv.babies.length && ex * ex + ez * ez < 9) {
            tag.hidden = false; tag.textContent = `${a.got.length}/${lv.babies.length}`
          } else tag.hidden = true
          if (coach && capStep === 0 && a.started) { capStep = 1; showCap() }
          if (miniOn && now - miniAt > 100) { miniAt = now; drawMini(mini, lv, { seen, att: a, hintSpot: stuckSpot, cache: miniCache, got: a.got }) }
          if (dbg) dbg.textContent = `tick ${a.tick}  ${a.x.toFixed(2)},${a.z.toFixed(2)}  d${a.d} s${a.s}\noptimal ${clock(lv.solve.ticks)}s  3★ ≤ ${clock(lv.solve.t3)}s  2★ ≤ ${clock(lv.solve.t2)}s\nlog ${log.length}  tier ${state.tier}  sleep ${JSON.stringify(lv.sleepers)} wander ${lv.wanderers.length}`
        }
        // draw her between the last tick and this one, by how far into the next tick the clock is
        let pos = null, tickF = 0
        if (state.att && state.att.started) { const a = state.att; tickF = Math.min(1, Math.max(0, simTick - Math.floor(simTick))); pos = { x: a.px + (a.x - a.px) * tickF, z: a.pz + (a.z - a.pz) * tickF } }
        w.frame(now, { att: state.att, pos, tickF, hintSpot: stuckSpot, events })
        if (!tag.hidden && state.att) placeTag(w, lv, tag, host)
      })
      showCap()
    }).catch((e) => { console.error(e); cap.hidden = false; cap.textContent = "The forest could not load. Reload to try again." })

    return {
      get log() { return log },
      destroy() {
        destroyed = true
        if (loop) loop.stop()
        document.removeEventListener("visibilitychange", onVis)
        stick.destroy(); sfx.musicOff()
        if (world) world.destroy()
        root.replaceChildren()
      },
    }
  },
}

// project the den to the screen for the "3/5" tag
import { THREE } from "./world.mjs"
function placeTag(w, lv, tag, host) {
  const v = new THREE.Vector3(lv.exit[0] + 0.5, 1.6, lv.exit[1] + 0.5)
  v.project(w.camera)
  const r = host.getBoundingClientRect()
  tag.style.left = ((v.x + 1) / 2 * r.width) + "px"
  tag.style.top = ((1 - v.y) / 2 * r.height) + "px"
}
function starHtml(n, pop = false) { return [1, 2, 3].map((i) => `<span class="${i <= n ? (pop ? "pop" : "") : "off"}"${pop && i <= n ? ` style="animation-delay:${(i - 1) * 0.18}s"` : ""}>★</span>`).join("") }
function nextStarLine(r) {
  if (!r.solved) return "Find every kit and reach the den."
  if (r.stars === 3) return "That's the fastest kind of run."
  const need = r.stars === 2 ? r.t3 : r.t2
  return `${r.stars === 2 ? "Three" : "Two"} stars at ${clock(need)}s`
}
