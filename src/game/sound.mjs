// Sound. Every cue goes through `sfx`; audio() is called on the first touch. Real samples from
// packs we own (credits in relay.config.mjs), decoded lazily from /audio. Until a sample has
// decoded a cue is silent rather than a synth stand-in: a squeak that changes voice mid-level
// is worse than a late one.
//
// Mix: master -> sfx bus (0 dB), music bus and (new set only) a forest bed. The finish jingle ducks the music.
//
// TWO SETS. "v1" is the shipped sound. "v2" is the "New sound" switch in ?tweaks (off by default):
//   - steps on dry grass and foliage rustles from Sonniss (PMSFX, RYK-Sounds, BluezoneCorp, Soundrangers),
//     the rustle 15 dB or so louder against the music than v1's, because the rustle is the clue
//   - a 36 s forest-birds bed (West Wolf) under everything, and a 101 s tune (Abstraction) in place of the 10 s loop
//   - an all-found pluck (Cinematic Sound Design) and a longer finish phrase (Chris Logsdon)
//   - rustles closer together than 120 ms count as one, and a hidden tab is silent
//   - the kits keep their v1 squeak: nothing in the library is a small animal's voice (checked 2026-11-26)
// Every v2 file was picked by name and measurement, not by ear. Listen before making it the default.

const MUTE_KEY = "mg.muted"
const db = (d) => Math.pow(10, d / 20)

const KIT = ["kit-1.mp3", "kit-2.mp3", "kit-3.mp3", "kit-4.mp3", "kit-5.mp3"]
const SETS = {
  v1: {
    files: {
      kit: KIT,
      rustle: ["rustle-1.mp3", "rustle-2.mp3"],
      step: ["step-1.mp3", "step-2.mp3", "step-3.mp3", "step-4.mp3", "step-5.mp3"],
      allfound: ["allfound.mp3"],
      done: ["done.mp3"],
    },
    gain: { kit: 0.9, rustle: 0.5, step: 0.22, allfound: 0.8, done: 0.9 },
    music: ["music.ogg", "music.mp3"], musicDb: -20,
    bed: null, bedDb: 0,
    duck: 1.6, rustleGap: 0, hush: false,
  },
  v2: {
    files: {
      kit: KIT,
      rustle: ["v2/rustle-1.mp3", "v2/rustle-2.mp3", "v2/rustle-3.mp3"],
      step: ["v2/step-1.mp3", "v2/step-2.mp3", "v2/step-3.mp3", "v2/step-4.mp3", "v2/step-5.mp3"],
      allfound: ["v2/allfound.mp3"],
      done: ["v2/done.mp3"],
    },
    // steps are the most repeated sound and sit lowest; the rustle and the kit are what she listens for
    gain: { kit: 0.9, rustle: 0.8, step: 0.4, allfound: 0.7, done: 0.8 },
    music: ["v2/music.mp3"], musicDb: -16,       // the file is -19 LUFS
    bed: ["v2/forest.mp3"], bedDb: -8,           // the file is -25.5 LUFS
    duck: 2.8, rustleGap: 0.12, hush: true,
  },
}

let ac = null, master = null, sfxBus = null, musicBus = null, bedBus = null
let setName = "v1"
const cache = {}                 // file -> Promise<AudioBuffer|null>, decoded once whichever set asks
const bufs = { v1: {}, v2: {} }  // set -> cue -> [AudioBuffer]
const loops = { v1: {}, v2: {} } // set -> { music, bed } buffers
const loaded = {}
const last = {}
let musicSrc = null, bedSrc = null, musicWanted = false, bedWanted = false
let lastRustle = -1
let isMuted = false
try { isMuted = localStorage.getItem(MUTE_KEY) === "1" } catch {}
// Silence has reasons, and each producer owns one: the player's mute, and (new set) a hidden page.
// The master gain is derived from all of them, so clearing one never un-mutes another.
const hidden = () => typeof document !== "undefined" && document.hidden
function level() { if (master) master.gain.value = isMuted || (SETS[setName].hush && hidden()) ? 0 : 1 }
if (typeof document !== "undefined") document.addEventListener("visibilitychange", level)

