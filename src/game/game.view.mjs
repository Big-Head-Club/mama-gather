// Mama Gather — view. The 3D forest, one thumbstick, a counter and a clock. The sim is driven
// from here at 30 Hz; every stick change goes in the log with its tick; the server replays it.

import { create, apply, advance, result, stars, HZ } from "./game.rules.mjs"
import { generate } from "./gen.mjs"
import { STUCK_TICKS } from "./sim.mjs"
import { makeWorld } from "./world.mjs"
import { makeStick, STICK_CSS } from "./stick.mjs"
import { audio, sfx } from "./sound.mjs"
import { drawMap } from "./map2d.mjs"
import { tw, onTweak, mountTweaks } from "./tweaks.mjs"
import { SPECIES } from "./kit.mjs"

const REDUCED = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
const TOUCH = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches
const DEBUG = typeof location !== "undefined" && /[?&]debug/.test(location.search)

const clock = (ticks) => { const s = Math.max(0, ticks) / HZ; const m = Math.floor(s / 60), r = s - m * 60; return m ? `${m}:${r.toFixed(1).padStart(4, "0")}` : `${r.toFixed(1)}` }
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n }
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms) } catch {} }
const look = () => ({ viewH: tw().zoom === "close" ? 12.5 : tw().zoom === "wide" ? 18 : 15, camLift: tw().cam === "high" ? 1.45 : 1 })

const CSS = `
.mg { position:absolute; inset:0; overflow:hidden; touch-action:none; user-select:none; -webkit-user-select:none; background:var(--ground); }
.mg-canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.mg-hud { position:absolute; left:0; right:0; top:0; padding:max(10px, env(safe-area-inset-top)) 12px 0; display:flex; justify-content:space-between; align-items:flex-start; pointer-events:none; z-index:6; }
.mg-hud > * { pointer-events:auto; }
.mg-pill { display:flex; align-items:center; gap:8px; background:rgba(0,0,0,.42); border-radius:999px; padding:8px 14px; font-family:var(--display); font-weight:700; letter-spacing:.06em; color:#fff; font-size:20px; box-shadow:0 3px 0 rgba(0,0,0,.25); }
.mg-pill small { font-size:11px; letter-spacing:.2em; opacity:.75; font-weight:500; }
.mg-pill.done { background:#ffd23f; color:#2b1200; }
.mg-dots { display:flex; gap:4px; }
.mg-dots i { width:9px; height:9px; border-radius:50%; background:rgba(255,255,255,.28); display:block; }
.mg-dots i.on { background:#ffb15e; box-shadow:0 0 6px #ffb15e; }
.mg-clock { font-variant-numeric:tabular-nums; min-width:5.2ch; text-align:right; }
.mg-menu-btn { width:44px; height:44px; border-radius:50%; border:0; background:rgba(0,0,0,.42); color:#fff; font-size:22px; line-height:1; box-shadow:0 3px 0 rgba(0,0,0,.25); }
.mg-right { display:flex; gap:8px; align-items:center; }
.mg-cap { position:absolute; left:50%; transform:translateX(-50%); top:calc(max(10px, env(safe-area-inset-top)) + 62px); background:rgba(0,0,0,.55); color:#fff; padding:10px 16px; border-radius:14px; font-family:var(--display); font-weight:600; font-size:17px; max-width:min(92vw, 420px); text-align:center; z-index:6; pointer-events:none; transition:opacity .3s; }
.mg-cap[hidden] { display:none; }
.mg-keys { position:absolute; left:50%; transform:translateX(-50%); bottom:calc(14px + env(safe-area-inset-bottom)); display:flex; gap:10px; align-items:center; color:rgba(255,255,255,.8); font-size:12px; letter-spacing:.18em; text-transform:uppercase; z-index:6; pointer-events:none; }
.mg-keys kbd { font:700 12px var(--display); background:rgba(255,255,255,.14); border:1.5px solid rgba(255,255,255,.4); border-radius:6px; padding:3px 7px; color:#fff; letter-spacing:.05em; }
.mg-tag { position:absolute; transform:translate(-50%, -100%); background:rgba(0,0,0,.6); color:#fff; padding:5px 10px; border-radius:10px; font:700 15px var(--display); z-index:5; pointer-events:none; white-space:nowrap; }
.mg-tag[hidden] { display:none; }
.mg-menu { position:absolute; inset:0; z-index:9; background:rgba(5,25,12,.72); display:flex; align-items:center; justify-content:center; padding:16px; }
.mg-menu[hidden] { display:none; }
.mg-card { width:min(92vw, 420px); max-height:calc(100% - 24px); overflow:auto; background:#0e4a26; border-radius:22px; padding:22px 20px; display:flex; flex-direction:column; gap:12px; box-shadow:0 14px 0 rgba(0,0,0,.35), 0 0 0 3px rgba(255,255,255,.12); color:#fbfff5; text-align:center; }
.mg-card h2 { margin:0; font:700 30px/1.05 var(--display); letter-spacing:.02em; }
.mg-card .mg-stars { font-size:44px; letter-spacing:.1em; line-height:1; color:#ffd23f; }
.mg-card .mg-stars .off { color:rgba(255,255,255,.22); }
.mg-card .mg-time { font:700 54px/1 var(--display); font-variant-numeric:tabular-nums; }
.mg-card .mg-sub { opacity:.8; font-size:15px; }
.mg-card .btn { width:100%; min-width:0; }
.mg-card .btn.ghost { font-size:15px; }
.mg-card canvas { width:100%; border-radius:14px; display:block; }
.mg-res { display:flex; flex-direction:column; gap:10px; align-items:center; width:100%; }
.mg-res canvas { width:min(100%, 380px); border-radius:16px; box-shadow:0 0 0 3px rgba(255,255,255,.14); }
.mg-res .mg-stars { font-size:46px; color:#ffd23f; letter-spacing:.08em; line-height:1; }
.mg-res .mg-stars .off { color:rgba(255,255,255,.22); }
.mg-res .mg-time { font:700 60px/1 var(--display); font-variant-numeric:tabular-nums; }
.mg-res .mg-sub { opacity:.85; font-size:16px; }
.mg-row { display:flex; gap:8px; }
.mg-row .btn { flex:1; min-width:0; padding-inline:12px; }
.mg-dbg { position:absolute; left:12px; bottom:calc(12px + env(safe-area-inset-bottom)); background:rgba(0,0,0,.6); color:#fff; font:12px/1.4 var(--mono); padding:8px 10px; border-radius:8px; z-index:7; white-space:pre; }
${STICK_CSS}
`

