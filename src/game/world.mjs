// The 3D forest. three.js with an orthographic isometric camera. Builds a level once (instanced
// trees, rocks, fences, ponds, mud, brush, decoration; one group per spot so it can rustle), then
// each frame moves mom, strings the kits out along her breadcrumb trail, follows her with the
// camera and renders. The sim never sees any of this: positions come in, pictures go out.

import * as THREE from "/vendor/three.module.js"
import { GLTFLoader } from "/vendor/GLTFLoader.js"
import { PROPS3D } from "./props3d.data.mjs"
import { C, heightOf, cellAt, rampUp, PICKUP, SLEEP_TICKS, passable, babyAt, isSleeper } from "./sim.mjs"
import { SPECIES } from "./kit.mjs"

export { THREE }
const V = typeof window !== "undefined" && window.BUILD ? `?v=${window.BUILD}` : ""
const REDUCED = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
const loader = new GLTFLoader()

// ---- templates ---------------------------------------------------------------------------------

const tpl = {}
// A template: the glTF scene moved so its bounding box stands with its bottom centre at the origin.
export function loadModel(key) {
  if (tpl[key]) return tpl[key]
  const info = PROPS3D[key]
  if (!info) return Promise.reject(new Error(`no model ${key}`))
  tpl[key] = loader.loadAsync(`/3d/${key}.glb${V}`).then((g) => {
    const root = new THREE.Group(); root.name = key
    const s = g.scene
    s.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false
        const m = o.material
        if (m && m.isMeshStandardMaterial) {
          m.roughness = 1; m.metalness = 0
          if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.magFilter = THREE.NearestFilter }
          // a platform's top is the same teal as the ground, so a raised block read as a brown wall on
          // flat grass; its own lighter mint makes height legible from the iso angle
          if (/^cliff/.test(key) && m.name === "grass") m.color.set(0xb9f7ea)
        }
      }
    })
    s.position.set(-(info.lo[0] + info.hi[0]) / 2, -info.lo[1], -(info.lo[2] + info.hi[2]) / 2)
    root.add(s)
    root.updateMatrixWorld(true)
    return { root, clips: g.animations || [] }
  })
  return tpl[key]
}

// Every (geometry, material, local matrix) in a template, for instancing.
export function parts(t) {
  const out = []
  t.root.updateMatrixWorld(true)
  t.root.traverse((o) => {
    if (!o.isMesh) return
    const m = o.matrixWorld.clone()
    out.push({ geo: o.geometry, mat: o.material, m })
  })
  return out
}

// ---- tables ------------------------------------------------------------------------------------

