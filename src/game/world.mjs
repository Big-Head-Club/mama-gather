// The 3D forest. three.js with an orthographic isometric camera. Builds a level once (instanced
// ground, trees, rocks, fences, decoration; one group per spot so it can rustle), then each frame
// moves mom, strings the kits out along her breadcrumb trail, follows her with the camera and
// renders. The sim never sees any of this: positions come in, pictures go out.

import * as THREE from "/vendor/three.module.js"
import { GLTFLoader } from "/vendor/GLTFLoader.js"
import { PROPS3D } from "./props3d.data.mjs"
import { C, heightOf, cellAt, rampUp, HINT, PICKUP } from "./sim.mjs"
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

const COL = { field: 0x157a3a, deep: 0x0b3d1e, sky: 0xcfe9ff, hole: 0x1a0d05, earth: 0x8a5a2b, line: 0xfff1c7, baby: 0xffb15e, glow: 0xffd23f }

// ---- the world ---------------------------------------------------------------------------------

export async function makeWorld(host, lv, { splash = false, lookOpts = {} } = {}) {
  const canvas = document.createElement("canvas")
  canvas.className = "mg-canvas"
  host.prepend(canvas)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = !/noshadow/.test(location.search)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COL.deep)

  // near/far hug the scene: a 300-unit depth range made the block tops (grass slab over dirt cube,
  // coplanar) z-fight and come out brown
  const CAM_D = 40
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAM_D - 30, CAM_D + 40)
  let viewH = lookOpts.viewH || 15          // metres visible top to bottom on a portrait phone
  let camDir = new THREE.Vector3(1, lookOpts.camLift || 1, 1).normalize()
  camera.position.copy(camDir).multiplyScalar(CAM_D)
  camera.lookAt(0, 0, 0)

  scene.add(new THREE.HemisphereLight(COL.sky, 0x3a6b2a, 1.1))
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0)
  sun.position.set(-6, 14, 5); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const SR = 20
  sun.shadow.camera.left = -SR; sun.shadow.camera.right = SR; sun.shadow.camera.top = SR; sun.shadow.camera.bottom = -SR
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04
  scene.add(sun); scene.add(sun.target)

  // the forest floor beyond the level
  const beyond = new THREE.Mesh(new THREE.PlaneGeometry(lv.w * 4, lv.h * 4), new THREE.MeshLambertMaterial({ color: COL.deep }))
  beyond.rotation.x = -Math.PI / 2; beyond.position.set(lv.w / 2, -0.06, lv.h / 2); beyond.receiveShadow = true
  scene.add(beyond)

  const world = new THREE.Group(); scene.add(world)
  const species = SPECIES[lv.species] || SPECIES.fox

  // --- load everything we need
  const need = new Set(["ground_grass", "cliff_block_rock", "cliff_blockSlope_rock", "fence_simple", "fence_simpleLow", "cliff_cave_rock", "rock_largeB", "grass_large", "animal-" + species.mom, ...TREES, ...ROCKS, ...DECOR])
  for (const s of SPOT_MODELS[lv.species] || SPOT_MODELS.fox) if (s.key !== "burrow") need.add(s.key)
  const models = {}
  await Promise.all([...need].map((k) => loadModel(k).then((t) => { models[k] = t })))

  // --- instanced statics
  const cell = (x, z) => lv.grid[z * lv.w + x]
  const batches = new Map()   // key -> matrices[]
  const put = (key, m) => { (batches.get(key) || batches.set(key, []).get(key)).push(m) }
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3()
  const place = (key, x, z, y, s, rotY) => { P.set(x, y, z); Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY); S.set(s, s, s); M.compose(P, Q, S); put(key, M.clone()) }
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
    place("ground_grass", cx, cz, 0, 1, 0)
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
      im.castShadow = key !== "ground_grass"; im.receiveShadow = true; im.frustumCulled = false
      const tmp = new THREE.Matrix4()
      mats.forEach((m, i) => { tmp.multiplyMatrices(m, p.m); im.setMatrixAt(i, tmp) })
      im.instanceMatrix.needsUpdate = true
      world.add(im); instanced.push(im)
    }
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
    world.add(g); spotGroups.push({ g, sp, rustleAt: -1, phase: h32(sp.x, sp.z, 9) * 2 })
  }
  // --- the den: a big burrow, lit when the line is complete
  const den = new THREE.Group(); den.position.set(lv.exit[0] + 0.5, 0, lv.exit[1] + 0.5)
  den.add(burrow(models, 1.7))
  const denGlow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 40), new THREE.MeshBasicMaterial({ color: COL.glow, transparent: true, opacity: 0, depthWrite: false }))
  denGlow.rotation.x = -Math.PI / 2; denGlow.position.y = 0.03; den.add(denGlow)
  const denLight = new THREE.PointLight(COL.glow, 0, 6); denLight.position.y = 0.8; den.add(denLight)
  world.add(den)

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
    return k
  }
  const t_ = () => performance.now() / 1000

  // hint ring (toggle) and debug rings
  const hintRing = new THREE.Mesh(new THREE.RingGeometry(HINT - 0.08, HINT, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }))
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
      const r2 = new THREE.Mesh(new THREE.RingGeometry(HINT - 0.05, HINT, 48), new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.25, depthWrite: false, depthTest: false }))
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

  // --- particles: little leaf puffs and join rings
  const puffs = []
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.16)
  const leafMat = new THREE.MeshBasicMaterial({ color: 0x8fd37a, side: THREE.DoubleSide, transparent: true })
  function puff(x, y, z, n = 6, color) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(leafGeo, color ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true }) : leafMat.clone())
      m.position.set(x + (Math.random() - 0.5) * 0.6, y + 0.3 + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.6)
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0)
      world.add(m)
      puffs.push({ m, vx: (Math.random() - 0.5) * 1.2, vy: 1.2 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.2, t: 0, life: 0.7 + Math.random() * 0.4 })
    }
  }
  const rings = []
  function ring(x, y, z, color = COL.glow) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }))
    m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.05, z); world.add(m); rings.push({ m, t: 0 })
  }

  // --- camera framing
  let w = 0, h = 0
  function resize() {
    const r = host.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    if (r.width !== w || r.height !== h) {
      w = r.width; h = r.height
      renderer.setSize(w, h, false)
      const portrait = h >= w
      const vh = portrait ? viewH : viewH * 0.78
      const aspect = w / h
      camera.top = vh / 2; camera.bottom = -vh / 2; camera.left = -vh / 2 * aspect; camera.right = vh / 2 * aspect
      camera.updateProjectionMatrix()
    }
    return true
  }
  const target = new THREE.Vector3(lv.start[0] + 0.5, 0, lv.start[1] + 0.5)
  const look = target.clone()
  function placeCamera(dt, lead) {
    const k = 1 - Math.exp(-dt * 6)
    look.lerp(new THREE.Vector3(target.x + lead.x, target.y, target.z + lead.z), k)
    camera.position.copy(look).addScaledVector(camDir, CAM_D)
    camera.lookAt(look)
    sun.position.set(look.x - 6, 14, look.z + 5); sun.target.position.copy(look)
  }
  // screen vector -> ground-plane world vector, from the camera's basis
  function toWorld(sx, sy) {
    const right = new THREE.Vector3(); const up = new THREE.Vector3()
    camera.updateMatrixWorld()
    right.setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize()
    up.setFromMatrixColumn(camera.matrixWorld, 1); up.y = 0; up.normalize()
    return [right.x * sx - up.x * sy, right.z * sx - up.z * sy]
  }

  // --- per-frame
  let lastNow = 0, lastRustleCheck = 0, stepAcc = 0, idleSince = 0
  let momHeading = Math.PI, momSpeed = 0
  const api = {
    ready: Promise.resolve(),
    toWorld, resize, showDebug, puff, ring,
    get camera() { return camera },
    setHintRing(on) { hintRing.visible = !!on },
    setLook(o) { if (o.viewH) { viewH = o.viewH; w = 0 } if (o.camLift) { camDir = new THREE.Vector3(1, o.camLift, 1).normalize() } },
    // att: the sim's attempt (x, z, got, done...), hints: spot indexes rustling right now
    frame(now, { att, hintSpot = -1, events = null } = {}) {
      if (!resize()) return
      const dt = Math.min(0.05, lastNow ? (now - lastNow) / 1000 : 0.016); lastNow = now
      const t = now / 1000
      // mom
      let mx = mom.g.position.x, mz = mom.g.position.z
      if (att) {
        const dx = att.x - mx, dz = att.z - mz
        const moved = Math.sqrt(dx * dx + dz * dz)
        momSpeed = moved / dt
        if (moved > 0.001) { momHeading = Math.atan2(dx, dz); idleSince = t; dropCrumb(att.x, att.z) }
        mx = att.x; mz = att.z
        mom.g.position.set(mx, heightAt(mx, mz), mz)
        // turn smoothly
        let dh = momHeading - mom.g.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI
        mom.g.rotation.y += dh * Math.min(1, dt * 14)
        mom.play(momSpeed > 2.2 ? "run" : momSpeed > 0.15 ? "walk" : "idle", dt, momSpeed > 2.2 ? 1.3 : 1)
        stepAcc += moved
        if (stepAcc > 1.1 && momSpeed > 0.5) { stepAcc = 0; if (events) events.step() }
        // kits: one per collected baby, in order
        while (kits.length < att.got.length) {
          const k = makeKit(kits.length)
          const sp = lv.spots[att.got[kits.length - 1]]
          k.g.visible = true; k.g.position.set(sp.x + 0.5, (sp.raised || 0) + 0.2, sp.z + 0.5)
          k.hop = 0
          puff(sp.x + 0.5, sp.raised || 0, sp.z + 0.5, 8)
          ring(sp.x + 0.5, sp.raised || 0, sp.z + 0.5)
          if (events) events.kit(kits.length)
        }
        while (kits.length > att.got.length) { const k = kits.pop(); world.remove(k.g) }
        const idle = t - idleSince > 1.0 && momSpeed < 0.1
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
            k.g.scale.setScalar(momScale * 0.42 * (0.6 + 0.4 * e))
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
            kp.x += k.vx * dt; kp.z += k.vz * dt; kp.y = gy
          }
          const ks = Math.sqrt(k.vx * k.vx + k.vz * k.vz)
          const hx = idle ? mx - kp.x : (ks > 0.3 ? k.vx : goal.hx), hz = idle ? mz - kp.z : (ks > 0.3 ? k.vz : goal.hz)
          if (hx || hz) { let dh = Math.atan2(hx, hz) - k.g.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; k.g.rotation.y += dh * Math.min(1, dt * 9) }
          k.play(ks > 0.35 ? "run" : "idle", dt, 1.3 + ks * 0.15)
        })
        // the den lights when the line is complete
        const complete = att.got.length === lv.babies.length && lv.babies.length > 0
        denGlow.material.opacity += ((complete ? 0.55 + 0.25 * Math.sin(t * 5) : 0) - denGlow.material.opacity) * Math.min(1, dt * 6)
        denLight.intensity += ((complete ? 2.5 : 0) - denLight.intensity) * Math.min(1, dt * 4)
        // rustles: a spot with a baby, inside the hint radius, every ~2 s; the stuck-assist spot from anywhere
        for (const sg of spotGroups) {
          const i = lv.spots.indexOf(sg.sp)
          const hasBaby = lv.babies.indexOf(i) >= 0 && att.got.indexOf(i) < 0
          const dx = sg.sp.x + 0.5 - mx, dz = sg.sp.z + 0.5 - mz
          const near = dx * dx + dz * dz <= HINT * HINT
          const due = hasBaby && (near || hintSpot === i) && t - sg.rustleAt > 2.0 + sg.phase * 0.3
          if (due && !REDUCED) { sg.rustleAt = t; sg.phase = Math.random(); puff(sg.g.position.x, sg.g.position.y, sg.g.position.z, 4); if (events) events.rustle(dx) }
          const age = t - sg.rustleAt
          if (sg.rustleAt >= 0 && age < 0.55) {
            const e = 1 - age / 0.55
            sg.g.rotation.z = Math.sin(age * 40) * 0.12 * e
            sg.g.scale.set(1 + Math.sin(age * 30) * 0.06 * e, 1 + Math.abs(Math.sin(age * 22)) * 0.14 * e, 1 + Math.sin(age * 40) * 0.06 * e)
          } else { sg.g.rotation.z = 0; sg.g.scale.set(1, 1, 1) }
        }
        target.set(mx, heightAt(mx, mz) * 0.5, mz)
        hintRing.position.set(mx, heightAt(mx, mz) + 0.02, mz)
      } else {
        // splash: she trots a loop with her kits
        mom.play("walk", dt, 1)
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
        r.m.scale.setScalar(1 + r.t * 6); r.m.material.opacity = Math.max(0, 0.9 - r.t * 1.6)
        if (r.t > 0.6) { world.remove(r.m); rings.splice(i, 1) }
      }
      const lead = momSpeed > 0.2 ? { x: Math.sin(momHeading) * 1.6, z: Math.cos(momHeading) * 1.6 } : { x: 0, z: 0 }
      placeCamera(dt, lead)
      renderer.render(scene, camera)
    },
    // for the splash: drive mom along a path of points
    splashStep(now, pts) {
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
      while (kits.length < 5) { const kk = makeKit(kits.length); kk.g.visible = true; kk.hop = 1; kk.g.position.set(x, 0, z) }
      kits.forEach((kk, i) => { const g = trailAt(SPACING * (i + 1)); kk.g.position.set(g.x, heightAt(g.x, g.z), g.z); if (g.hx || g.hz) kk.g.rotation.y = Math.atan2(g.hx, g.hz); kk.play("run", dt, 1.6) })
      target.set(x, 0, z)
      placeCamera(dt, { x: 0, z: 0 })
      renderer.render(scene, camera)
    },
    // a top-down picture of the level for the result card (canvas 2D is used instead; see view)
    destroy() {
      renderer.dispose()
      canvas.remove()
    },
  }
  api.scene = scene
  if (/[?&]debug/.test(location.search)) window.__mgWorld = api
  return api
}

