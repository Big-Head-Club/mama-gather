// A theme is a folder. Loading one on the server is only about the handful of
// colours the unfurl card needs; the browser gets the rest as CSS custom
// properties, which is why a theme can be swapped without touching any code.

import { readFile } from "node:fs/promises"
import { join } from "node:path"

const FALLBACK = { ground: "#f2e6cf", ink: "#14110e", inkDim: "#6b6152", accent: "#b8281c" }

export async function loadTheme(root, name) {
  try {
    const t = JSON.parse(await readFile(join(root, "themes", name, "theme.json"), "utf8"))
    // The card block wins over colors: it exists so the unfurl card can take its
    // palette from the art (npm run brand) without touching the page theme.
    return Object.assign({}, FALLBACK, t.colors || {}, t.card || {})
  } catch {
    return FALLBACK
  }
}
