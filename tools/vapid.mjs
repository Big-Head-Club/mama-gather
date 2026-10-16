// Make the key pair Web Push needs. Once per game, then set both on the service.
//
//   node tools/vapid.mjs
//   railway variables --set VAPID_PUBLIC_KEY=... --set VAPID_PRIVATE_KEY=...
//
// Never change them after launch: every existing subscription is bound to the
// public key, and a new pair silently orphans all of them.

import { generateKeyPairSync } from "node:crypto"

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
const pub = publicKey.export({ format: "jwk" })
const priv = privateKey.export({ format: "jwk" })
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")])

console.log(`VAPID_PUBLIC_KEY=${raw.toString("base64url")}`)
console.log(`VAPID_PRIVATE_KEY=${priv.d}`)
console.log(`# optional: VAPID_SUBJECT=mailto:you@example.com  (defaults to the game's origin)`)
