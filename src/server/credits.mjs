// Where a game's credits live: credits.json beside relay.config.mjs if there is
// one, otherwise the `credits` block in the config. The same rule steam-shell
// uses, so a game writes its credits once and both hosts show them.

import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

export async function loadCredits(root, config) {
  const file = join(root, "credits.json")
  if (existsSync(file)) {
    try { return JSON.parse(await readFile(file, "utf8")) } catch (e) { throw new Error(`credits.json is not valid JSON: ${e.message}`) }
  }
  return (config && config.credits) || null
}