const TREES = ["tree_default", "tree_oak", "tree_pineRoundA", "tree_pineRoundB", "tree_detailed", "tree_pineRoundC"]
const ROCKS = ["rock_largeA", "rock_largeB", "rock_largeC", "rock_tallA"]
const DECOR = ["flower_purpleA", "flower_redA", "flower_yellowA", "grass_large", "grass", "mushroom_redGroup"]
// spot kinds per species -> model, scale, extra
const SPOT_MODELS = {
  fox: [
    { key: "log_large", scale: 1.25, name: "log" },
    { key: "burrow", scale: 1, name: "burrow" },
    { key: "plant_flatTall", scale: 3.0, name: "fern" },
    { key: "stump_oldTall", scale: 2.2, name: "stump" },
  ],
}
const h32 = (x, z, k = 0) => { let h = (x * 374761393 + z * 668265263 + k * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

const COL = { field: 0x157a3a, deep: 0x0b3d1e, sky: 0xcfe9ff, hole: 0x1a0d05, earth: 0x8a5a2b, line: 0xfff1c7, baby: 0xffb15e, glow: 0xffd23f, water: 0x3aa7e8, waterDeep: 0x2a7fc4, mud: 0x6b4a2b, mudDark: 0x4e3419 }

// Time of day by weekday (0 = Monday, the tiny days, to 6 = Sunday, the huge one): dawn through dusk to a
// blue night with fireflies. hemisphere sky/ground + intensity, sun colour/intensity/direction, the
// backdrop beyond the forest, and how many fireflies.
const TOD = [
  { sky: 0xffd9c2, ground: 0x3a6b2a, hemi: 1.0, sun: 0xffc090, sunI: 1.9, dir: [-10, 7, 4], back: 0x2a4a2a, fire: 0 },     // Mon: dawn
  { sky: 0xd8ecff, ground: 0x3a6b2a, hemi: 1.1, sun: 0xfff1d6, sunI: 2.0, dir: [-6, 14, 5], back: 0x0b3d1e, fire: 0 },     // Tue: morning
  { sky: 0xe8f4ff, ground: 0x4a7a2a, hemi: 1.2, sun: 0xffffff, sunI: 2.1, dir: [-2, 18, 2], back: 0x0b3d1e, fire: 0 },     // Wed: noon
  { sky: 0xd4ecff, ground: 0x3a6b2a, hemi: 1.1, sun: 0xfff0cc, sunI: 2.0, dir: [5, 13, 6], back: 0x0b3d1e, fire: 0 },      // Thu: afternoon
  { sky: 0xffe2b0, ground: 0x4a5a1a, hemi: 1.0, sun: 0xffb86a, sunI: 2.0, dir: [10, 6, 5], back: 0x1a3a1a, fire: 0 },      // Fri: golden hour
  { sky: 0xd8a8d0, ground: 0x2a3a4a, hemi: 0.95, sun: 0xff9a7a, sunI: 1.6, dir: [12, 4, -4], back: 0x1a2240, fire: 18 },   // Sat: dusk
  { sky: 0x8aa0ff, ground: 0x182a44, hemi: 0.9, sun: 0xb8c8ff, sunI: 1.1, dir: [4, 12, -6], back: 0x0a1030, fire: 40 },    // Sun: night
]

// ---- the world ---------------------------------------------------------------------------------

export async function makeWorld(host, lv, { splash = false, lookOpts = {}, tod = 1 } = {}) {
  const canvas = document.createElement("canvas")
  canvas.className = "mg-canvas"
  host.prepend(canvas)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = !/noshadow/.test(location.search)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  const day = TOD[((tod % 7) + 7) % 7] || TOD[1]
  scene.background = new THREE.Color(day.back)

  // near/far hug the scene: a 300-unit depth range made the block tops (grass slab over dirt cube,
  // coplanar) z-fight and come out brown
  const CAM_D = 40
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAM_D - 30, CAM_D + 40)
  let viewH = lookOpts.viewH || 15          // metres visible top to bottom on a portrait phone
  let viewExtra = 0, viewExtraCur = 0       // the frame widens as the line grows
  let camDir = new THREE.Vector3(1, lookOpts.camLift || 1, 1).normalize()
  camera.position.copy(camDir).multiplyScalar(CAM_D)
  camera.lookAt(0, 0, 0)

  scene.add(new THREE.HemisphereLight(day.sky, day.ground, day.hemi))
  const sun = new THREE.DirectionalLight(day.sun, day.sunI)
  const sunOff = new THREE.Vector3(...day.dir)
  sun.position.copy(sunOff); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const SR = 20
  sun.shadow.camera.left = -SR; sun.shadow.camera.right = SR; sun.shadow.camera.top = SR; sun.shadow.camera.bottom = -SR
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04
  scene.add(sun); scene.add(sun.target)

  // the forest floor beyond the level, and the level's own ground as one plane (a tile per cell showed
  // hairline seams between instances)
  const beyond = new THREE.Mesh(new THREE.PlaneGeometry(lv.w * 4, lv.h * 4), new THREE.MeshLambertMaterial({ color: day.back }))
  beyond.rotation.x = -Math.PI / 2; beyond.position.set(lv.w / 2, -0.06, lv.h / 2); beyond.receiveShadow = true
  scene.add(beyond)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(lv.w, lv.h), new THREE.MeshStandardMaterial({ color: 0x2cd8b8, roughness: 1, metalness: 0 }))
  floor.rotation.x = -Math.PI / 2; floor.position.set(lv.w / 2, 0, lv.h / 2); floor.receiveShadow = true
  scene.add(floor)

  const world = new THREE.Group(); scene.add(world)
  const species = SPECIES[lv.species] || SPECIES.fox

  // --- load everything we need
  const need = new Set(["cliff_block_rock", "cliff_blockSlope_rock", "fence_simple", "fence_simpleLow", "cliff_cave_rock", "rock_largeB", "grass_large", "grass", "plant_bush", "animal-" + species.mom, ...TREES, ...ROCKS, ...DECOR])
  for (const s of SPOT_MODELS[lv.species] || SPOT_MODELS.fox) if (s.key !== "burrow") need.add(s.key)
  const models = {}
  await Promise.all([...need].map((k) => loadModel(k).then((t) => { models[k] = t })))

  // --- instanced statics
  const cell = (x, z) => lv.grid[z * lv.w + x]
  const batches = new Map()   // key -> matrices[]
  const put = (key, m) => { (batches.get(key) || batches.set(key, []).get(key)).push(m) }
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3()
  const place = (key, x, z, y, s, rotY, sy = s) => { P.set(x, y, z); Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY); S.set(s, sy, s); M.compose(P, Q, S); put(key, M.clone()) }
  // the wet and the soft ground: flat quads a hair over the floor, merged per kind
  const waterCells = [], mudCells = []
  for (let z = 0; z < lv.h; z++) for (let x = 0; x < lv.w; x++) {
    const c = cell(x, z), cx = x + 0.5, cz = z + 0.5
    const r = h32(x, z)
    if (c === C.PLATFORM) { place("cliff_block_rock", cx, cz, 0, 1, 0); continue }
    if (c === C.RAMP) {
      const up = rampUp(lv, x, z)
      // the slope model rises toward -x (gallery-checked); turn it so it rises toward the platform
      const rot = up[0] === 1 ? Math.PI : up[0] === -1 ? 0 : up[1] === 1 ? Math.PI / 2 : -Math.PI / 2
      place("cliff_blockSlope_rock", cx, cz, 0, 1, rot)
      continue
    }
    if (c === C.WATER) { waterCells.push([x, z]); continue }
    if (c === C.MUD) { mudCells.push([x, z]) }
    if (c === C.BRUSH) {
      // tall grass, three tufts to a cell, over her head: the line goes in and only the silhouettes come out
      for (let k = 0; k < 3; k++) place("grass_large", cx + (h32(x, z, 10 + k) - 0.5) * 0.7, cz + (h32(x, z, 20 + k) - 0.5) * 0.7, 0, 2.4 + h32(x, z, 30 + k) * 0.8, h32(x, z, 40 + k) * 6.283, 2.6 + h32(x, z, 50 + k))
      continue
    }
    if (c === C.TREE) {
      const key = TREES[Math.floor(r * TREES.length)]
      place(key, cx + (h32(x, z, 1) - 0.5) * 0.3, cz + (h32(x, z, 2) - 0.5) * 0.3, 0, 1.55 + h32(x, z, 3) * 0.5, r * 6.283)
    } else if (c === C.ROCK) {
      place(ROCKS[Math.floor(r * ROCKS.length)], cx, cz, 0, 1.25 + h32(x, z, 3) * 0.3, r * 6.283)
    } else if (c === C.FENCE || c === C.GAP) {
      const alongX = cell(x + 1, z) === C.FENCE || cell(x - 1, z) === C.FENCE || cell(x + 1, z) === C.GAP || cell(x - 1, z) === C.GAP
      // a gap is a low rail she squeezes under: the same line, visibly broken
      if (c === C.FENCE) place("fence_simple", cx, cz, 0, 1.0, alongX ? 0 : Math.PI / 2)
      else { P.set(cx, 0, cz); Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), alongX ? 0 : Math.PI / 2); S.set(1, 0.55, 1); M.compose(P, Q, S); put("fence_simpleLow", M.clone()) }
    } else if (c === C.GROUND && (x > 0 && z > 0 && x < lv.w - 1 && z < lv.h - 1)) {
      // small tufts over the open ground so it has a scale, hashed from the cell so every device agrees
      if (h32(x, z, 7) < 0.22) place("grass", cx + (h32(x, z, 8) - 0.5) * 0.8, cz + (h32(x, z, 9) - 0.5) * 0.8, 0, 0.9 + h32(x, z, 11) * 0.6, h32(x, z, 12) * 6.283)
    }
  }
  for (const [x, z, kind, turn] of lv.decor || []) {
    const c = cell(x, z)
    place(DECOR[kind % DECOR.length], x + 0.5 + (h32(x, z, 4) - 0.5) * 0.5, z + 0.5 + (h32(x, z, 5) - 0.5) * 0.5, c === C.PLATFORM ? 1 : 0, 1.4, turn * Math.PI / 2)
  }
  const instanced = []
  for (const [key, mats] of batches) {
    for (const p of parts(models[key])) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, mats.length)
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false
      const tmp = new THREE.Matrix4()
      mats.forEach((m, i) => { tmp.multiplyMatrices(m, p.m); im.setMatrixAt(i, tmp) })
      im.instanceMatrix.needsUpdate = true
      world.add(im); instanced.push(im)
    }
  }
  // ponds: a dark bed under a lighter, slowly breathing surface, with a pale rim where it meets the grass
  let waterMat = null
  if (waterCells.length) {
    const bed = quads(waterCells, 1.0), top = quads(waterCells, 0.86)
    const bedM = new THREE.Mesh(bed, new THREE.MeshLambertMaterial({ color: COL.waterDeep })); bedM.position.y = 0.012; bedM.receiveShadow = true; world.add(bedM)
    waterMat = new THREE.MeshLambertMaterial({ color: COL.water, transparent: true, opacity: 0.85 })
    const topM = new THREE.Mesh(top, waterMat); topM.position.y = 0.03; world.add(topM)
    const rimM = new THREE.Mesh(quads(waterCells, 1.08), new THREE.MeshLambertMaterial({ color: 0xcdeef5 })); rimM.position.y = 0.006; world.add(rimM)
  }
  if (mudCells.length) {
    const rim = new THREE.Mesh(quads(mudCells, 1.06), new THREE.MeshLambertMaterial({ color: COL.mudDark })); rim.position.y = 0.008; rim.receiveShadow = true; world.add(rim)
    const mud = new THREE.Mesh(quads(mudCells, 0.92), new THREE.MeshLambertMaterial({ color: COL.mud })); mud.position.y = 0.014; mud.receiveShadow = true; world.add(mud)
    // a few dark puddles
    const pud = mudCells.filter(([x, z]) => h32(x, z, 60) < 0.35)
    if (pud.length) { const p = new THREE.Mesh(quads(pud, 0.4), new THREE.MeshLambertMaterial({ color: COL.mudDark })); p.position.y = 0.02; world.add(p) }
  }

  // --- spots: one group each, so they can rustle
  const spotGroups = []
  const spotModels = SPOT_MODELS[lv.species] || SPOT_MODELS.fox
  for (const sp of lv.spots) {
    const def = spotModels[sp.kind % spotModels.length]
    const g = new THREE.Group()
    g.position.set(sp.x + 0.5, sp.raised ? 1 : 0, sp.z + 0.5)
    g.rotation.y = sp.face * Math.PI / 2
    if (def.key === "burrow") g.add(burrow(models, 1))
    else { const m = models[def.key].root.clone(); m.scale.setScalar(def.scale); g.add(m) }
    world.add(g); spotGroups.push({ g, sp, rustleAt: -1, popAt: -1, phase: h32(sp.x, sp.z, 9) * 2, snoreAt: 0, zz: [] })
  }
  // --- the den: a big burrow, lit when the line is complete
  const den = new THREE.Group(); den.position.set(lv.exit[0] + 0.5, 0, lv.exit[1] + 0.5)
  den.add(burrow(models, 1.7))
  const denGlow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 40), new THREE.MeshBasicMaterial({ color: COL.glow, transparent: true, opacity: 0, depthWrite: false }))
  denGlow.rotation.x = -Math.PI / 2; denGlow.position.y = 0.03; den.add(denGlow)
  const denLight = new THREE.PointLight(COL.glow, 0, 6); denLight.position.y = 0.8; den.add(denLight)
  world.add(den)
  const denMouth = new THREE.Vector3(lv.exit[0] + 0.5, 0.2, lv.exit[1] + 0.5 + 0.8)

  // --- mom and the kits
  const momT = models["animal-" + species.mom]
  const MOM_H = 1.0, momScale = MOM_H / momT.root.children[0] ? MOM_H / PROPS3D["animal-" + species.mom].size[1] : 0.66
  const mom = actor(momT, momScale, COL.line)
  mom.g.position.set(lv.start[0] + 0.5, 0, lv.start[1] + 0.5)
  world.add(mom.g)
  const kits = []   // { g, mixer, slot, hop }
  // Sloppy followers (Mack, 2026-10-16: "they gotta follow way less accurately"). Each kit has its own
  // lag behind its slot, a sideways wobble, a catch-up gain that makes it cut corners and overshoot
  // turns, and a habit of stopping to sniff something and then scurrying to catch up.
  const makeKit = (n) => {
    const k = actor(momT, momScale * 0.42, COL.baby); k.g.visible = false; world.add(k.g); kits.push(k)
    const r = (a, b) => a + Math.random() * (b - a)
    k.vx = 0; k.vz = 0
    k.lag = r(0, 0.7); k.amp = r(0.25, 0.6); k.freq = r(0.5, 1.1); k.phase = r(0, 6.28); k.bias = r(-0.45, 0.45)
    k.gain = r(3.2, 5.5); k.vmax = r(3.3, 3.9)
    k.sniffAt = t_() + r(2, 7); k.sniffUntil = 0; k.sniff = null
    k.anticAt = t_() + r(1, 4); k.antic = null
    return k
  }
  const t_ = () => performance.now() / 1000
  // the wanderer: a kit that is out running between two spots. Hidden while it sits in one.
  const runners = (lv.wanderers || []).map((wd) => { const k = actor(momT, momScale * 0.42, COL.baby); k.g.visible = false; world.add(k.g); return { wd, k } })
  // the ghost of her best run today, drawn faint
  let ghost = null, ghostPath = null
  function setGhost(path) {
    ghostPath = path && path.length > 2 ? path : null
    if (ghostPath && !ghost) { ghost = ghostActor(momT, momScale); world.add(ghost.g) }
    if (ghost) ghost.g.visible = !!ghostPath
  }

  // hint ring (toggle) and debug rings
  const hintRing = new THREE.Mesh(new THREE.RingGeometry(lv.hint - 0.08, lv.hint, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }))
  hintRing.rotation.x = -Math.PI / 2; hintRing.position.y = 0.02; hintRing.visible = false; world.add(hintRing)
  let debugGroup = null
  function showDebug(on) {
    if (debugGroup) { world.remove(debugGroup); debugGroup = null }
    if (!on) return
    debugGroup = new THREE.Group()
    for (const si of lv.babies) {
      const sp = lv.spots[si]
      const r1 = new THREE.Mesh(new THREE.RingGeometry(PICKUP - 0.05, PICKUP, 32), new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false }))
      r1.rotation.x = -Math.PI / 2; r1.position.set(sp.x + 0.5, 0.05 + sp.raised, sp.z + 0.5); debugGroup.add(r1)
      const r2 = new THREE.Mesh(new THREE.RingGeometry(lv.hint - 0.05, lv.hint, 48), new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.25, depthWrite: false, depthTest: false }))
      r2.rotation.x = -Math.PI / 2; r2.position.copy(r1.position); debugGroup.add(r2)
    }
    const pts = lv.solve.route.map(([x, z]) => new THREE.Vector3(x, heightAt(x, z) + 0.1, z))
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }))
    line.renderOrder = 20
    debugGroup.add(line)
    world.add(debugGroup)
  }

  // --- the trail: breadcrumbs behind mom, with running arc length
  const trail = [{ x: mom.g.position.x, z: mom.g.position.z, s: 0 }]
  let trailLen = 0
  const SPACING = 0.8 * 0.95
  function dropCrumb(x, z) {
    const l = trail[trail.length - 1]
    const dx = x - l.x, dz = z - l.z, d = Math.sqrt(dx * dx + dz * dz)
    if (d < 0.08) return
    trailLen += d
    trail.push({ x, z, s: trailLen })
    const keep = SPACING * (kits.length + 3) + 4
    while (trail.length > 2 && trailLen - trail[1].s > keep) trail.shift()
  }
  function trailAt(back) {
    // point `back` metres behind the head, with the heading there
    const want = trailLen - back
    if (want <= trail[0].s) return { x: trail[0].x, z: trail[0].z, hx: 0, hz: 1 }
    let lo = 0, hi = trail.length - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (trail[mid].s <= want) lo = mid; else hi = mid }
    const a = trail[lo], b = trail[hi], f = (want - a.s) / ((b.s - a.s) || 1)
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, hx: b.x - a.x, hz: b.z - a.z }
  }

  function heightAt(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z)
    const c = cellAt(lv, cx, cz)
    if (c !== C.RAMP) return c === C.SPOT ? (lv.spots.find((s) => s.x === cx && s.z === cz)?.raised || 0) : heightOf(c)
    const up = rampUp(lv, cx, cz)
    return Math.min(1, Math.max(0, 0.5 + (x - cx - 0.5) * up[0] + (z - cz - 0.5) * up[1]))
  }
  // can a kit stand here (same rules as her, plus a spot's own cell is fine to brush past)
  const kitFree = (x, z, y) => { const c = cellAt(lv, Math.floor(x), Math.floor(z)); if (c === C.SPOT) return true; if (!passable(c, lv.ability)) return false; return Math.abs(heightAt(x, z) - y) <= 0.55 }

  // --- footprints: a pool of small dark pads dropped behind her, fading out
  const PRINTS = 160
  const printGeo = new THREE.CircleGeometry(0.075, 8)
  const prints = []
  for (let i = 0; i < PRINTS; i++) {
    const m = new THREE.Mesh(printGeo, new THREE.MeshBasicMaterial({ color: 0x0a2a18, transparent: true, opacity: 0, depthWrite: false }))
    m.rotation.x = -Math.PI / 2; m.scale.set(1, 1.5, 1); m.visible = false; m.renderOrder = 0; world.add(m); prints.push({ m, t: -1, life: 7 })
  }
  let printAcc = 0, printSide = 1, printK = 0
  function dropPrint(x, z, heading, inMud) {
    const p = prints[printK++ % PRINTS]
    const sx = Math.cos(heading) * 0.16 * printSide, sz = -Math.sin(heading) * 0.16 * printSide
    printSide = -printSide
    p.m.position.set(x + sx, heightAt(x, z) + 0.011, z + sz); p.m.rotation.z = heading
    p.m.visible = true; p.t = 0; p.life = inMud ? 14 : 6
    p.m.material.color.set(inMud ? 0x2e1a08 : 0x0a2a18); p.m.material.opacity = inMud ? 0.75 : 0.35
    p.m.scale.set(inMud ? 1.5 : 1, inMud ? 2 : 1.5, 1)
  }

  // --- particles: little leaf puffs, dirt, join rings, sprites
  const puffs = []
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.16)
  const leafMat = new THREE.MeshBasicMaterial({ color: 0x8fd37a, side: THREE.DoubleSide, transparent: true })
  function puff(x, y, z, n = 6, color, spread = 0.6, up = 1.2) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(leafGeo, color ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true }) : leafMat.clone())
      m.position.set(x + (Math.random() - 0.5) * spread, y + 0.3 + Math.random() * 0.3, z + (Math.random() - 0.5) * spread)
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0)
      world.add(m)
      puffs.push({ m, vx: (Math.random() - 0.5) * 1.2, vy: up + Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.2, t: 0, life: 0.7 + Math.random() * 0.4 })
    }
  }
  const rings = []
  function ring(x, y, z, color = COL.glow, size = 1, speed = 6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }))
    m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.05, z); m.scale.setScalar(size); world.add(m); rings.push({ m, t: 0, size, speed })
  }
  // a word drawn on a little canvas, shown as a sprite that rises and fades ("!", "z")
  const spriteTex = {}
  function textSprite(txt, color, px = 96) {
    const key = txt + color
    if (!spriteTex[key]) {
      const c = document.createElement("canvas"); c.width = px * 1.5; c.height = px * 1.5
      const g = c.getContext("2d"); g.font = `900 ${px}px "Space Grotesk", system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"
      g.lineWidth = px * 0.16; g.strokeStyle = "rgba(0,0,0,.75)"; g.strokeText(txt, c.width / 2, c.height / 2)
      g.fillStyle = color; g.fillText(txt, c.width / 2, c.height / 2)
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
      spriteTex[key] = tex
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex[key], transparent: true, depthTest: false }))
    s.renderOrder = 30
    return s
  }
  const sprites = []
  function bang(x, y, z, txt = "!", color = "#ffd23f", size = 0.9, life = 0.9, rise = 1.2) {
    const s = textSprite(txt, color); s.position.set(x, y, z); s.scale.setScalar(size * 0.3); world.add(s)
    sprites.push({ s, t: 0, life, rise, size })
  }

  // --- fireflies, on the dusk and night days
  const flies = []
  if (day.fire && !REDUCED) {
    const geo = new THREE.PlaneGeometry(0.1, 0.1)
    for (let i = 0; i < day.fire; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe8ff7a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
      m.position.set(lv.start[0] + (Math.random() - 0.5) * 20, 0.4 + Math.random() * 1.6, lv.start[1] + (Math.random() - 0.5) * 20)
      world.add(m); flies.push({ m, ph: Math.random() * 6.28, sp: 0.3 + Math.random() * 0.5, y: m.position.y })
    }
  }

  // --- camera framing
  let w = 0, h = 0, projFor = -1
  function resize() {
    const r = host.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const vhWant = viewH + viewExtraCur
    if (r.width !== w || r.height !== h || Math.abs(vhWant - projFor) > 0.002) {
      w = r.width; h = r.height; projFor = vhWant
      renderer.setSize(w, h, false)
      const portrait = h >= w
      const vh = portrait ? vhWant : vhWant * 0.78
      const aspect = w / h
      camera.top = vh / 2; camera.bottom = -vh / 2; camera.left = -vh / 2 * aspect; camera.right = vh / 2 * aspect
      camera.updateProjectionMatrix()
    }
    return true
  }
  const target = new THREE.Vector3(lv.start[0] + 0.5, 0, lv.start[1] + 0.5)
  const look = target.clone()
  let peekUntil = 0, peekAt = null
  function placeCamera(dt, lead, t) {
    const k = 1 - Math.exp(-dt * 6)
    const want = new THREE.Vector3(target.x + lead.x, target.y, target.z + lead.z)
    // a glance at the den when the line is complete: the camera leans toward it and comes back
    if (peekAt && t < peekUntil) { const f = Math.min(1, (peekUntil - t) / 1.4); const e = Math.sin(f * Math.PI); want.lerp(peekAt, 0.55 * e) }
    look.lerp(want, k)
    camera.position.copy(look).addScaledVector(camDir, CAM_D)
    camera.lookAt(look)
    sun.position.copy(look).add(sunOff); sun.target.position.copy(look)
  }
  // screen vector -> ground-plane world vector, from the camera's basis
  function toWorld(sx, sy) {
    const right = new THREE.Vector3(); const up = new THREE.Vector3()
    camera.updateMatrixWorld()
    right.setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize()
    up.setFromMatrixColumn(camera.matrixWorld, 1); up.y = 0; up.normalize()
    return [right.x * sx - up.x * sy, right.z * sx - up.z * sy]
  }
  // where she is on the screen, in css px inside the host
  function momScreen() {
    const v = mom.g.position.clone(); v.y += 0.4; v.project(camera)
    return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]
  }

  // --- per-frame
  let lastNow = 0, stepAcc = 0, idleSince = 0, chorusAt = 0
  let momHeading = Math.PI, momSpeed = 0, momTurn = 0, lastHeading = Math.PI, momSquash = 0, momSniff = 0, momLook = null
  let wasComplete = false
  let fin = null   // the den arrival, once it starts: { t0, att, onDone, gone: Set }
  const api = {
    ready: Promise.resolve(),
    toWorld, resize, showDebug, puff, ring, bang, momScreen, setGhost,
    get camera() { return camera },
    setHintRing(on) { hintRing.visible = !!on },
    setLook(o) { if (o.viewH) { viewH = o.viewH; w = 0 } if (o.camLift) { camDir = new THREE.Vector3(1, o.camLift, 1).normalize() } },
    // The den arrival: the kits file into the burrow one by one, she goes last, the glow swells, then onDone.
    finale(att, onDone) { if (fin) return; fin = { t0: t_(), att, onDone, gone: new Set(), done: false }; peekAt = null },
    get inFinale() { return !!fin },
    // att: the sim's attempt (x, z, got, done...), hintSpot: the stuck-assist baby's spot
    // pos: where to draw her this frame (the view interpolates between sim ticks; 30 Hz steps on a 60 Hz
    // screen moved her every other frame and read as jitter). Falls back to the tick position.
    // tickF: the clock as a fraction of a tick, for the wanderer and the ghost.
    frame(now, { att, pos = null, tickF = 0, hintSpot = -1, events = null } = {}) {
      viewExtraCur += (viewExtra - viewExtraCur) * Math.min(1, 0.016 * 2)
      if (!resize()) return
      const dt = Math.min(0.05, lastNow ? (now - lastNow) / 1000 : 0.016); lastNow = now
      const t = now / 1000
      // mom
      let mx = mom.g.position.x, mz = mom.g.position.z
      const here = cellAt(lv, Math.floor(mx), Math.floor(mz))
      if (fin) { finaleStep(dt, t); att = null }
      if (att) {
        const ax = pos ? pos.x : att.x, az = pos ? pos.z : att.z
        const dx = ax - mx, dz = az - mz
        const moved = Math.sqrt(dx * dx + dz * dz)
        momSpeed = moved / dt
        if (moved > 0.001) { momHeading = Math.atan2(dx, dz); idleSince = t; dropCrumb(ax, az) }
        mx = ax; mz = az
        mom.g.position.set(mx, heightAt(mx, mz), mz)
        // turn smoothly; lean into the turn
        let dh = momHeading - mom.g.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI
        const turn = dh * Math.min(1, dt * 14)
        mom.g.rotation.y += turn
        momTurn += ((momSpeed > 0.5 ? -turn / Math.max(dt, 0.001) * 0.05 : 0) - momTurn) * Math.min(1, dt * 8)
        mom.m.rotation.z = Math.max(-0.35, Math.min(0.35, momTurn))
        mom.play(momSpeed > 2.2 ? "run" : momSpeed > 0.15 ? "walk" : "idle", dt, momSpeed > 2.2 ? 1.3 : 1)
        // the squeeze: flat through a gap, and a splash in the mud
        const inGap = here === C.GAP, inMud = here === C.MUD
        momSquash += ((inGap ? 1 : 0) - momSquash) * Math.min(1, dt * 10)
        mom.m.scale.set(momScale * (1 + 0.3 * momSquash), momScale * (1 - 0.45 * momSquash), momScale * (1 + 0.1 * momSquash))
        if (inGap && momSpeed > 0.3 && Math.random() < dt * 6) puff(mx, 0.1, mz, 1, 0xc9a86a, 0.5, 0.6)
        if (inMud && momSpeed > 0.5 && Math.random() < dt * 8) puff(mx, 0, mz, 1, 0x4e3419, 0.7, 0.9)
        stepAcc += moved; printAcc += moved
        if (stepAcc > 1.1 && momSpeed > 0.5) { stepAcc = 0; if (events) events.step(inMud) }
        if (printAcc > 0.45 && momSpeed > 0.3) { printAcc = 0; dropPrint(mx, mz, mom.g.rotation.y, inMud) }
        // idle: the tail wags, and if something near her is rustling she looks at it; next to a spot she sniffs
        const idle = t - idleSince > 1.0 && momSpeed < 0.1
        const standing = momSpeed < 0.1
        let nearSpot = false
        if (standing) for (const sg of spotGroups) { const ddx = sg.sp.x + 0.5 - mx, ddz = sg.sp.z + 0.5 - mz; if (ddx * ddx + ddz * ddz < 2.6 * 2.6) { nearSpot = true; break } }
        momSniff += ((standing && nearSpot ? 1 : 0) - momSniff) * Math.min(1, dt * 5)
        if (mom.body) { mom.body.rotation.x += 0.38 * momSniff + Math.sin(t * 9) * 0.06 * momSniff }
        if (mom.tail) { mom.tail.rotation.y += Math.sin(t * (idle ? 7 : 11)) * (idle ? 0.6 : 0.25) }
        if (idle && momLook) { let d2 = momLook - mom.g.rotation.y; while (d2 > Math.PI) d2 -= 2 * Math.PI; while (d2 < -Math.PI) d2 += 2 * Math.PI; mom.g.rotation.y += d2 * Math.min(1, dt * 2) }
        momLook = null
        // kits: one per collected baby, in order
        while (kits.length < att.got.length) {
          const k = makeKit(kits.length)
          const b = lv.babies.indexOf(att.got[kits.length - 1])
          const sp = lv.spots[att.got[kits.length - 1]]
          const p = babyAt(lv, b, att.tick)
          const y = sp.raised || 0
          k.g.visible = true; k.g.position.set(p.x, y + 0.2, p.z)
          k.hop = 0
          // the pop out: the spot bounces, leaves and dirt fly, a "!" goes up
          const sg = spotGroups.find((s) => s.sp === sp || (p.at === 1 && lv.spots[(lv.wanderers.find((w) => w.baby === b) || {}).to] === s.sp))
          if (sg && !p.moving) { sg.popAt = t; sg.rustleAt = t }
          puff(p.x, y, p.z, 8); puff(p.x, y, p.z, 6, 0x6b4a2b, 0.4, 1.6)
          ring(p.x, y, p.z)
          bang(p.x, y + 1.3, p.z, "!", "#ffd23f", 1.1, 0.8, 1.4)
          if (events) events.kit(kits.length, b)
        }
        while (kits.length > att.got.length) { const k = kits.pop(); world.remove(k.g) }
        viewExtra = Math.min(3, Math.floor(kits.length / 3) * 0.6)
        kits.forEach((k, i) => {
          let goal
          if (idle && !REDUCED) {
            // bunch up around her
            const ang = (i / Math.max(1, kits.length)) * Math.PI * 2 + 0.7
            const rr = 0.9 + 0.25 * (i % 3)
            goal = { x: mx + Math.cos(ang) * rr, z: mz + Math.sin(ang) * rr, hx: mx - (mx + Math.cos(ang) * rr), hz: mz - (mz + Math.sin(ang) * rr) }
          } else {
            goal = trailAt(SPACING * (i + 1) + k.lag)
            // sideways of the trail: a slow wobble plus a standing bias, so the line is a loose ribbon
            const hl = Math.sqrt(goal.hx * goal.hx + goal.hz * goal.hz) || 1
            const nx = -goal.hz / hl, nz = goal.hx / hl
            const side = k.bias + k.amp * Math.sin(t * k.freq + k.phase)
            goal = { x: goal.x + nx * side, z: goal.z + nz * side, hx: goal.hx, hz: goal.hz }
          }
          // a sniff: stop for a moment somewhere just off the line, then scurry
          if (!idle && !REDUCED && k.hop >= 1) {
            if (!k.sniff && t > k.sniffAt && momSpeed > 1) { k.sniff = { x: k.g.position.x + (Math.random() - 0.5) * 0.8, z: k.g.position.z + (Math.random() - 0.5) * 0.8 }; k.sniffUntil = t + 0.3 + Math.random() * 0.5 }
            if (k.sniff) { if (t > k.sniffUntil) { k.sniff = null; k.sniffAt = t + 3 + Math.random() * 6 } else goal = { x: k.sniff.x, z: k.sniff.z, hx: goal.hx, hz: goal.hz } }
          }
          const gy = heightAt(goal.x, goal.z)
          const kp = k.g.position
          if (k.hop < 1) {
            // the pop out: a hop from the spot to the line
            k.hop = Math.min(1, k.hop + dt * 2.6)
            const e = k.hop
            kp.x += (goal.x - kp.x) * Math.min(1, dt * 7)
            kp.z += (goal.z - kp.z) * Math.min(1, dt * 7)
            kp.y = gy + Math.sin(e * Math.PI) * 0.9
            k.g.scale.setScalar(0.6 + 0.4 * e)   // the group only; the model inside already carries the kit scale
            k.vx = 0; k.vz = 0
          } else {
            // steer: a lagging, capped velocity so it cuts corners and overshoots, and sprints when far behind
            const dx = goal.x - kp.x, dz = goal.z - kp.z, dist = Math.sqrt(dx * dx + dz * dz)
            const far = dist > 2.2
            const want = idle ? 2.5 : k.gain
            let tx = dx * want, tz = dz * want
            const tl = Math.sqrt(tx * tx + tz * tz)
            const cap = k.sniff ? 1.2 : far ? k.vmax + 1.2 : k.vmax
            if (tl > cap) { tx *= cap / tl; tz *= cap / tl }
            const acc = Math.min(1, dt * (far ? 9 : 5))
            k.vx += (tx - k.vx) * acc; k.vz += (tz - k.vz) * acc
            // keep the sloppiness inside the walkable world: slide along a tree rather than through it
            const nx = kp.x + k.vx * dt, nz = kp.z + k.vz * dt
            if (kitFree(nx, nz, gy)) { kp.x = nx; kp.z = nz }
            else if (kitFree(nx, kp.z, gy)) { kp.x = nx; k.vz = 0 }
            else if (kitFree(kp.x, nz, gy)) { kp.z = nz; k.vx = 0 }
            else { k.vx = 0; k.vz = 0; if (dist > 3.5) { kp.x = goal.x; kp.z = goal.z } }
            kp.y = heightAt(kp.x, kp.z)
            // antics while the line waits: a pounce on the one in front, a yawn, a tumble
            if (idle && !REDUCED) {
              if (!k.antic && t > k.anticAt) { const kind = ["pounce", "yawn", "tumble"][Math.floor(Math.random() * 3)]; k.antic = { kind, t0: t, dur: kind === "yawn" ? 1.1 : 0.7 }; if (kind === "pounce" && i > 0) { const o = kits[i - 1].g.position; k.antic.tx = o.x; k.antic.tz = o.z } }
              if (k.antic) {
                const e = Math.min(1, (t - k.antic.t0) / k.antic.dur)
                if (k.antic.kind === "pounce" && k.antic.tx != null) { kp.y += Math.sin(e * Math.PI) * 0.5; kp.x += (k.antic.tx - kp.x) * dt * 3; kp.z += (k.antic.tz - kp.z) * dt * 3; if (e > 0.95 && !k.antic.hit) { k.antic.hit = true; ring(kp.x, kp.y, kp.z, 0xffffff, 0.5, 8); kits[i - 1].vx += (Math.random() - 0.5) * 2; kits[i - 1].vz += (Math.random() - 0.5) * 2 } }
                else if (k.antic.kind === "yawn") { const s = 1 + Math.sin(e * Math.PI) * 0.25; k.g.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); k.yawn = Math.sin(e * Math.PI) * 0.5 }
                else if (k.antic.kind === "tumble") { k.m.rotation.z = e * Math.PI * 2; kp.y += Math.sin(e * Math.PI) * 0.3 }
                if (e >= 1) { k.antic = null; k.anticAt = t + 2 + Math.random() * 5; k.g.scale.setScalar(1); k.m.rotation.z = 0; k.yawn = 0 }
              }
            } else if (k.antic) { k.antic = null; k.g.scale.setScalar(1); k.m.rotation.z = 0; k.yawn = 0 }
            if (!k.antic) k.anticAt = Math.max(k.anticAt, t + 1)
          }
          // the squeeze for them too
          const kc = cellAt(lv, Math.floor(kp.x), Math.floor(kp.z))
          k.squash = (k.squash || 0) + ((kc === C.GAP ? 1 : 0) - (k.squash || 0)) * Math.min(1, dt * 10)
          const ks0 = momScale * 0.42
          k.m.scale.set(ks0 * (1 + 0.3 * k.squash), ks0 * (1 - 0.45 * k.squash), ks0 * (1 + 0.1 * k.squash))
          const ks = Math.sqrt(k.vx * k.vx + k.vz * k.vz)
          const hx = idle ? mx - kp.x : (ks > 0.3 ? k.vx : goal.hx), hz = idle ? mz - kp.z : (ks > 0.3 ? k.vz : goal.hz)
          if (hx || hz) { let dh = Math.atan2(hx, hz) - k.g.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; k.g.rotation.y += dh * Math.min(1, dt * 9) }
          k.play(ks > 0.35 ? "run" : "idle", dt, 1.3 + ks * 0.15)
          if (k.tail) k.tail.rotation.y += Math.sin(t * 9 + i) * 0.5
          if (k.body && k.yawn) k.body.rotation.x -= k.yawn
        })
        // the line is audible: now and then one of them squeaks
        if (kits.length && t > chorusAt) { chorusAt = t + 4 + Math.random() * 5; if (events && events.chirp) events.chirp(Math.floor(Math.random() * kits.length)) }
        // the den lights when the line is complete, and the camera glances at it once
        const complete = att.got.length === lv.babies.length && lv.babies.length > 0
        if (complete && !wasComplete) { wasComplete = true; peekAt = den.position.clone(); peekUntil = t + 1.4 }
        if (!complete) wasComplete = false
        denGlow.material.opacity += ((complete ? 0.55 + 0.25 * Math.sin(t * 5) : 0) - denGlow.material.opacity) * Math.min(1, dt * 6)
        denLight.intensity += ((complete ? 2.5 : 0) - denLight.intensity) * Math.min(1, dt * 4)
        // where every baby is right now (a wanderer may be at its other spot, or out running)
        const babyHere = new Map()   // spot index -> baby index, for babies sitting in a spot
        for (const r of runners) {
          const b = r.wd.baby
          const got = att.got.indexOf(lv.babies[b]) >= 0
          const p = babyAt(lv, b, att.tick + tickF)
          r.k.g.visible = !got && p.moving
          if (r.k.g.visible) {
            const sp = lv.spots[lv.babies[b]], to = lv.spots[r.wd.to]
            const dirx = (p.dir === 1 ? to.x - sp.x : sp.x - to.x), dirz = (p.dir === 1 ? to.z - sp.z : sp.z - to.z)
            r.k.g.position.set(p.x, heightAt(p.x, p.z) + Math.abs(Math.sin(t * 14)) * 0.08, p.z)
            r.k.g.rotation.y = Math.atan2(dirx, dirz)
            r.k.play("run", dt, 1.5)
            if (r.k.tail) r.k.tail.rotation.y += Math.sin(t * 12) * 0.5
            if (Math.random() < dt * 3) puff(p.x, 0, p.z, 1, undefined, 0.3, 0.5)
          }
          if (!got && !p.moving) babyHere.set(p.at === 1 ? r.wd.to : lv.babies[b], b)
        }
        lv.babies.forEach((si, b) => { if (att.got.indexOf(si) < 0 && !(lv.wanderers || []).some((w) => w.baby === b)) babyHere.set(si, b) })
        // rustles: a spot with a baby, inside the hint radius, every ~2 s; the stuck-assist spot from anywhere.
        // a sleeper snores instead, and a ring fills while she stays
        let nearestHint = null, nearestD = Infinity
        for (const sg of spotGroups) {
          const i = lv.spots.indexOf(sg.sp)
          const b = babyHere.has(i) ? babyHere.get(i) : -1
          const hasBaby = b >= 0
          const dx = sg.sp.x + 0.5 - mx, dz = sg.sp.z + 0.5 - mz, d2 = dx * dx + dz * dz
          const near = d2 <= lv.hint * lv.hint
          const sleeper = hasBaby && isSleeper(lv, b)
          if (hasBaby && (near || hintSpot === i) && d2 < nearestD) { nearestD = d2; nearestHint = sg }
          const due = hasBaby && (near || hintSpot === i) && t - sg.rustleAt > 2.0 + sg.phase * 0.3
          if (due && !REDUCED) {
            sg.rustleAt = t; sg.phase = Math.random()
            if (sleeper) { bang(sg.g.position.x + 0.3, sg.g.position.y + 1.1, sg.g.position.z, "z", "#cfe9ff", 0.7, 1.4, 1.0); if (events && events.snore) events.snore(dx) }
            else { puff(sg.g.position.x, sg.g.position.y, sg.g.position.z, 4); ring(sg.g.position.x, sg.g.position.y, sg.g.position.z, 0xffffff, 0.8, 5); if (events) events.rustle(dx) }
          }
          const age = t - sg.rustleAt
          const popAge = t - sg.popAt
          if (sg.popAt >= 0 && popAge < 0.7) {
            const e = 1 - popAge / 0.7
            sg.g.scale.set(1 + Math.sin(popAge * 28) * 0.18 * e, 1 + Math.abs(Math.sin(popAge * 20)) * 0.35 * e, 1 + Math.sin(popAge * 28) * 0.18 * e)
            sg.g.rotation.z = Math.sin(popAge * 30) * 0.2 * e
          } else if (sg.rustleAt >= 0 && age < 0.55 && !sleeper) {
            const e = 1 - age / 0.55
            sg.g.rotation.z = Math.sin(age * 40) * 0.12 * e
            sg.g.scale.set(1 + Math.sin(age * 30) * 0.06 * e, 1 + Math.abs(Math.sin(age * 22)) * 0.14 * e, 1 + Math.sin(age * 40) * 0.06 * e)
          } else if (sleeper && hasBaby) {
            // a slow breathing
            const br = 1 + Math.sin(t * 2.2 + sg.phase) * 0.03
            sg.g.scale.set(br, 1 / br, br); sg.g.rotation.z = 0
          } else { sg.g.rotation.z = 0; sg.g.scale.set(1, 1, 1) }
          // the wake ring
          if (sleeper && att.dwell && att.dwell[b] > 0) {
            if (!sg.wake) { sg.wake = new THREE.Mesh(new THREE.RingGeometry(PICKUP - 0.14, PICKUP, 48, 1, 0, 0.01), new THREE.MeshBasicMaterial({ color: COL.glow, transparent: true, opacity: 0.85, depthWrite: false })); sg.wake.rotation.x = -Math.PI / 2; sg.wake.position.set(sg.g.position.x, sg.g.position.y + 0.04, sg.g.position.z); world.add(sg.wake) }
            const f = Math.min(1, att.dwell[b] / SLEEP_TICKS)
            sg.wake.geometry.dispose(); sg.wake.geometry = new THREE.RingGeometry(PICKUP - 0.14, PICKUP, 48, 1, 0, Math.max(0.01, f * Math.PI * 2))
            sg.wake.visible = true
          } else if (sg.wake) sg.wake.visible = false
        }
        if (nearestHint && idle) momLook = Math.atan2(nearestHint.sp.x + 0.5 - mx, nearestHint.sp.z + 0.5 - mz)
        // the ghost of the best run, at the clock's tick
        if (ghost && ghostPath) {
          const tk = att.tick + tickF
          const p = pathAt(ghostPath, tk)
          ghost.g.visible = !!p && att.started
          if (p) { ghost.g.position.set(p.x, heightAt(p.x, p.z), p.z); if (p.hx || p.hz) ghost.g.rotation.y = Math.atan2(p.hx, p.hz); ghost.play(p.moving ? "run" : "idle", dt, 1.2) }
        } else if (ghost) ghost.g.visible = false
        target.set(mx, heightAt(mx, mz) * 0.5, mz)
        hintRing.position.set(mx, heightAt(mx, mz) + 0.02, mz)
      } else if (!fin) {
        // between runs she stands; on the splash, splashStep drives her instead
        mom.play("idle", dt, 1)
      }
      // ponds breathe
      if (waterMat) waterMat.opacity = 0.8 + Math.sin(t * 1.3) * 0.06
      // fireflies drift around wherever she is
      for (const f of flies) {
        const m = f.m
        m.position.x += Math.sin(t * f.sp + f.ph) * dt * 0.6; m.position.z += Math.cos(t * f.sp * 0.8 + f.ph) * dt * 0.6
        m.position.y = f.y + Math.sin(t * 1.7 + f.ph) * 0.25
        m.material.opacity = 0.35 + 0.55 * Math.max(0, Math.sin(t * 2.3 + f.ph * 3))
        const ddx = m.position.x - look.x, ddz = m.position.z - look.z
        if (ddx * ddx + ddz * ddz > 16 * 16) { m.position.x = look.x + (Math.random() - 0.5) * 22; m.position.z = look.z + (Math.random() - 0.5) * 22 }
        m.quaternion.copy(camera.quaternion)
      }
      // particles
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]; p.t += dt
        p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.m.position.y += p.vy * dt; p.vy -= 3.5 * dt
        p.m.rotation.x += dt * 4; p.m.rotation.y += dt * 3
        p.m.material.opacity = Math.max(0, 1 - p.t / p.life)
        if (p.t > p.life) { world.remove(p.m); puffs.splice(i, 1) }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]; r.t += dt
        r.m.scale.setScalar(r.size * (1 + r.t * r.speed)); r.m.material.opacity = Math.max(0, 0.9 - r.t * 1.6)
        if (r.t > 0.6) { world.remove(r.m); rings.splice(i, 1) }
      }
      for (let i = sprites.length - 1; i >= 0; i--) {
        const s = sprites[i]; s.t += dt
        const e = s.t / s.life
        s.s.position.y += s.rise * dt * (1 - e * 0.6)
        const pop = e < 0.15 ? e / 0.15 : 1
        s.s.scale.setScalar(s.size * (0.3 + 0.7 * pop) * (e > 0.7 ? 1 - (e - 0.7) / 0.3 * 0.4 : 1))
        s.s.material.opacity = e > 0.6 ? 1 - (e - 0.6) / 0.4 : 1
        if (e >= 1) { world.remove(s.s); s.s.material.dispose(); sprites.splice(i, 1) }
      }
      for (const p of prints) {
        if (p.t < 0) continue
        p.t += dt
        const e = p.t / p.life
        p.m.material.opacity = (p.life > 8 ? 0.75 : 0.35) * Math.max(0, 1 - e)
        if (e >= 1) { p.t = -1; p.m.visible = false }
      }
      const lead = momSpeed > 0.2 ? { x: Math.sin(momHeading) * 1.6, z: Math.cos(momHeading) * 1.6 } : { x: 0, z: 0 }
      placeCamera(dt, lead, t)
      renderer.render(scene, camera)
    },
    // for the splash: drive mom along a path of points
    splashStep(now, pts, nKits = 5) {
      if (!resize()) return
      const dt = Math.min(0.05, lastNow ? (now - lastNow) / 1000 : 0.016); lastNow = now
      const t = now / 1000
      const L = pts.length
      const u = (t * 0.22) % 1, k = u * L, i0 = Math.floor(k), f = k - i0
      const a = pts[i0 % L], b = pts[(i0 + 1) % L]
      const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f
      dropCrumb(x, z)
      mom.g.position.set(x, heightAt(x, z), z); mom.g.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1])
      mom.play("walk", dt, 1)
      if (mom.tail) mom.tail.rotation.y += Math.sin(t * 11) * 0.25
      printAcc += Math.sqrt((x - (mom.px || x)) ** 2 + (z - (mom.pz || z)) ** 2); mom.px = x; mom.pz = z
      if (printAcc > 0.45) { printAcc = 0; dropPrint(x, z, mom.g.rotation.y, false) }
      while (kits.length < nKits) { const kk = makeKit(kits.length); kk.g.visible = true; kk.hop = 1; kk.g.position.set(x, 0, z) }
      kits.forEach((kk, i) => { const g = trailAt(SPACING * (i + 1)); const side = kk.bias * 0.6 + kk.amp * 0.5 * Math.sin(t * kk.freq + kk.phase); const hl = Math.sqrt(g.hx * g.hx + g.hz * g.hz) || 1; kk.g.position.set(g.x - g.hz / hl * side, heightAt(g.x, g.z), g.z + g.hx / hl * side); if (g.hx || g.hz) kk.g.rotation.y = Math.atan2(g.hx, g.hz); kk.play("run", dt, 1.6); if (kk.tail) kk.tail.rotation.y += Math.sin(t * 9 + i) * 0.5 })
      for (const p of prints) { if (p.t < 0) continue; p.t += dt; p.m.material.opacity = 0.35 * Math.max(0, 1 - p.t / p.life); if (p.t >= p.life) { p.t = -1; p.m.visible = false } }
      for (const fl of flies) { fl.m.position.y = fl.y + Math.sin(t * 1.7 + fl.ph) * 0.25; fl.m.material.opacity = 0.35 + 0.55 * Math.max(0, Math.sin(t * 2.3 + fl.ph * 3)); fl.m.quaternion.copy(camera.quaternion); const ddx = fl.m.position.x - x, ddz = fl.m.position.z - z; if (ddx * ddx + ddz * ddz > 16 * 16) { fl.m.position.x = x + (Math.random() - 0.5) * 22; fl.m.position.z = z + (Math.random() - 0.5) * 22 } }
      target.set(x, 0, z)
      placeCamera(dt, { x: 0, z: 0 }, t)
      renderer.render(scene, camera)
    },
    destroy() {
      renderer.dispose()
      canvas.remove()
    },
  }
  // the den arrival, stepped from frame(): kit i leaves at i*0.14 s and takes ~0.5 s to reach the mouth and
  // vanish into it; she follows last; the glow swells; onDone fires 0.35 s after she is in
  function finaleStep(dt, t) {
    const e = t - fin.t0
    const n = kits.length
    const momAt = n * 0.14 + 0.25
    const goTo = (g, start, idx) => {
      const since = e - start
      if (since < 0) return false
      const p = g.position
      const dx = denMouth.x - p.x, dz = denMouth.z - p.z, d = Math.sqrt(dx * dx + dz * dz)
      if (d > 0.25) { const sp = Math.min(d, 4.2 * dt); p.x += dx / d * sp; p.z += dz / d * sp; p.y = heightAt(p.x, p.z) + Math.abs(Math.sin(t * 16)) * 0.08; g.rotation.y = Math.atan2(dx, dz); return false }
      return true
    }
    kits.forEach((k, i) => {
      if (fin.gone.has(i)) return
      if (goTo(k.g, i * 0.14, i)) { fin.gone.add(i); k.g.visible = false; puff(denMouth.x, 0.1, denMouth.z, 3, 0x6b4a2b, 0.5, 0.9); ring(denMouth.x, 0, denMouth.z, COL.glow, 0.5, 7); if (api.onKitHome) api.onKitHome(i) }
      else if (e >= i * 0.14) k.play("run", dt, 1.6); else k.play("idle", dt, 1)
      if (k.tail) k.tail.rotation.y += Math.sin(t * 9 + i) * 0.5
    })
    if (!fin.momIn) {
      if (goTo(mom.g, momAt, -1)) { fin.momIn = e; mom.g.visible = false; puff(denMouth.x, 0.1, denMouth.z, 5, 0x6b4a2b, 0.6, 1.0); ring(denMouth.x, 0, denMouth.z, COL.glow, 1, 6) }
      else mom.play(e >= momAt ? "run" : "idle", dt, 1.3)
      if (mom.tail) mom.tail.rotation.y += Math.sin(t * 9) * 0.4
    }
    denGlow.material.opacity += ((0.75 + 0.25 * Math.sin(t * 6)) - denGlow.material.opacity) * Math.min(1, dt * 6)
    denLight.intensity += ((fin.momIn ? 5 : 3) - denLight.intensity) * Math.min(1, dt * 4)
    target.set(den.position.x, 0, den.position.z)
    if (fin.momIn && e - fin.momIn > 0.35 && !fin.done) { fin.done = true; const cb = fin.onDone; fin = null; mom.g.visible = true; cb && cb() }
  }
  api.scene = scene
  if (/[?&]debug/.test(location.search)) window.__mgWorld = api
  return api
}

// Merged quads over a list of cells, each `size` of a cell, centred, lying flat.
function quads(cells, size) {
  const pos = [], idx = []
  cells.forEach(([x, z], i) => {
    const cx = x + 0.5, cz = z + 0.5, h = size / 2
    pos.push(cx - h, 0, cz - h, cx + h, 0, cz - h, cx + h, 0, cz + h, cx - h, 0, cz + h)
    const b = i * 4
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2)
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx); g.computeVertexNormals()
  return g
}

// Where a breadcrumb path ([x, z, tick]...) was at a tick, with the heading there; null before it starts
// or after it ends.
function pathAt(path, tick) {
  if (!path.length || tick < path[0][2]) return null
  if (tick >= path[path.length - 1][2]) return null
  let lo = 0, hi = path.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path[mid][2] <= tick) lo = mid; else hi = mid }
  const a = path[lo], b = path[hi]
  const span = (b[2] - a[2]) || 1, f = (tick - a[2]) / span
  const hx = b[0] - a[0], hz = b[1] - a[1]
  return { x: a[0] + hx * f, z: a[1] + hz * f, hx, hz, moving: span < 60 }
}

// A rigged Cube Pets animal: clips by name, a silhouette drawn only where she is hidden. `body` and
// `tail` are the rig's nodes, so the view can nose her down or wag on top of whatever clip is playing.
function actor(t, scale, silColor) {
  const g = new THREE.Group()
  const m = t.root.clone()
  m.scale.setScalar(scale)
  g.add(m)
  // silhouette: same geometry, same bones, drawn where the depth test fails. Opaque and ordered world (0) ->
  // silhouette (1) -> body (2), so only the WORLD can occlude it: a translucent one in the transparent pass
  // came after the body and showed her own legs through her flank.
  const silMat = new THREE.MeshBasicMaterial({ color: silColor, depthFunc: THREE.GreaterDepth, depthWrite: false })
  const adds = []
  m.traverse((o) => { if (o.isMesh) { adds.push(o); o.renderOrder = 2 } })
  for (const o of adds) { const s = new THREE.Mesh(o.geometry, silMat); s.renderOrder = 1; s.position.copy(o.position); s.rotation.copy(o.rotation); s.scale.copy(o.scale); o.parent.add(s) }
  const mixer = new THREE.AnimationMixer(m)
  const actions = {}
  for (const c of t.clips) actions[c.name] = mixer.clipAction(c)
  let cur = null
  return {
    g, m, mixer, body: m.getObjectByName("body") || null, tail: m.getObjectByName("tail") || null,
    play(name, dt, speed = 1) {
      const a = actions[name] || actions.idle
      if (a && a !== cur) { if (cur) cur.fadeOut(0.15); a.reset().fadeIn(0.15).play(); cur = a }
      if (cur) cur.timeScale = speed
      mixer.update(dt)
    },
  }
}
// A faint copy of her, for the ghost of a best run. No silhouette, no shadow.
function ghostActor(t, scale) {
  const g = new THREE.Group()
  const m = t.root.clone()
  m.scale.setScalar(scale)
  m.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }); o.castShadow = false; o.receiveShadow = false; o.renderOrder = 3 } })
  g.add(m)
  const mixer = new THREE.AnimationMixer(m)
  const actions = {}
  for (const c of t.clips) actions[c.name] = mixer.clipAction(c)
  let cur = null
  return { g, m, play(name, dt, speed = 1) { const a = actions[name] || actions.idle; if (a && a !== cur) { if (cur) cur.fadeOut(0.15); a.reset().fadeIn(0.15).play(); cur = a } if (cur) cur.timeScale = speed; mixer.update(dt) } }
}

// A burrow: an earth mound with a dark mouth and a tuft of grass. Built from kit pieces and two
// flat-shaded primitives in the kit's palette.
function burrow(models, s) {
  const g = new THREE.Group()
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55 * s, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: COL.earth, flatShading: true }))
  mound.scale.set(1, 0.75, 1); mound.castShadow = true; mound.receiveShadow = true
  g.add(mound)
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.26 * s, 20), new THREE.MeshBasicMaterial({ color: COL.hole }))
  mouth.position.set(0, 0.22 * s, 0.5 * s); mouth.rotation.x = -0.25
  g.add(mouth)
  const tuft = models["grass_large"].root.clone(); tuft.scale.setScalar(1.3 * s); tuft.position.set(-0.25 * s, 0.35 * s, -0.2 * s); g.add(tuft)
  const rock = models["rock_largeB"].root.clone(); rock.scale.setScalar(0.9 * s); rock.position.set(0.35 * s, 0.3 * s, -0.25 * s); rock.rotation.y = 0.8; g.add(rock)
  return g
}
