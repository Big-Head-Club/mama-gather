// Dev-only sink for the card: public/card.html?post=http://localhost:4899/card POSTs its rendered PNG here and it lands
// at themes/forest/card.png (or ?as=plate -> public/plate.jpg via the browser's own JPEG encode). Real GPU, no headless.
//   node tools/card-serve.mjs    then open http://localhost:4877/card.html?seed=11&ticks=700&viewH=7.5&post=http://localhost:4899/card
import http from "node:http"
import { writeFileSync } from "node:fs"
http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*"); res.setHeader("access-control-allow-headers", "*")
  if (req.method === "OPTIONS") { res.end(); return }
  const u = new URL(req.url, "http://x")
  const chunks = []
  req.on("data", (c) => chunks.push(c)).on("end", () => {
    const out = u.searchParams.get("as") === "plate" ? "public/plate.jpg" : "themes/forest/card.png"
    writeFileSync(out, Buffer.concat(chunks)); console.log("wrote", out, Buffer.concat(chunks).length); res.end("ok")
  })
}).listen(4899, () => console.log("card sink on :4899"))