function css() {
  if (document.getElementById("mg-css")) return
  const st = document.createElement("style"); st.id = "mg-css"; st.textContent = CSS; document.head.append(st)
}

export default {
  glyphs: { three: "\u{1F7E8}", two: "\u{1F7E7}", one: "\u{1F7E9}", quit: "⬛" },
  how: [
    "You are a fox mother. Drag anywhere to walk. A log, fern, stump or burrow that rustles has one of your kits inside: walk up and it falls in line behind you.",
    "Find every kit, then take the line home to the den. Nothing can go wrong; the clock is the only pressure. Three stars for a fast run, and you can run the same forest again for a better time.",
    "The strip shows how each run ended, never where the kits were. One forest a day, the same for everyone.",
  ],

  // The front screen: a forest, her, and a line of kits trotting behind her.
  splash(stage, { seed }) {
    css()
    const host = el("div", "mg"); host.dataset.bleed = ""
    host.style.cssText = "pointer-events:none"
    stage.prepend(host)
    let dead = false, raf = 0, world = null
    const lv = generate((seed ^ 0x77) >>> 0, "tiny")
    const pts = lv.solve.route.concat(lv.solve.route.slice().reverse())
    makeWorld(host, lv, { splash: true, lookOpts: Object.assign(look(), { viewH: 11 }) }).then((w) => {
      if (dead) { w.destroy(); return }
      world = w
      const loop = (now) => { if (dead) return; w.splashStep(now, pts); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }).catch(() => {})
    const veil = el("div"); veil.style.cssText = "position:absolute;inset:0;background:linear-gradient(180deg, rgba(5,30,14,.15), rgba(5,30,14,.55) 70%);pointer-events:none"
    host.append(veil)
    return { destroy() { dead = true; cancelAnimationFrame(raf); if (world) world.destroy(); host.remove() } }
  },

  // The payoff: the map from above with the route she walked drawn in over two seconds.
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
    root.append(wrap)
    const route = res.route || (st.att && st.att.path) || null
    const t0 = performance.now()
    const draw = () => {
      const p = REDUCED ? 1 : Math.min(1, (performance.now() - t0) / 2200)
      drawMap(c, lv, { route, progress: p, stars: res.stars })
      if (p < 1) requestAnimationFrame(draw)
    }
    draw()
  },

  mount(root, { seed, mode, number, coach, finish }) {
    css(); mountTweaks()
    const state = create(seed, { number })
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
    for (let i = 0; i < lv.babies.length; i++) dots.append(el("i"))
    counter.append(el("small", "", species.babies.toUpperCase()), count, dots)
    const right = el("div", "mg-right")
    const clk = el("div", "mg-pill mg-clock", "0.0")
    const menuBtn = el("button", "mg-menu-btn", "≡"); menuBtn.setAttribute("aria-label", "Menu")
    right.append(clk, menuBtn)
    hud.append(counter, right)
    host.append(hud)
    const cap = el("div", "mg-cap"); cap.hidden = true; host.append(cap)
    const tag = el("div", "mg-tag"); tag.hidden = true; host.append(tag)
    if (!TOUCH) { const k = el("div", "mg-keys"); k.innerHTML = "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>or arrows to walk</span>"; host.append(k) }
    const dbg = DEBUG ? el("div", "mg-dbg") : null; if (dbg) host.append(dbg)

    // menu / end panel
    const menu = el("div", "mg-menu"); menu.hidden = true; host.append(menu)
    const card = el("div", "mg-card"); menu.append(card)
    const openMenu = (fill) => { card.replaceChildren(); fill(card); menu.hidden = false; stick.release() }
    const closeMenu = () => { menu.hidden = true }
    menu.addEventListener("pointerdown", (e) => e.stopPropagation())
    menuBtn.onclick = () => {
      audio()
      openMenu((c) => {
        c.append(el("h2", "", "Paused"))
        const b1 = el("button", "btn", "Keep going"); b1.onclick = closeMenu
        const b2 = el("button", "btn ghost", "Start this run over"); b2.onclick = () => { closeMenu(); restart() }
        const b3 = el("button", "btn ghost", sfx.muted() ? "Sound: off" : "Sound: on"); b3.onclick = () => { sfx.setMuted(!sfx.muted()); b3.textContent = sfx.muted() ? "Sound: off" : "Sound: on"; if (sfx.muted()) sfx.musicOff(); else if (tw().music === "on") sfx.music() }
        const b4 = el("button", "btn ghost", `Hint ring: ${hintOn ? "on" : "off"}`); b4.onclick = () => { hintOn = !hintOn; world && world.setHintRing(hintOn); b4.textContent = `Hint ring: ${hintOn ? "on" : "off"}`; try { localStorage.setItem("mg.hintring", hintOn ? "1" : "0") } catch {} }
        const b5 = el("button", "btn ghost", state.best >= 0 ? "Done for today" : "Give up for today"); b5.onclick = () => { closeMenu(); endDay() }
        c.append(b1, b2, b3, b4, b5)
      })
    }
    let hintOn = tw().hint === "on"; try { if (localStorage.getItem("mg.hintring") === "1") hintOn = true } catch {}

    // world
    let world = null, raf = 0
    let simTick = 0, lastNow = 0, paused = false
    let stuckSpot = -1, capStep = 0
    const stick = makeStick(host, {
      toWorld: (sx, sy) => (world ? world.toWorld(sx, sy) : [sx, sy]),
      onChange: (d, s) => {
        if (done || destroyed || !state.att) return
        audio()
        const a = state.att
        if (!a.started) { simTick = 0; if (s === 0) return }
        push({ t: Math.floor(simTick), d, s })
      },
    })
    const events = {
      kit: (n) => { sfx.kit(n); buzz(18); count.textContent = `${n}/${lv.babies.length}`; dots.children[n - 1]?.classList.add("on"); if (n === lv.babies.length) { sfx.allfound(); buzz([30, 40, 60]); counter.classList.add("done"); capStep = Math.max(capStep, 3); showCap() } else { capStep = Math.max(capStep, 2); showCap() } },
      rustle: (dx) => sfx.rustle(dx / 6),
      step: () => sfx.step(),
    }
    const CAPS = ["Drag anywhere to walk.", "A spot that rustles has a kit inside. Walk up to it.", "She's following you. Find the other one.", "All found. The den is lit: take them home.", ""]
    function showCap() {
      if (!coach) return
      const text = CAPS[Math.min(capStep, CAPS.length - 1)]
      cap.hidden = !text; cap.textContent = text
    }

    function restart() {
      push({ r: 1 })
      simTick = 0; stuckSpot = -1
      count.textContent = `0/${lv.babies.length}`; counter.classList.remove("done")
      for (const d of dots.children) d.classList.remove("on")
      clk.textContent = "0.0"
      capStep = 0; showCap()
      stick.release()
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
      sfx.done(); buzz([40, 30, 40, 30, 120])
      if (window.tally) tally("run", { ticks, stars: h.stars, attempt: state.attempts, tier: state.tier })
      openMenu((c) => {
        const s = el("div", "mg-stars"); s.innerHTML = starHtml(h.stars); c.append(s)
        c.append(el("div", "mg-time", clock(ticks) + "s"))
        c.append(el("div", "mg-sub", nextLine))
        const mc = document.createElement("canvas"); mc.width = 400; mc.height = 400; c.append(mc)
        drawMap(mc, lv, { route: state.history[state.history.length - 1] && state.bestPath && state.bestAt === state.attempts ? state.bestPath : lastPath, stars: h.stars })
        if (coach) {
          const b = el("button", "btn", "Got it"); b.onclick = () => { closeMenu(); endDay() }; c.append(b)
        } else {
          const row = el("div", "mg-row")
          const again = el("button", "btn", "Run it again"); again.onclick = () => { closeMenu(); restart() }
          const fin = el("button", "btn ghost", "Done for today"); fin.onclick = () => { closeMenu(); endDay() }
          row.append(again, fin); c.append(row)
          c.append(el("div", "mg-sub", `Run ${state.attempts}${state.best >= 0 ? ` · best ${clock(state.best)}s` : ""}. Your best time is what counts.`))
        }
      })
    }
    let lastPath = null

    const onVis = () => { if (document.hidden) paused = true; else { paused = false; lastNow = 0 } }
    document.addEventListener("visibilitychange", onVis)
    onTweak(() => { if (world) world.setLook(look()); if (tw().music === "on" && !sfx.muted()) sfx.music(); else sfx.musicOff() })
    const unlock = () => { audio(); if (tw().music === "on" && !sfx.muted()) sfx.music() }
    host.addEventListener("pointerdown", unlock, { once: true })
    addEventListener("keydown", unlock, { once: true })

    makeWorld(host, lv, { lookOpts: look() }).then((w) => {
      if (destroyed) { w.destroy(); return }
      world = w
      w.setHintRing(hintOn)
      if (DEBUG) w.showDebug(true)
      restart()
      const loop = (now) => {
        if (destroyed) return
        raf = requestAnimationFrame(loop)
        const dt = paused || !lastNow ? 0 : Math.min(0.1, (now - lastNow) / 1000); lastNow = now
        stick.poll()
        const a = state.att
        if (a && !done && menu.hidden) {
          if (a.started) simTick += dt * HZ
          advance(state, Math.floor(simTick))
          if (!state.att) {
            // the attempt ended (she reached the den)
            const h = state.history[state.history.length - 1]
            lastPath = a.path
            w.frame(now, { att: a, events })
            if (h && h.done) runEnd(h)
            return
          }
          clk.textContent = clock(a.tick)
          // stuck assist: nothing found for 30 s, the nearest uncollected spot rustles from anywhere
          if (a.started && a.tick - a.lastFind > STUCK_TICKS && a.got.length < lv.babies.length) {
            let bi = -1, bd = Infinity
            for (const si of lv.babies) { if (a.got.indexOf(si) >= 0) continue; const sp = lv.spots[si]; const dx = sp.x + 0.5 - a.x, dz = sp.z + 0.5 - a.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = si } }
            stuckSpot = bi
          } else stuckSpot = -1
          // the counter over the den when she arrives early
          const ex = lv.exit[0] + 0.5 - a.x, ez = lv.exit[1] + 0.5 - a.z
          if (a.got.length < lv.babies.length && ex * ex + ez * ez < 9) {
            tag.hidden = false; tag.textContent = `${a.got.length}/${lv.babies.length}`
          } else tag.hidden = true
          if (coach && capStep === 0 && a.started) { capStep = 1; showCap() }
          if (dbg) dbg.textContent = `tick ${a.tick}  ${a.x.toFixed(2)},${a.z.toFixed(2)}  d${a.d} s${a.s}\noptimal ${clock(lv.solve.ticks)}s  3★ ≤ ${clock(lv.solve.t3)}s  2★ ≤ ${clock(lv.solve.t2)}s\nlog ${log.length}  tier ${state.tier}`
        }
        w.frame(now, { att: state.att, hintSpot: stuckSpot, events })
        if (!tag.hidden && state.att) placeTag(w, lv, tag, host)
      }
      raf = requestAnimationFrame(loop)
      showCap()
    }).catch((e) => { console.error(e); cap.hidden = false; cap.textContent = "The forest could not load. Reload to try again." })

    return {
      get log() { return log },
      destroy() {
        destroyed = true
        cancelAnimationFrame(raf)
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
function starHtml(n) { return [1, 2, 3].map((i) => `<span class="${i <= n ? "" : "off"}">★</span>`).join("") }
function nextStarLine(r) {
  if (!r.solved) return "Find every kit and reach the den."
  if (r.stars === 3) return "That's the fastest kind of run."
  const need = r.stars === 2 ? r.t3 : r.t2
  return `${r.stars === 2 ? "Three" : "Two"} stars at ${clock(need)}s`
}
