// Web Push, with no dependencies and no payload.
//
// A push with a body has to be encrypted to the subscription's keys (ECDH,
// HKDF, AES-GCM), which is a dependency or two hundred lines. A push WITHOUT a
// body needs only a signed VAPID token, so that is what Relay sends: an empty
// ping. The service worker wakes, asks /api/push.latest what to say, and shows
// it. Same notification, a tenth of the code.
//
// Keys: `node tools/vapid.mjs` prints VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
// VAPID_SUBJECT is a mailto: or the game's https origin (the default).

import { createPrivateKey, createPublicKey, sign } from "node:crypto"

const b64u = (buf) => Buffer.from(buf).toString("base64url")

export function vapidConfig(env = process.env, origin = "") {
  const publicKey = env.VAPID_PUBLIC_KEY || ""
  const privateKey = env.VAPID_PRIVATE_KEY || ""
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT || origin || "https://example.com" }
}

// The raw uncompressed P-256 public key (65 bytes, 0x04 || x || y) and the
// private scalar, as a KeyObject node:crypto can sign with.
function keyFrom({ publicKey, privateKey }) {
  const raw = Buffer.from(publicKey, "base64url")
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("VAPID_PUBLIC_KEY is not a raw P-256 public key")
  return createPrivateKey({
    key: { kty: "EC", crv: "P-256", x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)), d: privateKey },
    format: "jwk",
  })
}

export function publicKeyObject(publicKey) {
  const raw = Buffer.from(publicKey, "base64url")
  return createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)) }, format: "jwk" })
}

// The signed token a push service checks: audience is the push service's own
// origin, expiry at most 24h out (12h here), subject says who to complain to.
export function vapidToken({ endpoint, vapid, now = Date.now() }) {
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }))
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject }))
  const data = `${header}.${claims}`
  const sig = sign("sha256", Buffer.from(data), { key: keyFrom(vapid), dsaEncoding: "ieee-p1363" })
  return `${data}.${b64u(sig)}`
}

// One empty push. Resolves to { ok, gone, status }: `gone` (404/410) means the
// subscription is dead and should be forgotten, never retried.
export async function sendPush(subscription, { vapid, ttl = 86400, urgency = "normal", fetchImpl = globalThis.fetch, now } = {}) {
  const endpoint = subscription && subscription.endpoint
  if (!endpoint || !/^https:\/\//.test(endpoint)) return { ok: false, gone: true, status: 0 }
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      authorization: `vapid t=${vapidToken({ endpoint, vapid, now })}, k=${vapid.publicKey}`,
      ttl: String(ttl),
      urgency,
      "content-length": "0",
    },
  })
  return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status }
}
