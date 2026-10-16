# Mama Gather

A daily game. Built on [Relay](https://github.com/Big-Head-Club/relay).

```
npm test          # assumptions + template tests
node server.js    # http://localhost:3000
```

- `ASSUMPTIONS.md` — what this game is assuming. `npm test` fails while any of it
  is unanswered. Answer it before writing code.
- `LESSONS.md` — what it turned out to be wrong about. Often empty, and that is
  fine.
- `src/game/game.rules.mjs` — the rules. Pure: no DOM, no clock, no
  `Math.random`. The server replays submitted runs with it.
- `src/game/game.view.mjs` — the screen.
- `relay.config.mjs` — name, day boundary, metric, share lines, and credits:
  add every pack, font, sound and person you use. `npm test` fails without it.
- `docs/DESIGN-LESSONS.md` — read it. Then `docs/BORROWED-LESSONS.md`: what other
  people's games taught them, cut to what fits a daily, with the gate questions it adds.

Production needs `PUBLIC_ORIGIN` (absolute, or the unfurl is wrong),
`DAILY_SALT` (or tomorrow is precomputable) and somewhere to keep the board:
`DATABASE_URL` (a Neon URL, no install needed; the app creates its own table on
boot) before the game is posted anywhere public, or `SAVE_PATH` on a volume for a
prototype. Without either, the leaderboard dies with the container.
`node tools/store-roundtrip.mjs` proves the database really round-trips.