function build() {
  try { ac = new (window.AudioContext || window.webkitAudioContext)() } catch { ac = null; return }
  master = ac.createGain()
  sfxBus = ac.createGain(); musicBus = ac.createGain(); bedBus = ac.createGain()
  sfxBus.connect(master); musicBus.connect(master); bedBus.connect(master); master.connect(ac.destination)
  mix(); level()
}
function mix() {
  if (!ac) return
  const S = SETS[setName]
  musicBus.gain.cancelScheduledValues(ac.currentTime)
  musicBus.gain.value = db(S.musicDb); bedBus.gain.value = db(S.bedDb)
}
function decode(file) {
  return (cache[file] ||= (async () => {
    const r = await fetch(`/audio/${file}`)
    if (!r.ok) throw new Error(file)
    const data = await r.arrayBuffer()
    return await new Promise((res, rej) => { const p = ac.decodeAudioData(data, res, rej); if (p && p.then) p.then(res, rej) })
  })().catch(() => null))
}
async function firstOf(files) { for (const f of files || []) { const b = await decode(f); if (b) return b } return null }
function loadAll() {
  if (!ac || loaded[setName]) return
  const name = setName, S = SETS[name]
  loaded[name] = true
  for (const [cue, files] of Object.entries(S.files)) files.forEach((f, i) => decode(f).then((b) => { if (b) (bufs[name][cue] ||= [])[i] = b }))
  firstOf(S.music).then((b) => { loops[name].music = b; if (b && musicWanted && setName === name) startMusic() })
  firstOf(S.bed).then((b) => { loops[name].bed = b; if (b && bedWanted && setName === name) startBed() })
}
function loop(buf, bus) { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(bus); s.start(); return s }
function stop(src) { if (src) { try { src.stop() } catch {} } return null }
function startMusic() { const b = loops[setName].music; if (ac && b && !musicSrc) musicSrc = loop(b, musicBus) }
function startBed() { const b = loops[setName].bed; if (ac && b && !bedSrc) bedSrc = loop(b, bedBus) }

// Unlock on a user gesture. Safe to call every tap.
export function audio() {
  if (!ac) build()
  if (ac && ac.state === "suspended") ac.resume().catch(() => {})
  loadAll()
  return ac
}

function play(cue, { rate = 1, gain = 1, pan = 0 } = {}) {
  if (!ac || isMuted) return
  const S = SETS[setName]
  const list = (bufs[setName][cue] || []).filter(Boolean)
  if (!list.length) return
  let i = Math.floor(Math.random() * list.length)
  if (list.length > 1 && i === last[cue]) i = (i + 1) % list.length
  last[cue] = i
  const src = ac.createBufferSource(); src.buffer = list[i]; src.playbackRate.value = rate
  const g = ac.createGain(); g.gain.value = (S.gain[cue] || 1) * gain
  src.connect(g)
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(sfxBus) } else g.connect(sfxBus)
  src.start()
}
// two hiding places that rustle in the same breath are one sound, not a doubled one
function rustleOk() {
  const gap = SETS[setName].rustleGap
  if (!ac || !gap) return true
  if (ac.currentTime - lastRustle < gap) return false
  lastRustle = ac.currentTime; return true
}

export const sfx = {
  kit: (n) => play("kit", { rate: 1.15 + (n % 5) * 0.07 + Math.random() * 0.08 }),
  // one of the line, quietly, from somewhere behind her
  chirp: (n) => play("kit", { rate: 1.1 + (n % 5) * 0.07 + Math.random() * 0.1, gain: 0.3, pan: (Math.random() - 0.5) * 0.8 }),
  rustle: (pan) => { if (rustleOk()) play("rustle", { rate: 0.9 + Math.random() * 0.25, pan }) },
  // a sleeper: the rustle sample slowed right down reads as a snore
  snore: (pan) => { if (rustleOk()) play("rustle", { rate: 0.45 + Math.random() * 0.1, gain: 0.7, pan }) },
  step: (mud) => play("step", { rate: mud ? 0.6 + Math.random() * 0.1 : 0.95 + Math.random() * 0.1, gain: mud ? 1.6 : 1 }),
  allfound: () => play("allfound"),
  done: () => { play("done"); duck(SETS[setName].duck) },
  music: () => { musicWanted = true; startMusic() },
  musicOff: () => { musicWanted = false; musicSrc = stop(musicSrc) },
  // the forest bed under a run (the new set has one; the shipped set has none and this does nothing)
  bed: () => { bedWanted = true; startBed() },
  bedOff: () => { bedWanted = false; bedSrc = stop(bedSrc) },
  muted: () => isMuted,
  setMuted: (m) => { isMuted = !!m; try { localStorage.setItem(MUTE_KEY, isMuted ? "1" : "0") } catch {}; level() },
  // "v1" the shipped sound, "v2" the new one. Loops that are playing carry over to the new set's files.
  set: () => setName,
  setSet: (name) => {
    if (!SETS[name] || name === setName) return
    musicSrc = stop(musicSrc); bedSrc = stop(bedSrc)
    setName = name
    if (!ac) return
    mix(); level(); loadAll()
    if (musicWanted) startMusic()
    if (bedWanted) startBed()
  },
}
function duck(seconds) {
  if (!ac || !musicBus) return
  const t = ac.currentTime, base = SETS[setName].musicDb
  musicBus.gain.cancelScheduledValues(t)
  musicBus.gain.setValueAtTime(db(base - 8), t)
  musicBus.gain.linearRampToValueAtTime(db(base), t + seconds)
}
