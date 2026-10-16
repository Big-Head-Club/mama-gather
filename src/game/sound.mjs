// Sound. Every cue goes through `sfx`; audio() is called on the first touch. Real samples from
// packs we own (credits in relay.config.mjs), decoded lazily from /audio. Until a sample has
// decoded a cue is silent rather than a synth stand-in: a squeak that changes voice mid-level
// is worse than a late one.
//
// Mix: master -> sfx bus (0 dB) and music bus (-20 dB). The finish jingle ducks the music.

const MUTE_KEY = "mg.muted"
const MUSIC_DB = -20

const FILES = {
  kit: ["kit-1.mp3", "kit-2.mp3", "kit-3.mp3", "kit-4.mp3", "kit-5.mp3"],
  rustle: ["rustle-1.mp3", "rustle-2.mp3"],
  step: ["step-1.mp3", "step-2.mp3", "step-3.mp3", "step-4.mp3", "step-5.mp3"],
  allfound: ["allfound.mp3"],
  done: ["done.mp3"],
}
const GAIN = { kit: 0.9, rustle: 0.5, step: 0.22, allfound: 0.8, done: 0.9 }
const MUSIC_FILES = ["music.ogg", "music.mp3"]
const db = (d) => Math.pow(10, d / 20)

let ac = null, master = null, sfxBus = null, musicBus = null, loading = false
const bufs = {}, last = {}
let musicBuf = null, musicSrc = null, musicWanted = false
let isMuted = false
try { isMuted = localStorage.getItem(MUTE_KEY) === "1" } catch {}

function build() {
  try { ac = new (window.AudioContext || window.webkitAudioContext)() } catch { ac = null; return }
  master = ac.createGain(); master.gain.value = isMuted ? 0 : 1
  sfxBus = ac.createGain(); musicBus = ac.createGain(); musicBus.gain.value = db(MUSIC_DB)
  sfxBus.connect(master); musicBus.connect(master); master.connect(ac.destination)
}
async function decode(file) {
  const r = await fetch(`/audio/${file}`)
  if (!r.ok) throw new Error(file)
  const data = await r.arrayBuffer()
  return await new Promise((res, rej) => { const p = ac.decodeAudioData(data, res, rej); if (p && p.then) p.then(res, rej) })
}
function loadAll() {
  if (loading || !ac) return
  loading = true
  for (const [cue, files] of Object.entries(FILES)) files.forEach((f, i) => decode(f).then((b) => { (bufs[cue] ||= [])[i] = b }).catch(() => {}))
  ;(async () => { for (const f of MUSIC_FILES) { try { musicBuf = await decode(f); break } catch {} } if (musicBuf && musicWanted) startMusic() })()
}
function startMusic() {
  if (!ac || !musicBuf || musicSrc) return
  musicSrc = ac.createBufferSource(); musicSrc.buffer = musicBuf; musicSrc.loop = true
  musicSrc.connect(musicBus); musicSrc.start()
}

// Unlock on a user gesture. Safe to call every tap.
export function audio() {
  if (!ac) build()
  if (ac && ac.state === "suspended") ac.resume().catch(() => {})
  loadAll()
  return ac
}

function play(cue, { rate = 1, gain = 1, pan = 0 } = {}) {
  if (!ac || isMuted) return
  const list = (bufs[cue] || []).filter(Boolean)
  if (!list.length) return
  let i = Math.floor(Math.random() * list.length)
  if (list.length > 1 && i === last[cue]) i = (i + 1) % list.length
  last[cue] = i
  const src = ac.createBufferSource(); src.buffer = list[i]; src.playbackRate.value = rate
  const g = ac.createGain(); g.gain.value = (GAIN[cue] || 1) * gain
  src.connect(g)
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(sfxBus) } else g.connect(sfxBus)
  src.start()
}

export const sfx = {
  kit: (n) => play("kit", { rate: 1.15 + (n % 5) * 0.07 + Math.random() * 0.08 }),
  // one of the line, quietly, from somewhere behind her
  chirp: (n) => play("kit", { rate: 1.1 + (n % 5) * 0.07 + Math.random() * 0.1, gain: 0.3, pan: (Math.random() - 0.5) * 0.8 }),
  rustle: (pan) => play("rustle", { rate: 0.9 + Math.random() * 0.25, pan }),
  // a sleeper: the rustle sample slowed right down reads as a snore
  snore: (pan) => play("rustle", { rate: 0.45 + Math.random() * 0.1, gain: 0.7, pan }),
  step: (mud) => play("step", { rate: mud ? 0.6 + Math.random() * 0.1 : 0.95 + Math.random() * 0.1, gain: mud ? 1.6 : 1 }),
  allfound: () => play("allfound"),
  done: () => { play("done"); duck(1.6) },
  music: () => { musicWanted = true; if (musicBuf) startMusic() },
  musicOff: () => { musicWanted = false; if (musicSrc) { try { musicSrc.stop() } catch {} musicSrc = null } },
  muted: () => isMuted,
  setMuted: (m) => { isMuted = !!m; try { localStorage.setItem(MUTE_KEY, isMuted ? "1" : "0") } catch {}; if (master) master.gain.value = isMuted ? 0 : 1 },
}
function duck(seconds) {
  if (!ac || !musicBus) return
  const t = ac.currentTime
  musicBus.gain.cancelScheduledValues(t)
  musicBus.gain.setValueAtTime(db(MUSIC_DB - 8), t)
  musicBus.gain.linearRampToValueAtTime(db(MUSIC_DB), t + seconds)
}
