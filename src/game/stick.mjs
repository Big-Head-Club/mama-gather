// Input. One floating thumbstick: touch anywhere, drag to move; direction and speed from the
// drag, capped. On a keyboard WASD/arrows, on a pad the left stick. All three produce the same
// thing: a heading (one of 32) and a speed step (0..4) in WORLD space, handed to onChange only
// when either changes, so the input log stays small.
//
// Screen-relative: up on the thumb is up on the screen. The world's axes sit at 45 degrees to the
// screen, so `toWorld` (from the camera) does the turn.

import { NDIRS } from "./sim.mjs"

export function makeStick(host, { toWorld, onChange, radius = 54, touchOnly = false }) {
  const base = document.createElement("div"); base.className = "mg-stick"; base.hidden = true
  const knob = document.createElement("div"); knob.className = "mg-knob"
  base.append(knob); host.append(base)
  let pid = null, ox = 0, oy = 0
  let last = { d: 8, s: 0 }
  const keys = new Set()
  let dead = false

  function emit(sx, sy) {
    // sx, sy: screen vector, -1..1, y down
    const mag = Math.min(1, Math.sqrt(sx * sx + sy * sy))
    let s = mag < 0.12 ? 0 : Math.min(4, Math.max(1, Math.ceil(mag * 4)))
    let d = last.d
    if (s > 0) {
      const [wx, wz] = toWorld(sx, sy)
      d = ((Math.round(Math.atan2(wz, wx) / (Math.PI * 2 / NDIRS)) % NDIRS) + NDIRS) % NDIRS
    }
    if (d !== last.d || s !== last.s) { last = { d, s }; onChange(d, s) }
  }

  const down = (e) => {
    if (dead || pid !== null) return
    if (touchOnly && e.pointerType === "mouse") return
    if (e.target.closest("button, a, .mg-hud, .mg-menu")) return
    pid = e.pointerId; ox = e.clientX; oy = e.clientY
    host.setPointerCapture?.(pid)
    const r = host.getBoundingClientRect()
    base.style.left = (ox - r.left) + "px"; base.style.top = (oy - r.top) + "px"
    base.hidden = false; knob.style.transform = "translate(-50%,-50%)"
    e.preventDefault()
  }
  const move = (e) => {
    if (e.pointerId !== pid) return
    let dx = e.clientX - ox, dy = e.clientY - oy
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > radius) { dx *= radius / len; dy *= radius / len }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
    emit(dx / radius, dy / radius)
    e.preventDefault()
  }
  const up = (e) => {
    if (e.pointerId !== pid) return
    pid = null; base.hidden = true
    if (!keys.size) emit(0, 0)
  }
  host.addEventListener("pointerdown", down)
  host.addEventListener("pointermove", move)
  host.addEventListener("pointerup", up)
  host.addEventListener("pointercancel", up)
  host.addEventListener("lostpointercapture", up)

  // keyboard: screen directions, diagonals allowed
  const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }
  const fromKeys = () => {
    let sx = 0, sy = 0
    for (const k of keys) { const v = KEYS[k]; sx += v[0]; sy += v[1] }
    const len = Math.sqrt(sx * sx + sy * sy) || 1
    emit(sx / len, sy / len)
  }
  const kd = (e) => { if (!KEYS[e.code] || e.repeat || dead) return; if (e.target.closest?.("input, textarea")) return; keys.add(e.code); fromKeys(); e.preventDefault() }
  const ku = (e) => { if (!KEYS[e.code]) return; keys.delete(e.code); if (pid === null) fromKeys() }
  const blur = () => { keys.clear(); if (pid === null) emit(0, 0) }
  addEventListener("keydown", kd); addEventListener("keyup", ku); addEventListener("blur", blur)

  // gamepad: polled by the view each frame
  let padActive = false
  function poll() {
    const p = window.pad
    if (!p || !p.connected || pid !== null || keys.size) { if (padActive) { padActive = false; emit(0, 0) } return }
    const st = p.stick("left")
    if (st.x || st.y) { padActive = true; emit(st.x, st.y) }
    else if (padActive) { padActive = false; emit(0, 0) }
  }

  return {
    poll,
    get active() { return pid !== null || keys.size > 0 || padActive },
    release() { keys.clear(); pid = null; base.hidden = true; emit(0, 0) },
    destroy() {
      dead = true
      host.removeEventListener("pointerdown", down); host.removeEventListener("pointermove", move)
      host.removeEventListener("pointerup", up); host.removeEventListener("pointercancel", up); host.removeEventListener("lostpointercapture", up)
      removeEventListener("keydown", kd); removeEventListener("keyup", ku); removeEventListener("blur", blur)
      base.remove()
    },
  }
}

export const STICK_CSS = `
.mg-stick { position:absolute; width:112px; height:112px; margin:-56px 0 0 -56px; border-radius:50%; background:rgba(255,255,255,.14); box-shadow:0 0 0 2px rgba(255,255,255,.35), 0 8px 24px rgba(0,0,0,.25); pointer-events:none; z-index:5; }
.mg-knob { position:absolute; left:50%; top:50%; width:52px; height:52px; border-radius:50%; background:var(--accent, #ff8a3d); box-shadow:0 4px 0 rgba(0,0,0,.3); transform:translate(-50%,-50%); }
`