// A rigged Cube Pets animal: clips by name, a silhouette drawn only where she is hidden.
function actor(t, scale, silColor) {
  const g = new THREE.Group()
  const m = t.root.clone()
  m.scale.setScalar(scale)
  g.add(m)
  // silhouette: same geometry, same bones, drawn where the depth test fails
  const silMat = new THREE.MeshBasicMaterial({ color: silColor, transparent: true, opacity: 0.55, depthFunc: THREE.GreaterDepth, depthWrite: false })
  const adds = []
  m.traverse((o) => { if (o.isMesh) adds.push(o) })
  for (const o of adds) { const s = new THREE.Mesh(o.geometry, silMat); s.renderOrder = 10; s.position.copy(o.position); s.rotation.copy(o.rotation); s.scale.copy(o.scale); o.parent.add(s) }
  const mixer = new THREE.AnimationMixer(m)
  const actions = {}
  for (const c of t.clips) actions[c.name] = mixer.clipAction(c)
  let cur = null
  return {
    g, mixer,
    play(name, dt, speed = 1) {
      const a = actions[name] || actions.idle
      if (a && a !== cur) { if (cur) cur.fadeOut(0.15); a.reset().fadeIn(0.15).play(); cur = a }
      if (cur) cur.timeScale = speed
      mixer.update(dt)
    },
  }
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
