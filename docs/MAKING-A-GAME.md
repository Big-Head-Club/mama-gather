# Making a game

```
node tools/new-game.mjs sixes "Sixes" ~/games/sixes
cd ~/games/sixes && node server.js
```

You now have a working daily game with a placeholder ruleset. Three files stand
between that and yours — and one that comes first.

## 0. `ASSUMPTIONS.md` — before any code

The scaffolder writes it. Answer everything not marked _auto_; `npm test` fails
until you do. It takes ten minutes and it is the only part of this process that
has ever saved anyone a week.

The two that get the laziest answers: **`independent-numbers`** (which of your
difficulty numbers are derived from the others — that trap has been sprung twice
in this collection) and **`still-fun-day-30`** ("it is randomised" is not an
answer; "nothing changes, this has a shelf life" is).

## 1. `src/game/game.rules.mjs` — pure

No DOM, no clock, no `Math.random`. The server imports this file and replays your
players' runs with it, which is the entire anti-cheat.

```js
create(seed)            -> state
apply(state, move)      -> state          // ignore illegal moves, never throw
events(state)           -> ["hit", …]     // one glyph key per beat, spoiler-safe
result(state, { seconds }) -> { metric, tiebreak, events, …display }
replay(seed, log)       -> state
PRACTICE_SEED                              // the hand-picked first-timer puzzle
```

`metric` is what the board ranks by, in the direction `relay.config.mjs` says.
`tiebreak` is always higher-is-better, so hand back `-seconds` for "faster wins".

## 2. `src/game/game.view.mjs` — the screen

```js
mount(root, { seed, mode, coach, finish }) -> { log, destroy() }
```

Build whatever you like into `root` — DOM, canvas, SVG. Push each move onto
`log`, run it through `apply`, and call `finish(state, result(state))` when it is
over. `mode` is `"daily" | "practice" | "gate"`; `coach` is true only for the
first-ever practice round, so say the quiet part out loud there and nowhere else.

Also export `glyphs` (the emoji for your strip) and `how` (three lines for the
help sheet — what to do, how you are scored, why the strip is safe to share).

## 3. `relay.config.mjs`

The metric, the epoch, the timezone, and the two share lines. `share.headline`
and `share.statLine` are the only copy that ends up on the unfurl card, so write
them last, when you know what a good run feels like.

## What you get without writing anything

Deep links and the archive (`/d/37`), crews (`?c=CODE`), a result-carrying share
link, a per-link unfurl card, the leaderboard, streaks, the first-run practice
gate, unlimited practice, the countdown to the next puzzle, anonymous identity,
optional names, offline tolerance, two themes, and server-side re-simulation of
every submitted run.

## Before you ship

- [ ] `npm test` is green — which means every assumption is answered and the
      checkable ones hold.
- [ ] `PUBLIC_ORIGIN` is set in production. Without it the unfurl is wrong.
- [ ] `DAILY_SALT` is set to something random, or your puzzles are precomputable.
- [ ] `epoch` is the day you actually launch.
- [ ] Paste the link into a real group chat and look at the card. Then finish a
      run, paste that link, and look at it again. They should be different.
- [ ] Play it once on a phone, one-handed, outdoors.
- [ ] Play it once with the server stopped.
- [ ] Answer the six gate questions at the end of `docs/BORROWED-LESSONS.md`
- [ ] Read `docs/DESIGN-LESSONS.md` §6 and check your `independent-numbers`
      answer still stands now that the game exists.
- [ ] Anything you got wrong on the way: `assume break` it, finish the `So:`
      line, and `assume promote` it back into the template. If nothing was
      learned, leave `LESSONS.md` empty and say so.

## The three doors

```
play with friends      TABLE   /t/<CODE>   a private board, right now
compete with strangers DAILY   /           one board a day, the world
go deep alone          QUEST   /quest      a chain of boards, a build
```

One idea under all three: **N submissions against a seeded world.** What changes
is who the N are, when it resolves, and what carries over.

|       | who         | resolves          | carries        |
|-------|-------------|-------------------|----------------|
| daily | everyone    | as each run lands | a streak       |
| table | a named few | as each run lands | nothing        |
| quest | you         | when you fail     | a build, marks |

A game opts in. Delete a line from `modes` and that door is gone from the front
page, the router and the API.

The front page is not a menu of the three. It is the daily with one **Play**
button; "Quest" (and "Play with friends", only if the game opts into `table`)
are small buttons under it. A front page that read
"Play with friends / Compete with strangers / Go deep alone" confused its own
author — nothing on it said play.

```js
modes: {
  daily: true,
  quest: { legs: 0, marks: 1 },
  // table: { seats: [2, 12], resolve: "parallel" },  // only if Mack asks
}
```

**Don't ship `table` unless Mack asks for it.** He found the "Play with
friends" and "Rejoin CODE" buttons confusing ("i dont know what it does"), so
the template's default `modes` leaves it out and it was removed from the games
that had it (2026-09-24). The code stays in src. If he does ask: table's default
`parallel` — everyone plays the same board alone and the scores are compared —
asks nothing of your rules that the daily did not already ask.
`resolve: "shared"` puts N players inside one simulation and needs rules that
genuinely support N sides; only claim it if they do.

**`quest` is not free.** It needs four pure functions and a list:

```js
export function questParams(leg, loadout)          // the board for this leg
export function questOffers(leg, loadout, rng)     // three {id,label,note}
export function applyOffer(loadout, id)            // pure, returns a loadout
export function loadoutFrom(unlocked)              // meta -> starting loadout
export const QUEST_UNLOCKS = [{ id, label, cost, note }]
```

and `create(seed, params)` has to accept the board those params describe. That
is the one real refactor: any number your rules keep at module scope (`SLOTS`,
`MAX_TRIES`, the roster) has to move into the state `create()` returns, because
a loadout cannot reach a module constant.

Two rules that keep it honest:

- **A loadout may not change the answer.** It changes what a board costs you,
  never what the board is. Break that and re-simulation stops being able to tell
  a build from a lie.
- **The curve has to outpace the best offer**, or the run gets easier the longer
  it goes and there is no reason to stop. Keyhole loses one try per leg, which
  exactly cancels a player who takes "+1 try" every single time — so holding
  even costs you every other choice.

**The server owns the seed and the params for every leg**, exactly as it owns
the daily's seed. A client cannot deal itself an easy board or a build it did
not earn.

### The thing to solve before quest ships

A quest save is the first thing in this template that **cannot be recomputed
from a seed and a log** — which was both the anti-cheat and the backup. The
identity behind it is a UUID in `localStorage`, so a cleared browser used to
cost a streak and can now cost thirty hours.

`player.claim` mints a code; `player.adopt` takes one. No account, no password,
no email. It is offered at the moment there is something to lose — after the
first run that banked marks — and never on arrival, which is the same instinct
that asks for a name only when it buys a row on the board.
