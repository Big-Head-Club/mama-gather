# What other people's games taught them

`DESIGN-LESSONS.md` is what our own games paid for. This file is what somebody else's paid
for, read so we do not pay again. The source is Sascha Becker's design notebook
(https://saschb2b.github.io/game-mechanics/, repo `saschb2b/game-mechanics`): 18 games taken
apart and 20 cross-game patterns, each naming the game it came from. Read the original page
before leaning on an item here; this is the part of it that fits what we make.

What we make is short, often daily, played from a link on a phone, sometimes in a group chat or
on a TV, and judged on the first attempt. A lesson from a 60-hour ARPG only comes in if it still
holds at that size. The ones that do not are listed at the end, so nobody imports them by
accident.

---

## 1. One verb, and everything extends it

- **Build the game on one verb, then make every system extend that verb** (Mina the Hollower's
  burrow; Breath of the Wild's "write rules, not encounters"). A system that does not change how
  the verb plays is a second game bolted on. Our §12 "scope is the whole game" is the same point
  from the other side.
- **One resource, several verbs** (Hollow Knight's Soul pays for healing *and* spells; BotW's
  stamina climbs, glides and sprints). A single pool that both attacks and defends forces a real
  decision every time it is spent. Cannons in the Corner's energy — shots and walls from the same
  fifty — is this pattern; keep it that way.
- **Pick a dialectic and restate it fractally** (Slay the Spire: attack vs block at the card, turn,
  fight and run scale). If the game's central tension can't be said in five words, the systems
  will pull in different directions.
- **One guest mechanic per level, on a stable core** (Psychonauts 2). The daily version: the
  core never changes, and day N gets one named twist. It answers "what is different on day 30?"
  without a new ruleset.

## 2. Every choice is a trade

- **Power lives inside a budget** (Hollow Knight notches, Warframe mod capacity, Sparklite's patch
  grid). Taking one thing means not taking another. If the player can fit everything they want,
  the budget is decoration — Sparklite's mid-game went flat for exactly that reason.
- **Bonus with drawback for anything run-defining** (Spire boss relics, PoE keystones). The cost
  must bite the build the player has now, be shown plainly before the pick, and be felt every
  time — "−1 max HP" is not a drawback.
- **Pick one of three, and skipping is sometimes right** (Hades, Spire). Two options feel
  arbitrary, four feel like a menu. Foreshadow the *kind* of offer before it arrives (Hades' door
  icons) so players choose their route by build. A draft where skipping is never correct has
  smuggled "more is better" back in.
- **Subtractive beats additive** (Spire's card removal). Tighter is stronger. "Tight, not
  minimal": thinned too far, a build answers nothing it wasn't built for.
- **One option strictly dominating means there is no choice.** Spire tunes from data because of
  this. It is our `sweep-capabilities-first` and `no-optimal-build-from-the-seed` in their words —
  the sims are how we find it before a player does.
- **One line of code can be the economy** (Balatro's interest: $1 per $5 held, capped). Before
  adding a system, look for the single rule that makes saving vs spending a decision.

## 3. Show what is coming

- **Telegraph the threat, and never lie** (Spire's intent icons). Randomness moves off *what the
  enemy does* and onto *what you have to answer it with*, and combat becomes a puzzle instead of
  a coin flip. A telegraph that is sometimes wrong is worse than none. Too many at once is noise.
- **Reveal the debuff before the player commits** (Balatro's boss blinds are shown before the
  round). A hidden punishment reads as unfair; a shown one reads as a challenge.
- **Give the defender a verb** (Clair Obscur's parry). In anything where one player is attacked,
  the target needs something to *do* while it happens, or their turn is spectating. This is the
  question to ask of every multiplayer attack phase we build (Siege included).
- **Show the player that something is randomised** (Spire's visible map; Sparklite's reshuffle
  was too subtle and players missed it). Variety nobody can see is not variety.

## 4. Author the pieces, shuffle the arrangement

- **Hand-make the units, generate the layout** (Spire, Hades, Warframe tile sets, Sparklite). Where
  humans are good — one puzzle, one room, one encounter — author. Where they are bad — which eight
  of thirty, in what order — generate. If you catch yourself procedurally generating *puzzles*,
  stop: author the puzzles, shuffle the layout.
- **Constrain the generator with fixed beats** (Spire always puts a treasure on floor 6 and a rest
  on floor 9 of act 1). A seed must never produce a dead or shapeless day.
- **Too few units shows.** Reviewers noticed Sparklite's same rooms in new places. Tile modifiers
  (different hazard, spawn or light on the same base) multiply content cheaply.
- **The daily seed is community for free** (Spire's daily climb). Same seed for everyone is a
  conversation — which is Relay's whole premise; keep the daily on the base rules so it stays one.

## 5. Failure, difficulty and the floor

- **Graduate the death penalty** (Mina the Hollower). The first failure costs little, repeated
  failure costs more; nobody quits over the first death.
- **Healing (or recovering) is a moment of vulnerability** (Hollow Knight's Focus). Recovery that
  costs exposure is a decision; recovery that is free is a menu.
- **Ship the failure screen in the fiction's voice** (Clair Obscur). The loss card is the most-seen
  screen in a hard game; it should sound like the game, say what got you, and offer the retry.
- **Assists are toggles, not difficulty tiers, and they don't touch achievements**
  (Psychonauts 2). Hard defaults need a real floor or you lose people (Mina).
- **Anti-streak pity** (Spire). Randomness must not stack bad luck; after enough misses, the next
  roll is weighted toward the thing that has not come.
- **Separate ladders, not difficulty options** (PoE's leagues, Spire's Ascension). A harder mode is
  its own board and its own named rung, never a hidden multiplier on the same leaderboard.

## 6. Coming back

- **Meta unlocks variety, not power** (Spire). Run 1 and run 100 start at the same strength; what
  grows is the pool. Already our `roguelite-campaign` §5. Mixing the two confuses players about
  what a run is (Moonlighter 2's reviews).
- **Cumulative, not streak** (Warframe's login rewards). A streak that breaks punishes the player
  who was away; a count that only grows welcomes them back. Worth weighing against Relay's
  streaks: keep the streak as the brag, but never let a missed day take away something earned.
- **Every drop names what it unlocks** (Cult of the Lamb). No generic XP. A reward the player can't
  point at is noise.
- **Remove friction that has outlived its purpose** (PoE2). Friction added to protect a system
  should go when the system no longer needs protecting.

## 7. Feel and fiction

- **Do the verbs say what the game is about?** (the site's ludonarrative-resonance lens). Not a
  rule — Tetris owes its fiction nothing — but when two mechanics work equally well, take the one
  that affirms the fiction. Watch for drift: each addition reasonable, together out-voting the
  premise.
- **Put the UI in the fiction's handwriting** (Psychonauts 2; NieR's HUD chips you can remove;
  Mina's diegetic stat screen). The same move as our glow-ups: the interface is made of the
  game's material, not a second skin.
- **A hard constraint can do the art direction and the readability at once** (Mina's NES
  palette). Our one-green rule and flat fills are this.
- **Use an input format people already know** (Balatro's poker hands). A familiar grammar is a
  free tutorial.

## 8. How to decide

- **Metrics for closed puzzles, vision for sprawl** (Spire vs PoE). A daily with right answers
  should be tuned from data — tally and the sims. A sandbox is tuned from a written thesis, and the
  thesis has to be public or the nerfs feel arbitrary.
- **Don't trust playtester preferences over data; be ruthless about pruning** (Spire). What people
  *say* they want and what they *pick* differ. Pick rates on the weekly scoreboard are the tie-break.
- **Cite your inspirations** (Moonlighter 2). Name what a game borrows, in the credits and the
  notes — it is also how the next game finds the source.

---

## Do not import (wrong size for us)

These are real lessons for long games. At our size they cost more than they pay.

- **Late-introduced mechanics** (Xenoblade, Warframe). Dripping new systems 30 hours in needs a
  30-hour game and a player who stays. Ours are judged on attempt one: front-load the verb set
  (BotW) and deepen with context instead.
- **Currency-as-crafting, random perfect-roll economies, aspirational crafting** (PoE, Warframe).
  All three need player-to-player trade and tens of thousands of daily players. Below that, a
  perfect roll is vanity for the lucky and frustration for everyone else.
- **Nested progression graphs** (Warframe's nine axes). Each axis is a UI, a vocabulary and a
  tutorial. One axis, done well, is our budget.
- **Deliberately hidden depth with no in-game UI** (Pokémon IVs). It builds a wiki community over
  decades; in a daily it is simply invisible.

## Before the first line of rules

Add these to §1's gate questions:

1. What is the one verb, and what does each system change about it?
2. What does every choice cost? Is there a pick that is never wrong? (If so, it isn't a choice.)
3. What can the player see coming, and is any of it a lie?
4. If this is multiplayer, what does the player being attacked get to do?
5. What is authored and what is shuffled — and can the player tell it was shuffled?
6. What does failure cost the first time, and the fifth?
