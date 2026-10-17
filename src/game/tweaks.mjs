// Options while we build: a small panel of toggles for the look-and-feel choices, so Mack can flip
// between versions on the real game. Opened with ?tweaks (remembered on this device; ?tweaks=0
// hides it). Choices live in localStorage and the view reads them live.
const KEY = "mg:tweaks", SHOW = "mg:tweaks:show"
export const OPTIONS = {
  cam: { label: "Camera", values: [["iso", "Iso 35°"], ["high", "Higher 45°"]] },
  zoom: { label: "Zoom", values: [["close", "Close"], ["normal", "Normal"], ["wide", "Wide"]] },
  hint: { label: "Hint ring", values: [["off", "Off"], ["on", "On"]] },
  music: { label: "Music", values: [["on", "On"], ["off", "Off"]] },
  tod: { label: "Time of day", values: [["auto", "By weekday"], ["day", "Always day"], ["night", "Always night"]] },
  prints: { label: "Pawprints", values: [["on", "On"], ["off", "Off"]] },
  ghost: { label: "Ghost of best run", values: [["on", "On"], ["off", "Off"]] },
  antics: { label: "Kit antics", values: [["on", "On"], ["off", "Off"]] },
}
const DEFAULTS = { cam: "iso", zoom: "normal", hint: "off", music: "on", tod: "auto", prints: "on", ghost: "on", antics: "on" }
let cur = { ...DEFAULTS }
try { cur = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") } } catch {}
export const tw = () => cur
const subs = []
export const onTweak = (fn) => subs.push(fn)

export function mountTweaks() {
  if (typeof document === "undefined" || document.getElementById("mg-tweaks")) return
  const q = new URLSearchParams(location.search).get("tweaks")
  try {
    if (q === "0") localStorage.removeItem(SHOW)
    else if (q != null) localStorage.setItem(SHOW, "1")
    if (!localStorage.getItem(SHOW)) return
  } catch { if (q == null || q === "0") return }
  const st = document.createElement("style")
  st.textContent = `
#mg-tweaks { position:fixed; left:12px; bottom:calc(12px + env(safe-area-inset-bottom)); z-index:80; font:12px 'Space Grotesk', sans-serif; color:#fbfff5;
  background:rgba(4,20,10,.92); border-radius:14px; padding:10px 12px; box-shadow:0 0 0 1.5px rgba(255,255,255,.3); display:flex; flex-direction:column; gap:8px; max-width:calc(100vw - 24px); }
#mg-tweaks.min > :not(header) { display:none; }
#mg-tweaks header { display:flex; justify-content:space-between; gap:12px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; font-size:11px; cursor:pointer; }
#mg-tweaks .row { display:flex; flex-direction:column; gap:4px; }
#mg-tweaks .lab { font-size:10px; letter-spacing:.16em; text-transform:uppercase; opacity:.7; }
#mg-tweaks .seg { display:flex; flex-wrap:wrap; gap:4px; }
#mg-tweaks button { font:inherit; font-size:12px; font-weight:600; color:#fbfff5; background:rgba(255,255,255,.08); border:0; border-radius:8px; padding:6px 9px; cursor:pointer; }
#mg-tweaks button.on { background:#ff8a3d; color:#2b1200; }`
  document.head.append(st)
  const box = document.createElement("div"); box.id = "mg-tweaks"; box.className = "min"
  const head = document.createElement("header"); head.innerHTML = "<span>Options</span><span>+</span>"
  head.onclick = () => { box.classList.toggle("min"); head.lastChild.textContent = box.classList.contains("min") ? "+" : "–" }
  box.append(head)
  for (const [k, o] of Object.entries(OPTIONS)) {
    const row = document.createElement("div"); row.className = "row"
    const lab = document.createElement("div"); lab.className = "lab"; lab.textContent = o.label
    const seg = document.createElement("div"); seg.className = "seg"
    for (const [v, name] of o.values) {
      const b = document.createElement("button"); b.textContent = name; b.classList.toggle("on", cur[k] === v)
      b.onclick = (e) => { e.stopPropagation(); cur = { ...cur, [k]: v }; try { localStorage.setItem(KEY, JSON.stringify(cur)) } catch {}; seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); subs.forEach((f) => f(cur)); window.tally && tally("tweak", { [k]: v }) }
      seg.append(b)
    }
    row.append(lab, seg); box.append(row)
  }
  document.body.append(box)
}
