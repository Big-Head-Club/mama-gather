# What forty-odd games taught us

Everything here was paid for. Each item names the game it came from so you can go
and look. Read it once before your first Relay game and again when one is not
working.

Its sibling, [`BORROWED-LESSONS.md`](BORROWED-LESSONS.md), is what *other* people's
games paid for — Slay the Spire, Hades, Balatro, Hollow Knight and others — cut to
what still holds for a short game played from a link.

---

## 1. The link is the product

You are not building a game with a share button. You are building **a link that
survives a group chat**, and the game is what happens after someone taps it.

> **SUPERSEDED IN PART, 2026-09-28 (Mack, Finn's Game):** the unfurl IMAGE carries no words.
> No title, day number, score or "one a day / no sign-in" on it, and og:title is the game's
> name only; the chat prints that name under the picture, so the picture is just the best art
> the game has, full bleed. Results travel in the share TEXT. The per-link scoreboard card
> described below is now opt-in (`share.textCard: true`) and ship-check's `og-plain` fails
> a game that renders one. The rest of this section (absolute URL, raster, 1200x630, cache
> behaviour) still holds.

**The single biggest miss across the whole collection:** almost every game shipped
one static `og.png` with the production URL hardcoded into the HTML. Gorgon,
Atalanta, newphonewhodis, daily-maze, patient-zero, SPOTTED 3D — all of them show
the identical picture whether you are announcing the game or posting a 6/6.

A card that says *"Keyhole — a new lock every day"* tells the chat a game exists.
A card that says **"OPENED IN 2 · 2/6 · 41s"** is a scoreboard nobody has to open,
and it is the reason the next person taps. Relay renders the card per link, from
a token in the URL, with no database lookup — so it works for practice runs, crew
runs and archived days too.

Hard-won details:

- **`og:image` must be an absolute URL.** Scrapers do not resolve relative paths.
  This is written in a comment in newphonewhodis because it cost an afternoon.
- **Scrapers do not run JavaScript.** Meta tags set from client code do not
  exist. Relay renders them server-side per URL, which is why `/d/37?r=…` has a
  different title from `/`.
- **Chat clients cache the first card they saw for a URL, sometimes forever.**
  Vary the URL, not the image.
- **1200×630, and keep the type inside a 90px margin** — X, Slack, Discord and
  iMessage all crop differently inside that box.
- **Bake the text into the pixels.** Most clients show the image and truncate
  the description to one line.
- Ship `og:image:width`/`height` or Slack and Discord render a thumbnail.
- **Every band on the card has to shrink to fit, including the title.** The
  title band was pinned at scale 10, which is fine for KEYHOLE and drops the day
  number clean off the right edge of GRANDMA'S WATCHING — and the day number is
  half the point, because it is what tells the chat which puzzle is being
  discussed. Same for the tagline, which is the announce card's headline: past
  about twenty characters it runs out of room at the smallest scale there is.
- **The card face is a 5x7 bitmap and a character it does not have draws
  nothing while still advancing the cursor** — a silent hole in the middle of a
  number. It had no `%`, no comma, no question mark. Anything a game prints on
  the card has to be in `src/server/font.mjs`, and `test/relay.test.mjs` in
  Grandma's Watching asserts it rather than trusting it.

## 2. The share text has four lines and the last one is the link

Title, one stat line, the strip, the link. That is the whole format and it is not
a stylistic preference: chat clients collapse tall messages, and the link is what
you are actually sending. Put anything after the URL and some clients stop
auto-linking it.

**Vary the glyph, not just the hue.** A strip of five different coloured squares
is a worse strip than squares, circles and dots. Some of your players cannot tell
your green from your red, and all of your players are looking at a phone
outdoors.

**No hashtags. No emoji in the title.** The strip is the visual.

### The spoiler test you want is not the one you will write first

The obvious test is "no strip should identify a single puzzle". We wrote it, and
it fails on Keyhole — enumerate all 360 locks against a fixed pair of guesses and
three strips map to exactly one lock.

It is the wrong test. The reader does not know which guesses you made, so the
mapping they would need runs through your private moves. The property that
actually matters is that **the strip is a function of the feedback alone** — if a
glyph ever varies with *which* pieces were involved, the strip becomes a channel
back to the answer. That is the assertion in `test/relay.test.mjs`, and it is the
one worth copying.

## 3. Decide the day boundary on purpose

Three games in this collection each picked a different one and never discussed it:
Vine Drop uses UTC, daily-maze uses `America/Los_Angeles`, Tidbits shifts by the
player's own offset.

- **One global boundary** → everyone races the same puzzle at the same instant.
  Berlin can spoil Vancouver, and the chat is always talking about one puzzle.
- **Per-player boundary** → nobody is ever spoiled, and the chat is incoherent,
  because "today's" means a different puzzle for each person in it.

A link you paste into a group chat wants the first one. Relay defaults to a single
global boundary and lets you move it, so the day flips at a civilised hour for
wherever most of your players are rather than at 00:00 UTC, which is mid-afternoon
in California.

And **ship the countdown.** Every daily needs "next puzzle in 4:21:07" and half of
them forgot it.

## 4. Never let the first daily be the tutorial

A daily gives a player one attempt. If they spend it working out what the buttons
do, they have had a bad time on the only puzzle they get, and they do not come
back tomorrow.

`practiceGate: true` gives a first-time player one throwaway round before their
first real one — a hand-picked puzzle, not a random one, that rewards the exact
thinking the game is about — and says plainly that it did not count. It costs
about twenty lines and it is the highest-value screen in the template.

Keep unlimited practice on random seeds afterwards, and make practice runs
**visibly** unscored. A practice run that quietly submits is worse than no
practice at all.

## 5. Crews: the group chat gets its own puzzle

Six characters in the query string salt the daily seed. Open the plain link and
you play World, the same puzzle as everyone; open `?c=K7RM2P` and your group is
playing a puzzle nobody outside the chat has ever seen.

No rooms, no lobbies, no database rows, no realtime. This was invented for the
Emojivas games and it should have been in every daily since. It is the cheapest
possible answer to "prospers in the group chat but does not require it".

Codes use an alphabet with no `I`, `O`, `L`, `0` or `1`, because they get read
aloud and retyped.

## 6. Balance: the dial you think you have may be derived

The Vine Drop spec listed "active tomatoes on the vine" (5 → 22) as the difficulty
dial. It is not a dial. A tomato sits on the vine for four ripening stages and
then drops, so **count = drop rate × lifetime**. Holding 22 at the late-game
stage durations meant about seven drops a second — unplayable by an order of
magnitude, and invisible until it was simulated.

Before you tune anything, write down which of your numbers are independent.

Then:

- **Build a bot harness and handicap it.** `test/balance.mjs` in Vine Drop plays
  with a bot that can only see the viewport, has a reaction time and cannot tap
  faster than a thumb. Without the handicaps a bot tells you nothing.
- **Bots play about one tier above the human of the same name**, because they have
  perfect information about where the trouble is. Read "bot novice" as "a decent
  human".
- **Never plateau.** Vine Drop's curve flattened after three minutes and strong
  players rode the ten-minute cap instead of dying. Every curve needs to keep
  climbing past where you think anyone will get.
- **Some parameters are cliffs, not dials.** Slime Tide's purge radius has no
  useful middle setting. Test the ends before you tune the middle.
- **Check that the game can end.** Detritus, as specified, could not terminate.
- Treat every number as wrong until a person has played it. The harness tells you
  the shape of the curve; it does not tell you whether the game is fun.

## 7. Verification: verify the metric, not the flourish

If your rules file is pure — no DOM, no clock, no `Math.random` — the client can
submit **the moves it made** instead of the score, and the server replays them.
That is not a feature you add later; it is a property you keep from the first
line, and it is free.

- **Rank on the thing you can prove.** Keyhole re-simulates the number of tries
  and treats the clock as a claim, used only as a tiebreak, clamped to an hour.
- **An illegal move in a replayed log must be ignored, not thrown.** A tampered
  log should end in a different score, never in a 500.
- **Store the log.** It is a few kilobytes and it buys re-verification, ghost
  replays and the ability to answer "what actually happened".
- A test that asserts a run cannot exceed its own limits catches more real bugs
  than any anti-cheat.

Determinism is worth testing directly: same seed a thousand times, and a diff of
browser output against Node output. Vine Drop's are byte-identical, and knowing
that is what lets the server reject a score without a second thought.

## 8. Mobile first, laptop respectable

The link arrives on a phone. Almost always. But people do open these on a laptop,
and a phone screenshot floating in grey looks like a mistake.

**The game is the window.** This section used to prescribe a fixed 10:16 box,
framed and centred, with the name above it. On a laptop that read as a mockup of
a phone app with the title printed twice (SING BACK, 2026-09-12). The stage now
fills the window with no frame, and the name is said once. What the box bought —
the same rectangle for every player — belongs to the play surface: content sits
in one centred column (`--play-max`), so a board is the same shape on every
device. A game whose fairness truly needs the identical box sets
`stage: "fixed"`.

The rule that decides whether an idea belongs here at all:

> **If it needs a keyboard, it is not a link game.**

Keyboard input is an accelerant, never a requirement. No hover states. No
right-click. Hit targets of 44px or more — this is being played one-handed,
probably while walking. daily-maze had to ship different boards for mouse and
touch; that is a warning, not a pattern to copy.

## 9. Identity last

No sign-in, no splash, no cookie banner, no "are you sure". An anonymous id in
`localStorage` is enough to run a leaderboard and a streak.

Ask for a name **once**, at the moment it buys something — after their first
scored run, when the rank is already on screen — and let them decline. A game
that asks who you are before it will let you play has lost most of the people who
tapped the link.

## 10. It has to work when the server does not

The game must be fully playable with the API down; the score simply does not
post. Every screen in Relay degrades to "offline — playing unscored" rather than
to a spinner. A daily that white-screens during a deploy is a daily people stop
opening.

## 11. Art, cheaply and consistently

The full Midjourney pipeline lives in `tools/`. The parts that generalise:

- **Lock style by removing the variable that varies, not by adding a reference.**
  `--sref` hijacks colour: a style reference with a strong accent forces that
  accent onto everything downstream and silently discards the ink you asked for.
  An identical locked suffix with one thing changing gives a real set.
- **Delete the environment.** Naming terrain in a character prompt makes the model
  spend the character's colours on sky and grass. "Plain flat background, no
  scenery" fixes both consistency and palette in one pass.
- **A grid of four is one subject from four angles, not four similar subjects.**
  To get two people who look alike, submit the same description twice.
- **For cutouts, shoot on saturated cobalt and key by flooding in from the frame
  edge** — a plain colour threshold eats the dark side of a dark subject, because
  a black object photographed on blue reflects blue. `tools/cutout.mjs`.
- Photographs read as expensive and cost the same as anything else. But **scrim
  them hard** behind type: a card is a place to read a number.

## 12. Scope is the whole game

Whatever you are building — one game you will run for years, or the twelfth one
this month — the constraint is the same: the thing has to survive the days you do
not feel like it. So:

- **No build step, no dependencies.** The browser imports the same modules the
  server does. Nothing to install, nothing to break in a year.
- **One file to edit.** `relay.config.mjs` plus a rules/view pair.
- **Two files of game.** If your rules file is over about 200 lines, the idea is
  probably two ideas.
- The primitives are already built. Every hour spent rebuilding a leaderboard is
  an hour not spent on the one thing that makes the game yours.
- **A game you ship and keep running beats three you abandon.** The archive, the
  streak and the countdown are all bets on the game still being there in six
  weeks; if you are not making that bet, turn them off rather than half-running
  them.

## 13. Smaller things that were each learned the hard way

- **Sweep the dead objects in the same tick they die**, or the renderer draws a
  caught thing for one more frame and the game feels laggy.
- **Pause on tab-hidden rather than catching up.** Simulating forty seconds in one
  frame is a death the player never saw.
- **A tap outside the play box is not a tap.** Otherwise a letterboxed screen
  lets a player produce input the server will reject, voiding an honest run.
- **Emoji in generated art prompts is unreliable** — describe the glyph in words.
- **Commit as you go.** Stage named paths; never `git add -A`.
- **Never hand someone a `/var/folders` path.** Save into the project and give a
  link they can click.

---

### From Kim's Game (2026-08-21)

#### note

The Relay host tore the game down before reading its input log. screenResult() calls clearStage() (which nulls `live`) and only then read `live?.log`, falling back to `state.guesses` — Keyhole's own shape. Every other game on the template therefore submitted an empty log, was rejected as a metric mismatch, and had the player FLAGGED for cheating on a completely honest run. Snapshot the log inside finish(), while the instance is still mounted.

#### note

A change-blindness game has two kinds of change and they are not on the same difficulty scale. A thing appearing on bare shelf and a gap opening where a thing was are both changes to the LAYOUT: they pop out of a glance and need no memory of what anything is. A thing turning into a different thing changes no layout at all, so it can only be found by naming objects one at a time against memory. The spec ordered them ADD < SWAP < REMOVE and the balance sim said ADD = REMOVE << SWAP, which moved REMOVE from round 10 to round 4 and made the late game SWAP-dominant. Model the glance separately from the fixation or you will tune the on-ramp to fix a bug in your bot.

#### note

Put anatomy under your bot's handicaps. The first pass at Kim's Game's harness let its strong bot re-check seven objects a second; an eye makes four or five fixations a second and cannot identify an object without one, so that bot was not a tier above a good player, it was a different species — and it reported the whole late ladder as solved. Every tier of bot cleared 15 rounds and the numbers looked fine. A handicap with no physical floor under it is a handicap you will quietly tune away when the answer is inconvenient.

#### note

Relay's unfurl card shrank its headline to fit and pinned its stat tiles at one size. That is invisible while a game's stats are two-digit numbers, and slices the last tile in half the moment one of them is a WORD — a tier name, a theme, a difficulty. Kim's Game's second tile is the day's shelf ('Windowsill') and it ran 170px off the right edge of the card. Anything on a card that a game supplies has to shrink to fit; the card is 1200px and the game author cannot see it from relay.config.mjs.

---

### From Grandma's Watching (2026-08-21)

#### independent-numbers

**Assumed:** Which of your difficulty numbers are actually independent, and which are derived from the others?

**What actually happened:** The balance sim confirmed the viewport is not a dial (3.68 -> 3.38 across a 2.6x size range, and SMALLER scores slightly BETTER, the opposite of the spec). But it also killed my own replacement dial: watch seconds are flat-to-negative (3.74 at 20s, 3.60 at 45s, 3.31 at 90s), because a fixed memory decays and a longer watch just adds interference. The real dial is how busy the street is, and the only lever the PLAYER has is where they point.

**So:** in an observation game, neither the size of the window nor the length of
the look is a difficulty dial. Both feel like dials because they are the two
numbers on the screen. What is actually scarce is **how many things a person can
hold**, and that is a property of the person, not of the game — so the only
numbers you control are **how many things are out there** and **how many of the
questions are about the part you told them to watch**. Tune those two and leave
the timer alone; the timer is a session-length device and a reason nobody can
take notes, and it should be chosen for feel.

The corollary is the useful half: a longer look makes a bot *worse*, because
everything new it takes in evicts something it had. That is not a bug in the
model, it is why "do not stare at one thing, dear" and "do not fixate" are both
in the game's copy, and it is why the second-best strategy is to stop looking
once you are full.

#### The duel sim was measuring the route, not the strategy

**What happened:** the first duel gave each strategy its own path over the
scene — the brief-follower got a tight sweep of the two named houses, the
control got a wide one, and a "random" bot got random waypoints. Random won,
convincingly, at everything. It was not a finding about briefs. Long diagonal
traverses across a whole scene pass over more objects than a tidy three-row
serpentine does, so the random bot simply *saw more*, and the experiment had
accidentally been about pathfinding.

**So:** when a duel sim compares strategies, hold the MOTION fixed and vary only
the decision you are testing. Same route, same speed, same everything — the
brief-follower and the control differ in one predicate, "which things do I spend
memory on". With that fixed the answer inverted: following the brief went from
losing to a random bot to beating an actively-ignoring one by 0.63 of a question
and nearly doubling accuracy on the questions it is aimed at (68% against 44%).

Related: the same run also caught a bot that never moved. Once its memory was
full it rehearsed whatever was in front of it, and there is always something in
front of you, so it spent forty-five seconds staring at one porch and could not
answer a single counting question. A "top up what is fading" rule needs a
threshold or it is a "stand still" rule.

#### Questions have different prices and the cheap ones should be the wide ones

**What happened:** with every question priced the same, three of the five types
sat at chance. Counting was 25% — the guess rate — and "which of these was
furthest left" was 23%, *below* it, because it needs four particular things held
at once and nobody holds four particular things.

**So:** separate the questions that cost a FIXATION from the ones that cost a
GLANCE. Naming the colour of a particular object at a named place needs a real
look. Saying *what* was in a place you have been told the name of, or roughly
where you saw a distinctive thing, survives on a glance in passing. Once that is
modelled, the design falls out of it: the questions about the briefed area
should be the expensive ones, and the questions about everywhere else should be
the cheap ones — otherwise the wide questions compete with the briefed area for
the same scarce memory and the brief cannot pay for itself.

Two smaller corollaries, both paid for: a count of one is not a count, it is a
presence question whose option row gives it away; and a whole-scene count
rewards sweeping, which is free, so it is a question that argues against your
own brief.

---

### From Housekeeping (2026-08-21)

#### note

A game needs to own its own title screen and Relay gave it no way to. The host rendered title, tagline and buttons for every game in the collection, so the one screen most likely to decide whether a link gets tapped looked identical for all of them. The hook is small — an optional game.splash(root, {seed}) rendered behind the screen content, torn down by clearStage — and what it buys is large: Housekeeping's title screen is the game running quietly behind the words, a cabinet where two things trade places every few seconds while you read. It teaches the mechanic by demonstration before a word of explanation. Hand the game a SCRAMBLED seed, not today's, or the title screen spoils the puzzle.

#### note

Pacing is a dial, it is easy to set wrong, and generosity you have not accounted for is a difficulty change you did not notice making. Both these games gave a player about 320ms between finding the change and being asked to study again — not enough time to notice you were right, let alone enjoy it. But the fix cannot be 'show the room for a second as a reward', because in a game whose late-round study clock is about ONE SECOND that reward is more study time than the round itself grants, and it silently undoes the ladder. So the win beat covers the board and lifts what you caught OUT of it, held up large, which costs the difficulty nothing and is a far better look at the thing than a 47-pixel object on a shelf. Any beat that does show the board — an arrival, a countdown — has to be added to the study budget in the balance harness.

#### note

A title must never break mid-word, and the CSS that is right for a result headline is wrong for a title. Relay's .big sets overflow-wrap:anywhere so a long result line wraps instead of overflowing; put a game's name in the same class and you get HOUSEKEEPIN / G on the splash. Headlines wrap, titles shrink.

---

### From Housekeeping (2026-08-21)

#### note

A game needs to own its own title screen and Relay gave it no way to. The host rendered title, tagline and buttons for every game in the collection, so the one screen most likely to decide whether a link gets tapped looked identical for all of them. The hook is small — an optional game.splash(root, {seed}) rendered behind the screen content, torn down by clearStage — and what it buys is large: Housekeeping's title screen is the game running quietly behind the words, a cabinet where two things trade places every few seconds while you read. It teaches the mechanic by demonstration before a word of explanation. Hand the game a SCRAMBLED seed, not today's, or the title screen spoils the puzzle.

#### note

Pacing is a dial, it is easy to set wrong, and generosity you have not accounted for is a difficulty change you did not notice making. Both these games gave a player about 320ms between finding the change and being asked to study again — not enough time to notice you were right, let alone enjoy it. But the fix cannot be 'show the room for a second as a reward', because in a game whose late-round study clock is about ONE SECOND that reward is more study time than the round itself grants, and it silently undoes the ladder. So the win beat covers the board and lifts what you caught OUT of it, held up large, which costs the difficulty nothing and is a far better look at the thing than a 47-pixel object on a shelf. Any beat that does show the board — an arrival, a countdown — has to be added to the study budget in the balance harness.

#### note

A title must never break mid-word, and the CSS that is right for a result headline is wrong for a title. Relay's .big sets overflow-wrap:anywhere so a long result line wraps instead of overflowing; put a game's name in the same class and you get HOUSEKEEPIN / G on the splash. Headlines wrap, titles shrink.

#### note

An assertion that reads POSITION cannot see a transposition, and it will pass forever while doing nothing. Housekeeping's view test fingerprinted the room by each object's transform; a swap puts a different object on the same slot at the same coordinates, so 'the room never changes while you are looking' never once detected the game's only mechanic. Kim's Game had the same hole for its SWAP op, plus a second one: the counter's increment was dropped in a rewrite and the assertion sat there passing on a variable nothing touched. Two lessons. Fingerprint by CONTENT, not by layout. And every time you write an assertion that matters, break the thing it guards and watch it fail — if it does not, you have written a comment.

---

### From PEEKABOO (2026-08-26)

#### note

Watch time is flat as a difficulty dial in a FROZEN-SNAPSHOT memory game, even more so than in Grandma's Watching. Level 6 clear rate across 2s/3s/4s/6s/9s/14s of watching: 58.6 / 61.7 / 59.6 / 59.2 / 61.8 / 59.0. Flat. Two reasons compound: only the final instant is ever queried, so an early look is a memory of somewhere the animal no longer is; and the fixation budget saturates the memory long before the clock runs out. Watch time is a PACING device and nothing else. The dial is how many things are out there.

#### note

Steering to uniformly-random waypoints is the random-waypoint mobility model, and its stationary distribution is famously centre-heavy: the straight line between two random points crosses the middle far more often than it visits a corner. In a game scored by distance that hands out a free strategy. A player with NO MEMORY who tapped the exact centre of the screen every time cleared level 10 forty percent of the time and reached level 3 on average. Biasing the waypoints toward the edges only recovered 8 points of it, because the concentration is in the PATHS not the endpoints; the geometry had to be fixed at the accuracy curve instead.

#### note

A memory bot that refreshes a RANDOM held item makes a bigger memory strictly worse, and it inverts your whole tier order while looking like a finding about the game. PEEKABOO's savant (7 slots) scored below its decent bot (4 slots) because it cycled seven memories at the same fixation rate and every one it held was older. Refresh the STALEST, which is what a person cycling a set actually does. Sister lesson to Grandma's Watching: a top-up rule needs a threshold or it is a stand-still rule; this one needs an ORDER or it is a forgetting rule.

#### note

requestAnimationFrame does not fire while a window is occluded, and performance.now() keeps going. PEEKABOO derived the end of its watch phase from the render loop running out of simulation frames -- the obvious way to write it -- so when frames stopped, the clock sailed past the end of the watch and the lights never went out. The animals stood there wandering forever in a game whose entire premise is that they stop. Nothing threw, nothing logged, and visibilitychange never fired because the tab was visible, just not painted. Any PHASE CHANGE a player is waiting on has to be a timer; rAF is only allowed to paint. Same for the values inside a reveal: set the line, the ring and the counting number from a timer, so a throttled tab shows the answer plainly instead of half drawn.

#### note

A spec can be right about the mechanic and wrong about the artifact. PEEKABOO's
spec asked for one share glyph per ATTEMPT with a third state for a bullseye, and
that strip failed the fingerprint check with 92% of runs producing their own
unique line. The instinct is to dismiss the check -- this template's own notes
say the "no strip should identify a puzzle" test is the wrong test, and they are
right, because the mapping a reader would need runs through your private taps.
But the check was correct by accident: three independent states at every one of
nine positions is a lot of channel for a line whose only job is to say how far
you got. One glyph per LEVEL is 19%, because the game itself constrains it --
three lives means at most two slips and one ending and there is nothing else in
there. The bullseyes moved to the stat line, where a count reads as a brag rather
than as noise buried at position six. Both the check and the artifact got better,
and neither was gamed.

#### note

The spec wanted a hidden tab to RESTART the watch phase from zero, reasoning that
the layout is deterministic so a restart costs nothing. It costs the game.
Background the tab and come back and you get a second full look at the same
layout, as many times as you like, in a game that is entirely about how much of
one look you can hold. Determinism is what makes the exploit FREE, not what makes
it harmless. Pause and resume instead: the clock stops where it was and the watch
is not extended by a millisecond.

#### note

The share strip's feedback-only assertion has a way of quietly testing nothing. PEEKABOO's first version sampled 600 random runs, grouped them by their feedback shape, and checked that every run in a group produced the same strip. The shapes are nine beats long, so two runs essentially never shared one and the assertion spent its life comparing an empty map. A deliberate leak -- a glyph that changed with the target's species -- passed it clean. DRIVE the feedback instead of hoping for a collision: play a fixed pattern of clears and misses across hundreds of different puzzles and assert the strip is identical every time. Same shape as Housekeeping's lesson about fingerprinting by content: if you have never watched the assertion fail, you have written a comment.

---

### From Night Desk (2026-08-27)

#### still-fun-day-30

**Assumed:** What makes day 30 different from day 3? If nothing does, say so.

**What actually happened:** The named failure mode was 'one question pays for itself every night'. The duel sim found something worse: WHICH question you asked was worth 0.1 points of a settled night across every policy tested — ask-sleep, ask-company, ask-first-thing and ask-what-matters-here all landed within 0.1 of each other. The four question buttons were decoration. Asking AT ALL was worth 5.5 points, and letting the guest volunteer their strongest unknown fact scored 2.1 points better than letting the player choose the subject.

**So:** a menu of questions is a menu of *subjects*, and a subject is not a
decision. The player was choosing which column of a table to reveal, and every
column was worth about the same, because the thing that varies between guests is
not which fact they have — they all have all five — it is how much any of it
matters to them. Build the ladder of bots so that each one adds exactly ONE
capability to the one above it, and a mechanic that buys nothing shows up as two
neighbours with the same score. Four buttons became one, the phone screen got
simpler, and the game got 2.1 points better.

The corollary is the part worth keeping: the questions are still the game, but
the decision is **who** you spend them on and **when**, not what you ask. Asking
one guest was worth 5.5 points; asking a second question of the same guest was
worth 0.2, because the budget binds. Price information as a supply.

And a second thing this cost an afternoon: **a projection has to expose the
strength of a trait, not just the trait.** The first version of the desk gave
each guest a bucketed fact — 'immaculate', 'sleeps badly' — and hid how hard
they cared. Salience turned out to be the single strongest driver of whether a
room worked (r = -0.32 against happiness, ahead of room size at -0.29), so a
player who knew every fact about everybody scored 57.7% against a blind bot's
51.2%. The information the game was selling was nearly worthless. Putting the
strength into the wording — 'immaculate, and particular about it' — moved that
same player to 76.8%. If a hidden quantity drives your score, either show it or
stop scoring on it.

Related: the game also stopped scoring ideological friction, which the character
engine prices for flatshares. Two people do not discover they disagree about how
a household should be run in one night at a hotel, and it was a fifth of the
outcome while being the one thing a desk clerk could never ask about.

#### note

The unfurl card's bands shrink to fit and then STOP at a floor scale and draw anyway, so an over-long line is silently CLIPPED rather than wrapped: Night Desk's announce card ran 'Everyone gets a bed. Not everyone sleeps.' off the right edge as 'NOT EV'. Kim's Game found the same failure in the stat tiles and the fix there was to shrink them; this is the half that shrinking cannot fix, because below scale 7 nothing fits. The card is 1200px and the game author cannot see it from relay.config.mjs, so the cheap guard is an ASSERTION in the game's own test: textWidth(line, FLOOR_SCALE) <= 1200 - 2*MARGIN, for the tagline, both headlines and every stat tile. Night Desk ships one. Also assert every character the card prints exists in the 5x7 font, because a missing glyph draws nothing while still advancing the cursor.

---

### From GRUK (2026-08-27)

#### note

A game whose content is AUTHORED PER DAY cannot see the day. The host hands mount() a seed and the server replays with rules.replay(ctx.seed, log) — and a seed is a hash, so the day number is not recoverable from it. Any game with a story arc, a ladder or a written day N is therefore forced to either scramble its own arc (index by seed % N) or edit the host. Threading ctx.number through both call sites is two lines and should be in the template: seed decides what is drawn, number decides which chapter it is drawn for.

#### note

A SHRINK FLOOR THAT CAN BE REACHED IS A CLIPPING BUG. The og card's headline band shrank from scale 21 down to a floor of 7 and then drew the text anyway, so a 32-character tagline ran clean off the right edge of a 1200px card. Grandma's Watching already logged 'every band has to shrink to fit' and this band did shrink — it just could not shrink ENOUGH, which is a different failure and looks identical. Once a band runs out of shrink it has to wrap, not overflow. Same shape as the never-clip-a-header rule: shrinking is the fix only while shrinking is sufficient.

#### note

THE BEAT AFTER A CHOICE MUST NOT BE A VERDICT. GRUK's first pass mapped hit/near/miss straight onto three faces, so the player was told how their line landed the instant they played it — which turns a game about reading someone into arithmetic, because you learn the hidden answer on beat one and apply it twice. Showing his CURRENT state instead (the same face the next scene would show anyway) carries no new information, and the difference in the harness is the whole game: the bot that tracks its own effect scores 4.00, the one working from a one-beat-stale read scores 2.55. But the beat cannot be silent either — an action that resolves without a word reads as broken. The answer is a line that describes him, not one that grades you.

#### note

tools/new-game.mjs copies test/ wholesale, so every scaffolded game ships a test/relay.test.mjs that imports ../src/game/keyhole.rules.mjs — a module the scaffold has just deleted. npm test therefore crashes with ERR_MODULE_NOT_FOUND on a brand new game, after the assumptions checker has already printed all green, which reads as 'the template is broken' rather than 'this half is yours to write'. The primitive tests are worth keeping; the game-specific half wants to be a clearly-marked stub.

#### note

NAMING A NON-HUMAN COLOUR DOES NOT MAKE A NON-HUMAN. 'Brick-red and terracotta skin' on a big heavyset troll came back as a ruddy-complexioned fat man in every frame, and 'red hair' hijacked it into a ginger beard. What fixed it was three things at once: naming the colour as a MATERIAL ('a flat unnatural brick red like fired terracotta'), saying explicitly what it is not ('clearly not a human complexion'), and negating the drift on the --no list (human, man, person, ginger, red hair, freckles). Sister lesson to naming the drift: when the model has a strong prior for reading your subject as a person, the colour word alone is decoration.

---

### From Crown Run (2026-08-27)

#### note

A pathfinder that FALLS BACK instead of failing turns its validator into a rubber stamp. Crown Run generates arenas and validates them by asking whether a king can route from each spawn to its goal. route() had a kindness in it: if the start cell was buried or unreachable it relocated to the nearest reachable cell ANYWHERE on the board and returned a path from there. So route() never returned null, so validate() never rejected anything, and the generator cheerfully shipped boards whose goal was sealed off from every spawn by a rock overlapping the wall. The bug was invisible from the outside because the returned path looked plausible — it just teleported once, in the middle. Relocation is now bounded to three cells, which is 'the piece is standing slightly inside a rock', and anything further is null. Sibling to Blast Golf's slope-limit lesson: in any generate-and-validate loop, the validator's oracle must have no best-effort mode. Best effort IS the failure.

#### note

Anchor a path-follower's carrot to the BODY's own projection, never to the clock. Crown Run's pieces walk a drawn polyline and slide around anything solid. The obvious implementation advances an arclength cursor by speed*dt each tick and steers at the point there. It is wrong in two ways and both look like a physics bug. (1) A piece pinned behind a rock keeps advancing its cursor, so within a couple of seconds the carrot is at the end of the route and the piece is beelining at the goal through the same rock, route discarded, stuck for the rest of the run: the harness reported a third of all kings as 'walked 100% of the route, ended 459 units short'. (2) The fix of holding the cursor while the body lags deadlocks the moment the drawn path passes through a rock, because the carrot is somewhere the body can never stand. What works is: project the body onto the path each tick, put the carrot one step past the projection, clamp the lead, and nudge the carrot forward out of any obstacle it lands inside. Then being blocked costs TIME, which is the only thing it should cost. And the 'is anything still moving' early-exit has to ask about the BODY, not the cursor — asking about the cursor cut runs short while pieces were still two units from a goal.

#### note

A share strip should be the JOURNEY, not a roll call. Crown Run's first strip was one glyph per piece: crown, shot, shot, shield, shield. It passed every spoiler test and it was useless, because on most runs four of the five slots said 'this shield did nothing' and a reader learned nothing about how the run went. Five glyphs, one per fifth of the road home, with the ending drawn in the slot where it happened, gives you the thing the artifact is for at a glance: a filled square per fifth covered, a hollow one per fifth never reached, and a crown or an ice cube for how it ended. Twelve distinct strips over four hundred runs, none of them unique, and every one of them legible from a notification. Sister to PEEKABOO's 'one glyph per LEVEL, not per ATTEMPT': the strip is about progress, and the counts belong in the stat line where they read as a brag.

#### note

Make the number a share strip is built from the same number the result publishes. Crown Run's strip is built from how far the crown got, as a fraction. The strip assertion buckets runs by the percentage in the result and checks every run in a bucket draws the same strip — and it failed, not on a leak but on a rounding boundary: the strip used ceil(progress*5) and the test used ceil(round(progress*100)/20), which disagree for a crown that got 0.3% of the way. Quantising progress to whole percent inside the sim made the two identical by construction and also made the strip provably a function of a number the reader can already see, rather than of a float only the sim knows. If your artifact is derived from an internal value, publish that value at the resolution the artifact uses it.

#### note

Relay styles .btn and has nothing for .btn:disabled, so a primary button a game has switched off still arrives full-green and full-contrast. The player taps it, nothing happens, and that reads as broken rather than as 'not yet' — which is exactly the silent-failure trap. Crown Run put the rule in its own theme, but it belongs in the host: every game on this template will disable its action button at some point.

#### note

When a duel sim compares two strategies, they must differ in exactly ONE predicate, and 'one predicate' is easier to get wrong than it looks. Crown Run's second duel asked whether reading the Guard's placement tells you where to send your four support pieces. The first version pointed all four at predicted threats in one arm and used them as escorts in the other — which also removed the escort that soaks the enemy's two shots, so it was measuring escorting, not reading, and it reported noise. Holding one escort identical in both arms and varying only the other three inverted nothing but made the answer clean and negative: hunting is worse than screening. Same shape as Grandma's Watching' lesson about holding the MOTION fixed; the trap is that the confound is usually a thing you removed rather than a thing you added.

---

### From Grandma's Watching (2026-08-28)

#### independent-numbers

**Assumed:** Which of your difficulty numbers are actually independent, and which are derived from the others?

**What actually happened:** The balance sim confirmed the viewport is not a dial (3.68 -> 3.38 across a 2.6x size range, and SMALLER scores slightly BETTER, the opposite of the spec). But it also killed my own replacement dial: watch seconds are flat-to-negative (3.74 at 20s, 3.60 at 45s, 3.31 at 90s), because a fixed memory decays and a longer watch just adds interference. The real dial is how busy the street is, and the only lever the PLAYER has is where they point.

**So:** in an observation game, neither the size of the window nor the length of
the look is a difficulty dial. Both feel like dials because they are the two
numbers on the screen. What is actually scarce is **how many things a person can
hold**, and that is a property of the person, not of the game — so the only
numbers you control are **how many things are out there** and **how many of the
questions are about the part you told them to watch**. Tune those two and leave
the timer alone; the timer is a session-length device and a reason nobody can
take notes, and it should be chosen for feel.

The corollary is the useful half: a longer look makes a bot *worse*, because
everything new it takes in evicts something it had. That is not a bug in the
model, it is why "do not stare at one thing, dear" and "do not fixate" are both
in the game's copy, and it is why the second-best strategy is to stop looking
once you are full.

#### The duel sim was measuring the route, not the strategy

**What happened:** the first duel gave each strategy its own path over the
scene — the brief-follower got a tight sweep of the two named houses, the
control got a wide one, and a "random" bot got random waypoints. Random won,
convincingly, at everything. It was not a finding about briefs. Long diagonal
traverses across a whole scene pass over more objects than a tidy three-row
serpentine does, so the random bot simply *saw more*, and the experiment had
accidentally been about pathfinding.

**So:** when a duel sim compares strategies, hold the MOTION fixed and vary only
the decision you are testing. Same route, same speed, same everything — the
brief-follower and the control differ in one predicate, "which things do I spend
memory on". With that fixed the answer inverted: following the brief went from
losing to a random bot to beating an actively-ignoring one by 0.63 of a question
and nearly doubling accuracy on the questions it is aimed at (68% against 44%).

Related: the same run also caught a bot that never moved. Once its memory was
full it rehearsed whatever was in front of it, and there is always something in
front of you, so it spent forty-five seconds staring at one porch and could not
answer a single counting question. A "top up what is fading" rule needs a
threshold or it is a "stand still" rule.

#### Questions have different prices and the cheap ones should be the wide ones

**What happened:** with every question priced the same, three of the five types
sat at chance. Counting was 25% — the guess rate — and "which of these was
furthest left" was 23%, *below* it, because it needs four particular things held
at once and nobody holds four particular things.

**So:** separate the questions that cost a FIXATION from the ones that cost a
GLANCE. Naming the colour of a particular object at a named place needs a real
look. Saying *what* was in a place you have been told the name of, or roughly
where you saw a distinctive thing, survives on a glance in passing. Once that is
modelled, the design falls out of it: the questions about the briefed area
should be the expensive ones, and the questions about everywhere else should be
the cheap ones — otherwise the wide questions compete with the briefed area for
the same scarce memory and the brief cannot pay for itself.

Two smaller corollaries, both paid for: a count of one is not a count, it is a
presence question whose option row gives it away; and a whole-scene count
rewards sweeping, which is free, so it is a question that argues against your
own brief.

#### note

Ignoring art/ wholesale loses the masters, and the fix is not to commit the whole discard pile. Four Relay games had art/ or art/raw in .gitignore with nothing tracked underneath: Night Desk's sixteen guest plates, Grandma's Watching's 124 frames, Vine Drop's sixty, Sheepenomics' five premises — all of them the only copies, all on one laptop, and public/ shipping downscaled derivatives that cannot be re-exported at any other size. Midjourney will not hand the same street back. But most of those files are not masters: the model returns four variants of every prompt and the pipeline picks one, so 90 of Grandma's 124 and 45 of Vine Drop's 60 are frames that were looked at and rejected. Keep the WINNERS and drop the discards — 18M of 65M, 11M of 45M — and the way to know you got the set right is to rebuild from only the kept files and diff: both reproduced public/art byte-identically, which also proves a fresh clone can rebuild the art without Midjourney in the loop. Two corollaries. Where the picker records its choice (Vine Drop's PICKS table) this is a five-minute job, and where it scores silently (Grandma's pick.mjs) you have to run it and read its own report, which is an argument for tools that write down what they chose. And keep the frames that FAILED for an asset you shipped a stand-in for — they are the evidence a better keyer would need to have another go.

---

### From SÆHRÍMNIR (2026-09-08)

#### independent-numbers

**Assumed:** Which of your difficulty numbers are actually independent, and which are derived from the others?

**What actually happened:** Pressure IS the one independent number, but the assumption missed two things that mattered more. (1) It has a hard CEILING set by a different number: a lane enforces a minimum gap so a jump started for one obstacle lands before the next, which caps arrivals at 1/MIN_GAP_SECONDS, about 1.4/s. The spec's numbers asked for 1.95 and the lane simply saturated -- every gap went to minimum, the road became a wall, and the dial stopped meaning anything. (2) Far worse: with pressure uniform across lanes there was no reason to ever change lane, so NONE of the difficulty numbers mattered. Sweeping the four player capabilities one at a time returned flat or NEGATIVE in all four directions at once.

**So:** before you tune a difficulty number, check that any of them can
matter. Sweep each of the player's CAPABILITIES on its own — how far they can
see, how fast they react, how often they act, what they know — and read the
signs. If they come back flat, the game has no decision in it. If they come back
NEGATIVE, the game has a decision and it is punishing the player for making it.
Four flat-to-negative sweeps at once is not four tuning problems; it is one
design problem, and no amount of moving the numbers will fix it.

Here the cause was that every lane was equally busy, so moving cost a blind
window and bought nothing, and the dominant strategy was to stand in one lane
and jump forever. The fix was a cost on standing still: the lane you are in gets
busier the longer you stay, and stepping across resets it. That one rule turned
every sweep positive and made a bot that never changes lanes score a sixth as
well as one that does. Nothing else about the seven lanes had to change.

Two corollaries, both cheap and both paid for:

- **A rate has a ceiling, and the ceiling is usually set by an animation.** Ask
  for more obstacles per second than one per clear-animation-length and the lane
  saturates: every gap goes to minimum and the number stops doing anything.
  Write the ceiling down next to the dial. Sister to Vine Drop's derived-dial
  trap from the other side — there the dial was not independent, here it was
  independent and simply had a wall at the top of its range.
- **A tier ladder inverts when one of its axes is a STYLE rather than a SKILL.**
  Thumb speed swept as an inverted U peaking near 24 ticks, because below about
  0.4s between swipes a bot makes lane changes it does not need and every one of
  them is a blind window. Making faster hands a mark of skill therefore made the
  savant score below the novice, three separate times, and each time it read as
  a bug in the game. Hold that axis CONSTANT at a realistic value and build the
  ladder only from things that are monotone on their own.

#### The asset that discriminates is the one to probe first

Three Midjourney style probes, four assets each: the hero character, the villain,
a frame of the actual game screen, and the share card. All three styles produced
a usable character and a usable share card on the first try. Two of the three
could not do the thing the game is entirely about — hold seven distinct coloured
lanes side by side — because the model reads "rainbow bridge" as one blended
slope unless the lanes are described as separate slabs with black between them.

So when you are choosing a style, work out which asset the style could actually
FAIL at and generate that one first. A hero shot is the asset every style passes;
it is the most fun to look at and it carries almost no information. The probe
that decides is the one closest to the screen the player will really be looking
at.

#### A partial board drawn at full-board coordinates has holes in it

The seven lanes have a fixed left-to-right order, so they were drawn at their
absolute positions — and a colour that had not joined yet left a GAP where it
would eventually go. A rainbow bridge with planks missing out of the middle reads
as a rendering bug, not as a road being built.

The fix is to draw from the LIVE set and not from the coordinate space: screen
position is the index within what currently exists, so the order is still fixed
but a new piece pushes the others apart instead of filling a hole. Applies to any
board that grows or shrinks during play.

#### Make a missing glyph draw something

The template's 5x7 card face had no Æ and no Í, so a game called SÆHRÍMNIR
printed itself onto its own share card as "S HR MNIR". Grandma's Watching and
Night Desk had both already logged this failure and both fixed it by ASSERTING
against the charset in their own tests — which works, and only for the game that
remembers to write the assertion.

The cheaper half is in the renderer: a character the face does not have now draws
a hollow box. An assertion catches it in the game that has one; tofu catches it
in every game forever, including in a screenshot somebody takes six months from
now. When a silent failure has bitten three times, stop guarding it and make it
noisy instead.

---

### From SÆHRÍMNIR (2026-09-08)

#### independent-numbers

**Assumed:** Which of your difficulty numbers are actually independent, and which are derived from the others?

**What actually happened:** Pressure IS the one independent number, but the assumption missed two things that mattered more. (1) It has a hard CEILING set by a different number: a lane enforces a minimum gap so a jump started for one obstacle lands before the next, which caps arrivals at 1/MIN_GAP_SECONDS, about 1.4/s. The spec's numbers asked for 1.95 and the lane simply saturated -- every gap went to minimum, the road became a wall, and the dial stopped meaning anything. (2) Far worse: with pressure uniform across lanes there was no reason to ever change lane, so NONE of the difficulty numbers mattered. Sweeping the four player capabilities one at a time returned flat or NEGATIVE in all four directions at once.

**So:** before you tune a difficulty number, check that any of them can
matter. Sweep each of the player's CAPABILITIES on its own — how far they can
see, how fast they react, how often they act, what they know — and read the
signs. If they come back flat, the game has no decision in it. If they come back
NEGATIVE, the game has a decision and it is punishing the player for making it.
Four flat-to-negative sweeps at once is not four tuning problems; it is one
design problem, and no amount of moving the numbers will fix it.

Here the cause was that every lane was equally busy, so moving cost a blind
window and bought nothing, and the dominant strategy was to stand in one lane
and jump forever. The fix was a cost on standing still: the lane you are in gets
busier the longer you stay, and stepping across resets it. That one rule turned
every sweep positive and made a bot that never changes lanes score a sixth as
well as one that does. Nothing else about the seven lanes had to change.

Two corollaries, both cheap and both paid for:

- **A rate has a ceiling, and the ceiling is usually set by an animation.** Ask
  for more obstacles per second than one per clear-animation-length and the lane
  saturates: every gap goes to minimum and the number stops doing anything.
  Write the ceiling down next to the dial. Sister to Vine Drop's derived-dial
  trap from the other side — there the dial was not independent, here it was
  independent and simply had a wall at the top of its range.
- **A tier ladder inverts when one of its axes is a STYLE rather than a SKILL.**
  Thumb speed swept as an inverted U peaking near 24 ticks, because below about
  0.4s between swipes a bot makes lane changes it does not need and every one of
  them is a blind window. Making faster hands a mark of skill therefore made the
  savant score below the novice, three separate times, and each time it read as
  a bug in the game. Hold that axis CONSTANT at a realistic value and build the
  ladder only from things that are monotone on their own.

#### The asset that discriminates is the one to probe first

Three Midjourney style probes, four assets each: the hero character, the villain,
a frame of the actual game screen, and the share card. All three styles produced
a usable character and a usable share card on the first try. Two of the three
could not do the thing the game is entirely about — hold seven distinct coloured
lanes side by side — because the model reads "rainbow bridge" as one blended
slope unless the lanes are described as separate slabs with black between them.

So when you are choosing a style, work out which asset the style could actually
FAIL at and generate that one first. A hero shot is the asset every style passes;
it is the most fun to look at and it carries almost no information. The probe
that decides is the one closest to the screen the player will really be looking
at.

#### A partial board drawn at full-board coordinates has holes in it

The seven lanes have a fixed left-to-right order, so they were drawn at their
absolute positions — and a colour that had not joined yet left a GAP where it
would eventually go. A rainbow bridge with planks missing out of the middle reads
as a rendering bug, not as a road being built.

The fix is to draw from the LIVE set and not from the coordinate space: screen
position is the index within what currently exists, so the order is still fixed
but a new piece pushes the others apart instead of filling a hole. Applies to any
board that grows or shrinks during play.

#### Make a missing glyph draw something

The template's 5x7 card face had no Æ and no Í, so a game called SÆHRÍMNIR
printed itself onto its own share card as "S HR MNIR". Grandma's Watching and
Night Desk had both already logged this failure and both fixed it by ASSERTING
against the charset in their own tests — which works, and only for the game that
remembers to write the assertion.

The cheaper half is in the renderer: a character the face does not have now draws
a hollow box. An assertion catches it in the game that has one; tofu catches it
in every game forever, including in a screenshot somebody takes six months from
now. When a silent failure has bitten three times, stop guarding it and make it
noisy instead.

#### Something in a seven-colour set is always the colour of your key

A game whose whole point is seven saturated lanes cannot chroma-key its props
on one screen: whatever colour you pick, one of the seven props IS that colour.
Warm props went on cobalt, cool ones on green, and the key each was shot on is
recorded next to the prompt so the cutter is never guessing. Even so, one got
through: a green tree root shot on chroma key green, and the key ate all four
variants before anyone looked at them.

Three smaller things came out of the same batch, all worth carrying:

- **Midjourney does not give you the flat pure screen you asked for.** Its green
  comes back a muted sage about 15 apart from neutral, so a threshold tuned for
  cobalt leaves the backdrop half-opaque and every green-shot sprite ships with
  a dark rectangle welded to it. Thresholds are per key, not per pipeline.
- **A soft contact shadow is not the key colour, so it survives.** It ships as a
  grey smear under the sprite, which is exactly what makes a cutout read as a
  sticker. Label the opaque regions and drop everything under about 6% of the
  largest.
- **Print the coverage of every cutout.** A key that ate the subject and a key
  that found nothing look identical from a file listing, and both look like a
  file that exists. Three bad frames in seventy-six were found by a percentage
  and would not have been found by a filename.

#### A sprite size is a load budget, not a quality setting

The lanes are 54 to 190 pixels wide on a 400-pixel stage, so a 420-pixel sprite
is three times the pixels that ever reach the screen. The first bake of twenty
assets was 3MB, all of which a phone downloads before the first run. Baking at
the size the road actually draws, and posterising to five bits per channel
before encoding — invisible on clay texture, and it is per-pixel noise that zlib
cannot compress — took the same set to 696kb.

And keep the winners, not the discard pile: four earlier games in this
collection lost their only copies of an art set to a blanket `art/` ignore. The
test that the set is right is deleting the derived directory, rebaking from the
kept masters, and diffing — this one reproduces byte-identically, which is what
proves a fresh clone can rebuild the art without Midjourney in the loop.

---

### From SÆHRÍMNIR (2026-09-08)

#### independent-numbers

**Assumed:** Which of your difficulty numbers are actually independent, and which are derived from the others?

**What actually happened:** Pressure IS the one independent number, but the assumption missed two things that mattered more. (1) It has a hard CEILING set by a different number: a lane enforces a minimum gap so a jump started for one obstacle lands before the next, which caps arrivals at 1/MIN_GAP_SECONDS, about 1.4/s. The spec's numbers asked for 1.95 and the lane simply saturated -- every gap went to minimum, the road became a wall, and the dial stopped meaning anything. (2) Far worse: with pressure uniform across lanes there was no reason to ever change lane, so NONE of the difficulty numbers mattered. Sweeping the four player capabilities one at a time returned flat or NEGATIVE in all four directions at once.

**So:** before you tune a difficulty number, check that any of them can
matter. Sweep each of the player's CAPABILITIES on its own — how far they can
see, how fast they react, how often they act, what they know — and read the
signs. If they come back flat, the game has no decision in it. If they come back
NEGATIVE, the game has a decision and it is punishing the player for making it.
Four flat-to-negative sweeps at once is not four tuning problems; it is one
design problem, and no amount of moving the numbers will fix it.

Here the cause was that every lane was equally busy, so moving cost a blind
window and bought nothing, and the dominant strategy was to stand in one lane
and jump forever. The fix was a cost on standing still: the lane you are in gets
busier the longer you stay, and stepping across resets it. That one rule turned
every sweep positive and made a bot that never changes lanes score a sixth as
well as one that does. Nothing else about the seven lanes had to change.

Two corollaries, both cheap and both paid for:

- **A rate has a ceiling, and the ceiling is usually set by an animation.** Ask
  for more obstacles per second than one per clear-animation-length and the lane
  saturates: every gap goes to minimum and the number stops doing anything.
  Write the ceiling down next to the dial. Sister to Vine Drop's derived-dial
  trap from the other side — there the dial was not independent, here it was
  independent and simply had a wall at the top of its range.
- **A tier ladder inverts when one of its axes is a STYLE rather than a SKILL.**
  Thumb speed swept as an inverted U peaking near 24 ticks, because below about
  0.4s between swipes a bot makes lane changes it does not need and every one of
  them is a blind window. Making faster hands a mark of skill therefore made the
  savant score below the novice, three separate times, and each time it read as
  a bug in the game. Hold that axis CONSTANT at a realistic value and build the
  ladder only from things that are monotone on their own.

#### The asset that discriminates is the one to probe first

Three Midjourney style probes, four assets each: the hero character, the villain,
a frame of the actual game screen, and the share card. All three styles produced
a usable character and a usable share card on the first try. Two of the three
could not do the thing the game is entirely about — hold seven distinct coloured
lanes side by side — because the model reads "rainbow bridge" as one blended
slope unless the lanes are described as separate slabs with black between them.

So when you are choosing a style, work out which asset the style could actually
FAIL at and generate that one first. A hero shot is the asset every style passes;
it is the most fun to look at and it carries almost no information. The probe
that decides is the one closest to the screen the player will really be looking
at.

#### A partial board drawn at full-board coordinates has holes in it

The seven lanes have a fixed left-to-right order, so they were drawn at their
absolute positions — and a colour that had not joined yet left a GAP where it
would eventually go. A rainbow bridge with planks missing out of the middle reads
as a rendering bug, not as a road being built.

The fix is to draw from the LIVE set and not from the coordinate space: screen
position is the index within what currently exists, so the order is still fixed
but a new piece pushes the others apart instead of filling a hole. Applies to any
board that grows or shrinks during play.

#### Make a missing glyph draw something

The template's 5x7 card face had no Æ and no Í, so a game called SÆHRÍMNIR
printed itself onto its own share card as "S HR MNIR". Grandma's Watching and
Night Desk had both already logged this failure and both fixed it by ASSERTING
against the charset in their own tests — which works, and only for the game that
remembers to write the assertion.

The cheaper half is in the renderer: a character the face does not have now draws
a hollow box. An assertion catches it in the game that has one; tofu catches it
in every game forever, including in a screenshot somebody takes six months from
now. When a silent failure has bitten three times, stop guarding it and make it
noisy instead.

#### Something in a seven-colour set is always the colour of your key

A game whose whole point is seven saturated lanes cannot chroma-key its props
on one screen: whatever colour you pick, one of the seven props IS that colour.
Warm props went on cobalt, cool ones on green, and the key each was shot on is
recorded next to the prompt so the cutter is never guessing. Even so, one got
through: a green tree root shot on chroma key green, and the key ate all four
variants before anyone looked at them.

Three smaller things came out of the same batch, all worth carrying:

- **Midjourney does not give you the flat pure screen you asked for.** Its green
  comes back a muted sage about 15 apart from neutral, so a threshold tuned for
  cobalt leaves the backdrop half-opaque and every green-shot sprite ships with
  a dark rectangle welded to it. Thresholds are per key, not per pipeline.
- **A soft contact shadow is not the key colour, so it survives.** It ships as a
  grey smear under the sprite, which is exactly what makes a cutout read as a
  sticker. Label the opaque regions and drop everything under about 6% of the
  largest.
- **Print the coverage of every cutout.** A key that ate the subject and a key
  that found nothing look identical from a file listing, and both look like a
  file that exists. Three bad frames in seventy-six were found by a percentage
  and would not have been found by a filename.

#### A sprite size is a load budget, not a quality setting

The lanes are 54 to 190 pixels wide on a 400-pixel stage, so a 420-pixel sprite
is three times the pixels that ever reach the screen. The first bake of twenty
assets was 3MB, all of which a phone downloads before the first run. Baking at
the size the road actually draws, and posterising to five bits per channel
before encoding — invisible on clay texture, and it is per-pixel noise that zlib
cannot compress — took the same set to 696kb.

And keep the winners, not the discard pile: four earlier games in this
collection lost their only copies of an art set to a blanket `art/` ignore. The
test that the set is right is deleting the derived directory, rebaking from the
kept masters, and diffing — this one reproduces byte-identically, which is what
proves a fresh clone can rebuild the art without Midjourney in the loop.

#### Decoration draws under the thing the player is steering

The first pass at particles drew them last, on top of everything, which is the
obvious order and the wrong one: within ten seconds the boar was completely
buried under its own fireworks, and the one object a player must never lose
track of is the one they are steering. Sparks go UNDER the characters. The road
can be as mad as you like as long as the animal is still legible on it.

Three smaller things from the same pass:

- **Cull particles that leave the stage, not just ones that age out.** Anything
  with gravity queues up along the bottom edge and the road ends up looking like
  a lava lamp long after the burst that made it.
- **Fire the effects off a DIFF of the pure state**, never off the renderer's
  own guess about what just happened. Coins went up, hits went up, a colour
  joined. Then the fireworks are always telling the truth about the simulation,
  a replay of the same log throws the same confetti, and — the part that matters
  — nothing that decides a score can ever depend on how many sparks a phone felt
  like drawing.
- **Cache anything gradient-shaped.** Two radial gradients rebuilt every frame
  were the only genuinely expensive thing on this canvas, and both are driven by
  values that move about as fast as a minute hand.

#### One curve, or they drift

The road speeding up, the tempo lifting, the streaks thickening, the shake, the
vignette closing in — five things that all mean "faster", and the temptation is
to give each one its own ramp because each wants slightly different numbers.
Doing that guarantees they disagree somewhere in the middle of the run, and the
player feels it as the picture arguing with itself.

They all read `rushAt(tick)` instead. Tuning the game's pace now moves the music
with it by construction, which is the only reason the last twenty seconds feel
like one thing getting away from you rather than five effects happening nearby.

Worth separating from difficulty, though: the rush is NOT pressure. Obstacles
arrive at the same rate per second whatever the speed, because the spawn roll is
per tick and the minimum gap scales with speed too. What the rush takes away is
the TIME you have to answer them. That is the honest way to make a runner harder
late, and it is why the tier ladder survived a 2.55x speed change with almost no
retuning.

#### A runner cannot teach while it is running

Every other game in this collection can explain itself in three lines on a help
sheet nobody opens, because the player is sitting still. A runner has a field of
things in it — seven lanes, nine obstacles, five pickups, two invisible rules —
and no moment in which to read about any of them.

So the run STOPS on a first sighting: one picture, one sentence, one button,
once each per player forever. Two things make it survivable rather than
maddening. The way out is on the card itself, not buried in a settings screen —
a player who does not want to be taught should be able to say so at the moment
they are being taught. And every one of them is re-readable afterwards, because
an explanation that exists exactly once has not really been given; the help
sheet is a field guide with the actual sprites in it, not a paraphrase.

That needed the host to let a game own its own help, for the same reason it
already lets a game own its own splash. Three lines is the right size for a
guessing game and the wrong size for one with a bestiary.

---

### From SÆHRÍMNIR (2026-09-08)

#### independent-numbers

**Assumed:** Which of your difficulty numbers are actually independent, and which are derived from the others?

**What actually happened:** Pressure IS the one independent number, but the assumption missed two things that mattered more. (1) It has a hard CEILING set by a different number: a lane enforces a minimum gap so a jump started for one obstacle lands before the next, which caps arrivals at 1/MIN_GAP_SECONDS, about 1.4/s. The spec's numbers asked for 1.95 and the lane simply saturated -- every gap went to minimum, the road became a wall, and the dial stopped meaning anything. (2) Far worse: with pressure uniform across lanes there was no reason to ever change lane, so NONE of the difficulty numbers mattered. Sweeping the four player capabilities one at a time returned flat or NEGATIVE in all four directions at once.

**So:** before you tune a difficulty number, check that any of them can
matter. Sweep each of the player's CAPABILITIES on its own — how far they can
see, how fast they react, how often they act, what they know — and read the
signs. If they come back flat, the game has no decision in it. If they come back
NEGATIVE, the game has a decision and it is punishing the player for making it.
Four flat-to-negative sweeps at once is not four tuning problems; it is one
design problem, and no amount of moving the numbers will fix it.

Here the cause was that every lane was equally busy, so moving cost a blind
window and bought nothing, and the dominant strategy was to stand in one lane
and jump forever. The fix was a cost on standing still: the lane you are in gets
busier the longer you stay, and stepping across resets it. That one rule turned
every sweep positive and made a bot that never changes lanes score a sixth as
well as one that does. Nothing else about the seven lanes had to change.

Two corollaries, both cheap and both paid for:

- **A rate has a ceiling, and the ceiling is usually set by an animation.** Ask
  for more obstacles per second than one per clear-animation-length and the lane
  saturates: every gap goes to minimum and the number stops doing anything.
  Write the ceiling down next to the dial. Sister to Vine Drop's derived-dial
  trap from the other side — there the dial was not independent, here it was
  independent and simply had a wall at the top of its range.
- **A tier ladder inverts when one of its axes is a STYLE rather than a SKILL.**
  Thumb speed swept as an inverted U peaking near 24 ticks, because below about
  0.4s between swipes a bot makes lane changes it does not need and every one of
  them is a blind window. Making faster hands a mark of skill therefore made the
  savant score below the novice, three separate times, and each time it read as
  a bug in the game. Hold that axis CONSTANT at a realistic value and build the
  ladder only from things that are monotone on their own.

#### The asset that discriminates is the one to probe first

Three Midjourney style probes, four assets each: the hero character, the villain,
a frame of the actual game screen, and the share card. All three styles produced
a usable character and a usable share card on the first try. Two of the three
could not do the thing the game is entirely about — hold seven distinct coloured
lanes side by side — because the model reads "rainbow bridge" as one blended
slope unless the lanes are described as separate slabs with black between them.

So when you are choosing a style, work out which asset the style could actually
FAIL at and generate that one first. A hero shot is the asset every style passes;
it is the most fun to look at and it carries almost no information. The probe
that decides is the one closest to the screen the player will really be looking
at.

#### A partial board drawn at full-board coordinates has holes in it

The seven lanes have a fixed left-to-right order, so they were drawn at their
absolute positions — and a colour that had not joined yet left a GAP where it
would eventually go. A rainbow bridge with planks missing out of the middle reads
as a rendering bug, not as a road being built.

The fix is to draw from the LIVE set and not from the coordinate space: screen
position is the index within what currently exists, so the order is still fixed
but a new piece pushes the others apart instead of filling a hole. Applies to any
board that grows or shrinks during play.

#### Make a missing glyph draw something

The template's 5x7 card face had no Æ and no Í, so a game called SÆHRÍMNIR
printed itself onto its own share card as "S HR MNIR". Grandma's Watching and
Night Desk had both already logged this failure and both fixed it by ASSERTING
against the charset in their own tests — which works, and only for the game that
remembers to write the assertion.

The cheaper half is in the renderer: a character the face does not have now draws
a hollow box. An assertion catches it in the game that has one; tofu catches it
in every game forever, including in a screenshot somebody takes six months from
now. When a silent failure has bitten three times, stop guarding it and make it
noisy instead.

#### Something in a seven-colour set is always the colour of your key

A game whose whole point is seven saturated lanes cannot chroma-key its props
on one screen: whatever colour you pick, one of the seven props IS that colour.
Warm props went on cobalt, cool ones on green, and the key each was shot on is
recorded next to the prompt so the cutter is never guessing. Even so, one got
through: a green tree root shot on chroma key green, and the key ate all four
variants before anyone looked at them.

Three smaller things came out of the same batch, all worth carrying:

- **Midjourney does not give you the flat pure screen you asked for.** Its green
  comes back a muted sage about 15 apart from neutral, so a threshold tuned for
  cobalt leaves the backdrop half-opaque and every green-shot sprite ships with
  a dark rectangle welded to it. Thresholds are per key, not per pipeline.
- **A soft contact shadow is not the key colour, so it survives.** It ships as a
  grey smear under the sprite, which is exactly what makes a cutout read as a
  sticker. Label the opaque regions and drop everything under about 6% of the
  largest.
- **Print the coverage of every cutout.** A key that ate the subject and a key
  that found nothing look identical from a file listing, and both look like a
  file that exists. Three bad frames in seventy-six were found by a percentage
  and would not have been found by a filename.

#### A sprite size is a load budget, not a quality setting

The lanes are 54 to 190 pixels wide on a 400-pixel stage, so a 420-pixel sprite
is three times the pixels that ever reach the screen. The first bake of twenty
assets was 3MB, all of which a phone downloads before the first run. Baking at
the size the road actually draws, and posterising to five bits per channel
before encoding — invisible on clay texture, and it is per-pixel noise that zlib
cannot compress — took the same set to 696kb.

And keep the winners, not the discard pile: four earlier games in this
collection lost their only copies of an art set to a blanket `art/` ignore. The
test that the set is right is deleting the derived directory, rebaking from the
kept masters, and diffing — this one reproduces byte-identically, which is what
proves a fresh clone can rebuild the art without Midjourney in the loop.

#### Decoration draws under the thing the player is steering

The first pass at particles drew them last, on top of everything, which is the
obvious order and the wrong one: within ten seconds the boar was completely
buried under its own fireworks, and the one object a player must never lose
track of is the one they are steering. Sparks go UNDER the characters. The road
can be as mad as you like as long as the animal is still legible on it.

Three smaller things from the same pass:

- **Cull particles that leave the stage, not just ones that age out.** Anything
  with gravity queues up along the bottom edge and the road ends up looking like
  a lava lamp long after the burst that made it.
- **Fire the effects off a DIFF of the pure state**, never off the renderer's
  own guess about what just happened. Coins went up, hits went up, a colour
  joined. Then the fireworks are always telling the truth about the simulation,
  a replay of the same log throws the same confetti, and — the part that matters
  — nothing that decides a score can ever depend on how many sparks a phone felt
  like drawing.
- **Cache anything gradient-shaped.** Two radial gradients rebuilt every frame
  were the only genuinely expensive thing on this canvas, and both are driven by
  values that move about as fast as a minute hand.

#### One curve, or they drift

The road speeding up, the tempo lifting, the streaks thickening, the shake, the
vignette closing in — five things that all mean "faster", and the temptation is
to give each one its own ramp because each wants slightly different numbers.
Doing that guarantees they disagree somewhere in the middle of the run, and the
player feels it as the picture arguing with itself.

They all read `rushAt(tick)` instead. Tuning the game's pace now moves the music
with it by construction, which is the only reason the last twenty seconds feel
like one thing getting away from you rather than five effects happening nearby.

Worth separating from difficulty, though: the rush is NOT pressure. Obstacles
arrive at the same rate per second whatever the speed, because the spawn roll is
per tick and the minimum gap scales with speed too. What the rush takes away is
the TIME you have to answer them. That is the honest way to make a runner harder
late, and it is why the tier ladder survived a 2.55x speed change with almost no
retuning.

#### A runner cannot teach while it is running

Every other game in this collection can explain itself in three lines on a help
sheet nobody opens, because the player is sitting still. A runner has a field of
things in it — seven lanes, nine obstacles, five pickups, two invisible rules —
and no moment in which to read about any of them.

So the run STOPS on a first sighting: one picture, one sentence, one button,
once each per player forever. Two things make it survivable rather than
maddening. The way out is on the card itself, not buried in a settings screen —
a player who does not want to be taught should be able to say so at the moment
they are being taught. And every one of them is re-readable afterwards, because
an explanation that exists exactly once has not really been given; the help
sheet is a field guide with the actual sprites in it, not a paraphrase.

That needed the host to let a game own its own help, for the same reason it
already lets a game own its own splash. Three lines is the right size for a
guessing game and the wrong size for one with a bestiary.

#### Two ways an explanation can be invisible

Neither of these was a bug in the tips themselves, and both looked exactly like
"the feature does not work".

**A permanent off switch is one mis-tap away.** "Stop showing these" turns off
every explanation the game has, forever, and it shipped as a full-width ghost
button directly under the primary one — where a thumb aiming for "Got it" lands.
Mine got switched off by a test script and the report came back as "not seeing
any tips", which is the same report a real player would file. It is a small
underlined text link now, and the help sheet shows the current state so a player
who did trip it can find out.

**The dev server stamps its cache-buster once, at boot.** Relay serves
`theme.css?v=BUILD`, and BUILD is `Date.now()` at start-up, so every CSS edit
after that is invisible until the server is restarted — the browser is serving
the stylesheet from before the change and the new rules simply do not exist.
The symptom is a computed style with none of your properties in it, which reads
as a selector that does not match rather than a file that never loaded. In
production BUILD is the commit sha, so this is a local-development trap only.
Check a computed value before debugging the selector.

---

### From Asymmetry (2026-09-09)

#### note

PIXEL DIFFERENCE IS NOT DETECTABILITY, AND PHOTOREALISM IS WHERE THEY COME APART. Asymmetry calibrates its six perturbation types by rendering a tile and diffing it against its own reflection, which works because the shipped art is flat shapes: a shift moves a hard edge, and a hard edge in the wrong place is the same thing to the metric and to a person. Run five Midjourney probes through the identical pipeline and the metric says the break is MORE visible on photoreal art than on the generated tiles -- sugar-and-glass measured 9.04 against 3.58 at the same round -- while a person staring at the ringed answer cannot find it at all. High-frequency texture inflates a pixel diff and hides a break at the same time, because the eye compares STRUCTURE and the metric compares pixels. The consequence is not that photos look worse, they look far better; it is that the whole difficulty ladder becomes unverifiable, because the only instrument for checking it has stopped agreeing with the player. Any generate-and-measure loop should be checked against art of the density it will actually ship on, before the measurement is trusted to tune anything.

#### note

A POOL BUILT FROM A FEW PROMPTS BREAKS THE ONE RULE THE GAME RESTS ON. Asymmetry's premise is that every tile in a round is a DIFFERENT image, so the odd one cannot be found by comparing tiles to each other -- measured, cross-tile noise is 24x the size of the break, so that comparison is pure static. Midjourney returns four variants per prompt and they are siblings: in a 16-tile probe the four stained-glass beetles were obviously one another's cousins, which hands the player back exactly the cross-comparison the design forbids. A procedural generator never has this problem because every tile is an independent draw. If a photo pool is ever used it needs a per-round constraint that no two tiles come from the same prompt, and the pool has to be sized in PROMPTS rather than in images.

#### note

THE CAP ON A DOUBLING LADDER IS SET BY THE FACTORISATIONS THAT FIT THE STAGE, NOT BY THE DOUBLING. The spec asked for 2-4-8-16-32-64 tiles. On Relay's fixed 384x570 board the only hole-free layout for 32 is 4x8, which puts tiles at 71px -- below the size at which a small break is findable, and the spec had itself named ~95px as the floor. 24 factors into 4x6, which fills the same box at 95px. So the ladder stops at 24: one fewer step, no lost readability, and the difficulty carries on climbing through the clock instead. Enumerate the exact factorisations against the real board box BEFORE picking the ladder; a partial grid is not an option, because a hole in a board reads as a rendering bug.

#### note

A GAME CANNOT OWN THE ONE SURFACE THE TEMPLATE SAYS MATTERS MOST. Relay lets a game own its splash and its help, and renders per-link card TEXT, but card art was a file path -- so the picture was identical whether a link announced the game or reported a run, which is the exact miss DESIGN-LESSONS opens by naming. Letting background() take an image instead of only a path, and giving the game first refusal via share.cardArt, is about three lines each side. Asymmetry's card is now the actual grid the run ended on, redrawn in Node from the seed and round already in the link -- no stored image, works for crews and the archive. A stranger scrolling a chat sees an unsolved puzzle rather than somebody's score. Worth having in the template: any game whose board is its own best picture should be able to say so.

---

### From BANK SHOT (2026-09-10)

#### note

THE MECHANIC AT THE CENTRE OF THE SPEC WAS WORTH 0.4 POINTS, AND NO AMOUNT OF TUNING WAS GOING TO FIX IT. BANK SHOT's premise is a shot QUEUE: six shots, fixed order, all face up, so the game is deciding which pocket each one goes to. The duel harness gave one arm a greedy bot that only ever maximises the shot in its hand and the other a bot that plans one shot ahead, and the answer was 0.42 points of coverage. The instinct was that the decks were too uniform, so each parameter was respread across its whole range - one tiny shot, one enormous one - and the answer came back 0.42 again.

It is not a tuning problem. 'Cover the most ground with k blasts' is a submodular set function, and greed is provably within 1-1/e of the optimum on any problem of that shape. The best pocket for this shot is the best pocket for the next one, so there is no allocation to get wrong, and a fat shot naturally goes to a big room because that is where the biggest number is. Any game scored on AREA COVERED by N independent placements has this property, whatever the placements look like.

What rescued it was finding the one thing in the game that is not submodular: the launcher's POSITION. Pinning it to one spot cost 9.4 points where the whole deck was worth 0.4, so making it a resource that carries between shots - you may only slide so far each turn - turned six aiming problems into one run. Planning went from 0.42 to 1.36, and the slide sweep put its peak at a budget of seven to ten cells: wide open there is nothing to plan, clamped shut there is nothing you can do about it either.

So: before building a planning system on top of a scoring rule, ask what SHAPE the objective is. If it is 'cover / collect / reach the most with N picks', greed is already near optimal and your planning layer is decoration. The fix is not a better planner or a spicier deck, it is finding the term that makes the picks depend on each other - and it will usually be something the player CARRIES rather than something they are dealt.

#### note

A HAZARD THAT COSTS WEAK PLAYERS AND COSTS STRONG PLAYERS NOTHING IS A LUCK TAX WEARING A DECISION'S CLOTHES. The first cut of the board had one to five holes on it that swallowed any shot which touched them. Measured across a hundred boards per tier: they ate 0.28, 0.23, 0.07 and 0.00 shots a run on halls, and 0.53, 0.57, 0.32 and 0.00 on pillars, going random / novice / decent / strong. Exactly zero at the top, every time, on every archetype.

That is the worst shape a hazard can have. A strong player routes around them for free, so there is no decision in it for them; a weak player loses a sixth of their whole game to a wobble they could not have predicted. The mechanic's entire function was to move score from the bad players to the good ones by luck rather than by play. Cut, and nothing was lost.

So: measure a hazard's cost PER TIER, not on average. A number that goes to zero at the top is not difficulty, it is a tax on the people already having the worst time. The same test is worth running on any 'risk' element - if the best bot never pays it, the element is decoration for them and punishment for everybody else.

#### note

requestAnimationFrame AND ResizeObserver BOTH GO QUIET IN AN UNPAINTED TAB, AND THE SECOND ONE FAILS SILENTLY FOREVER. PEEKABOO already logged the rAF half - a phase change a player is WAITING on must be a timer - and BANK SHOT hit it in the obvious place: the shot animation ran on rAF and the Fire button was disabled until the blast landed, so backgrounding the tab mid-shot ended the game permanently. Fixed the same way, with a hidden tab skipping straight to the end because there is nothing to watch.

The half that is new is ResizeObserver, and its symptom is completely different. Observer callbacks are delivered as part of the rendering lifecycle, so in a tab that is not painting they simply never run. A board sized during one of those quiet moments keeps that size afterwards - and a board that is the wrong size on every phone looks exactly like a board that fits. Nothing throws, nothing logs, and the only way to see it is to measure the canvas at several viewport widths and notice the number never moves.

There is a second, ordinary trap underneath it that makes this much easier to hit: A CANVAS THAT FILLS ITS OWN CONTAINER MAKES THAT CONTAINER UN-SHRINKABLE. The container's height came from the canvas, the canvas's height came from the container, so the box never got smaller and the observer had nothing to report even when it was running. Taking the canvas out of flow - position absolute inside a relative box - is what let the layout actually respond.

So: anything a player is waiting on, or looking at the size of, must not hang off the paint lifecycle. Back an observer with the window's own resize event and a plain timer, and check a responsive canvas by measuring it at three widths rather than by looking at one screenshot.

#### note

A NARROW SCORE DISTRIBUTION IS A BROKEN MODE, NOT A BADLY SET THRESHOLD. One of the four board archetypes - open ground with square blockers scattered on it - scored between 54 and 62 across a hundred boards where every other archetype spanned 25 points. Read as a par problem it looks like the threshold is two points out; a strong player cleared par 84% of the time, and moving par two points would have made that 40%, and the number would have looked fine.

It was not a par problem. A blast on open ground is a disc whatever it is standing next to, so scattering more or fewer square blockers changed almost nothing, and every day that archetype came up the whole leaderboard would have tied. Randomising the blocker COUNT did not fix it either. What fixed it was changing what a blocker IS: long bars at random orientations, which carve the floor into irregular regions with real geodesic structure, while keeping what the archetype was for - no doors, long sight lines, a bounce that can travel. Spread went from 8 points to 12.

So: when you tune a threshold, look at the SPREAD before you look at the mean. A mode whose p10 and p90 are close together is a day on which nobody can distinguish themselves, and no threshold will fix that - the variation has to come from the structure of the mode itself. And the tell is subtle, because a narrow distribution makes the clear rate look extremely sensitive to the threshold, which reads as 'nearly tuned' rather than as 'nothing to tune'.
---

### From One Take (2026-09-11)

#### A SUBDIVISION IS NOT A DIFFICULTY DIAL, AND NOR IS A LADDER POSITION

The spec wrote the five levels as five subdivision recipes: L4 drops the weakest
subdivision, L3 goes to an eighth-note grid, L2 to quarters, L1 to downbeats.
That is the right instinct and the wrong mechanism, because the same rule
produces six notes a second on a 150bpm garage tune and 2.9 on a 112bpm disco
one. The dial is NOTES PER SECOND; the subdivisions are only the order things
get dropped in. Sister to Vine Drop's tomato count — a number that feels like a
dial because it is the number written on the page.

Then the harness found the deeper half. With the rate as the dial, a novice
still scored 55 / 54 / 53 / 50 across all four rungs of LEAD, because LEAD's top
rung was 1.56 notes a second — a level-two chart wearing a level-five label.
**Accuracy is an average, so more notes at the same per-note difficulty gives
the same accuracy with less variance.** A melodic part is genuinely sparse and
no amount of thinning makes its top rung hard.

What fixed it was writing down the difference between the TUNE and the
TRANSCRIPTION. The written part is the skeleton; the master is the skeleton plus
the articulation a transcriber would actually notate — the sixteenth a guitar
hand plays on the way back up, the passing note between two melody notes a tone
apart, the ghost under a fill. Every one of those is a real sixteenth, so it
carries the lowest thinning priority there is and only appears near the top of
the ladder. L1 is still exactly the tune it was.

**So:** if your difficulty ladder is a thinning of some master, check that the
MASTER is at the top of the range you are claiming. A ladder whose top rung is
easy is a ladder with one rung and five buttons.

#### A CAP ENFORCED AGAINST A PARTIAL SET IS NOT A CAP

The thinner takes notes greedily in priority order and refuses any note that
would put more than N in a one-second window. Every local check passed and the
top rung still averaged 9.3 notes a second against a cap of 7 — because the pass
walks in PRIORITY order, so each candidate is tested against the notes kept so
far, and a note admitted early ends up inside a window that later notes filled
past the cap.

The fix is a sweep afterwards: find the fullest offending window, drop the
least important note in it, repeat. Twelve lines, and without it the assertion
that the game is physically playable was checking nothing.

**So:** when a greedy pass enforces a constraint on the SET it is building,
the constraint holds during the pass and not after it. Assert the property on
the finished output, not on the decisions.

#### THE LADDER HAS TO BE NESTED BY CONSTRUCTION, NOT BY HOPE

"Every note in a thinned chart exists at the same timestamp in L5" is in the
spec, and it is the sentence that makes "harder is denser, never different"
true rather than aspirational. Thinning each rung independently from the master
looked like it satisfied it and did not: the greedy pass makes different
choices under a different rate cap and a different lane count, so a note
appeared at rung three and was absent from rung five. Nothing visibly broke.
Each rung is now thinned from the rung ABOVE it, so the nesting is structural.

#### A HANDICAP THAT DOES NOT SCALE IS A TAX ON THE EASY LEVELS

The bot's slip rate — taps that land in the wrong lane — was a flat 7% per note
for a first-timer. At one note a second across two lanes nobody slips one note
in fourteen, and it dragged the whole bottom of the ladder under the pass bar
for reasons that had nothing to do with the chart. Slips come from being
rushed, so the rate scales with density against that hand's own ceiling.

Sister to Kim's Game's lesson about putting anatomy under the handicaps: a
handicap needs a mechanism, not just a number.

#### MEASURE THE THING YOU CANNOT HEAR

Thirty synth patches had to be level-matched and there was no ear in the room.
Rendering each one through an OfflineAudioContext and reading its RMS and peak
found two bugs an ear would have found and a list of numbers would not:

- **The voice gain was folded into velocity, and velocity is clamped to 1.0.**
  Every patch louder than unity was silently clipped back to unity, so the
  measured levels never converged and the three loudest patches in the product
  stayed exactly as loud as they had been.
- **The slide whistle needed eleven times the gain of everything else**, because
  its bandpass was PINNED at 2.2kHz and every note in every song sits below
  that. A number that far out of line is a patch fault, not a level.

Moving the gain to the front of the chain then made it a DRIVE control on any
patch with a waveshaper — turning the fuzz bass down to fit the room turned the
fuzz off. Velocity belongs in front of the distortion and level belongs behind
it.

The levelling itself is `min(rms_target / rms, 0.95 / peak)`: match how loud a
voice SOUNDS where you can, and never let one clip. Peak alone left a sustained
fuzz bass twice as loud as a plucked one; RMS alone let the sharp patches clip.
The audition page at `/voices.html` prints the table and plays every patch, so
the measurement is a thing somebody can look at rather than a number in a file.

#### A SOFT LOCK IS ONLY A LOCK IF EVERY DOOR RESPECTS IT

`band.claim` refused a part somebody else was holding. `daily.submit` did not —
so a second player could walk past the roster and overwrite a held slot with
their own take, which is precisely the failure the lock exists to prevent, one
layer further down. Found by writing the end-to-end test, not by reading it.

#### THREE CHOICES THAT LOOK THE SAME ARE ONE CHOICE

The loop picker offers three per tier. The first pass varied only the BACKDROP,
which is a tier property — so the three loops inside a tier were pixel-identical
and the screen was a row of the same picture asking the player to prefer one of
them. Moving the camera and putting one object in the room is the cheapest
difference an eye actually reads.

#### SMALLER THINGS, EACH PAID FOR

- **Your own claimed slot is not a locked door.** The roster disabled every
  claimed row including the player's own, so the one row they most wanted to tap
  was the one row that did nothing.
- **Every coordinate handed to a pixel renderer is an integer.** A float y makes
  the buffer index a float and the glyph lands somewhere else on the card
  entirely — the percentage was printing itself into the top-left corner of the
  picture, which looks like a corrupted PNG rather than a rounding bug.
- **Two lines in a caption need room for two lines.** The reveal's captions were
  set at 13% of a panel with both baselines inside it: on a 190px panel that is
  a 9px name and a 7px stat line nine pixels apart, and they printed on top of
  each other.
- **The template's 5x7 card face had no middle dot**, which is the character
  every stat line in this collection is built out of. Four games have now hit a
  missing glyph on this card; it draws a hollow box now.
- **Six people are six phones.** The end-to-end harness posted six takes from
  one socket, tripped the host's own per-IP rate limiter, and reported it as a
  game bug.

#### note

YOU CANNOT MEASURE A RATE LIMITER FROM OUTSIDE A PROXY, AND THE TWO ANSWERS LOOK IDENTICAL. ONE TAKE's host buckets its rate limit on the first entry of x-forwarded-for. Testing that from one laptop with two spoofed client IPs returned 429 for both — which is exactly what you see if the limiter is per-client and your spoof is being discarded, AND exactly what you see if the platform strips the header and every player on earth shares one bucket. The second case is a launch blocker: the whole game stops at 120 requests a minute. From a single machine the cases are indistinguishable, and reasoning about which proxy does what is guessing.

The measurement is ten lines: an endpoint behind the admin token that echoes what the server actually resolved, next to every candidate header. One request settled it — Railway discards the inbound header and sets 'real-client, edge-ip', so the first entry IS the client and the limiter was always correct. It also explained the harness failure: six simulated phones from one laptop are one bucket however they label themselves.

So: when a property can only be observed from inside, build the ten-line window rather than inferring it from the outside, and keep the window. And do not report 'not a bug' from an argument when the measurement costs one deploy — the cost of being wrong is the whole product falling over on its first busy minute.

---

### From Seat the Wedding (2026-09-15)

#### note

Relay's server has no MIME type for .ttf, so a self-hosted TTF font is served as application/octet-stream. Browsers accept it, but the template should map .ttf/.otf.

#### note

npm run brand painted a cake and then a wine glass for a seating-feud game: the words model turns a pitch into a generic still life. For a game about people, write the card prompt yourself (tools/card-art.mjs) naming the people, the conflict and the faces.

---

### From House Hide & Seek (2026-10-16)

#### The solve is the moment

A puzzle that ends the same frame its last move lands feels like nothing, and an empty result feels like a slap. The solve needs its own beat: boards off, the spot opens, a pause, then what is inside. The lock you cracked is celebrated whether or not anyone was behind it; empty is the punchline, not the punishment (reveal.mjs).
