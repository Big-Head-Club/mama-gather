# Mama Gather — assumptions

Written before the game was, checked on every `npm test`. Each of these is a
HYPOTHESIS, not a decision: the point is that it is written down where it can be
found to be wrong. When one breaks, run `node tools/assume.mjs break <id> "what
actually happened"` — that is the moment the lesson is cheap to capture.

Answers marked _auto_ are verified by `node tools/assume.mjs check`. The rest
need a sentence from you; the checker will not accept a blank or a TODO.

### independent-numbers [open]
> Which of your difficulty numbers are actually independent, and which are derived from the others?
_answer below. Vine Drop's spec listed 'tomatoes on the vine' as the dial. It is not one: count = drop rate x lifetime, so the spec's late-game numbers implied ~7 drops a second. Invisible until simulated._

Independent: walk speed (3 m/s), pickup radius (1.5 m), hint radius (5 m), the tier table (babies, spots, map size) and the star multipliers (1.25, 1.75). Derived, not dials: the optimal time (solver output from size + placement + speed), so the spec's 'target 3-star time' column is not a setting and comes out 3x shorter than written (Tiny ~10 s, Medium ~50 s at 3 m/s); the spot:baby ratio (spots/babies from the table); and the real search time, which depends on hint radius x spot density, not on either alone. Proof it is wrong: tools/bot.mjs search bot's ratio to optimal moves when only map size changes.

### terminates [open]
> Does every run end?
_auto — checked for you. Detritus, as specified, could not terminate. Nothing in its rules rewarded advancing._



### metric-moves [open]
> Does the leaderboard metric actually vary between runs?
_auto — checked for you. A metric that is the same for everybody is a leaderboard sorted by submission time wearing a hat._



### strip-not-fingerprint [open]
> Can the share strip be reversed into the answer?
_auto — checked for you. If the number of distinct strips approaches the number of distinct puzzles, the strip is an identifier and the game dies in the group chat that liked it most._



### rules-pure [open]
> Is the rules file free of the DOM, the clock and unseeded randomness?
_auto — checked for you. It is the anti-cheat, and it is only the anti-cheat while it is pure. One Date.now() and the server can no longer reproduce a run._



### deterministic [open]
> Does the same seed produce the same run, every time?
_auto — checked for you. Everything downstream — verification, the daily itself, the archive — is built on this._



### identity-set [open]
> Have you set key, title and epoch away from the template's defaults?
_auto — checked for you. Two games sharing a key hand out the same puzzle. An unset epoch means puzzle numbers that do not match the day you launched._



### share-card [open]
> Is there real art on the share card, and does it render?
_auto — checked for you. The card is the first thing a stranger sees, in a chat, before the game. It is the ad. Every game before Relay shipped one flat og.png with a title on it, and that is a bill, not an ad. Put a 1200x630 PNG at themes/<theme>/card.png first, then `npm run card` and look at it._



### practice-not-spoiler [open]
> Does the practice-gate seed collide with any real day's puzzle?
_auto — checked for you. The first-run practice round handing somebody next Tuesday's puzzle is a slow leak nobody would think to look for._



### credits [open]
> Is everyone whose work is in the game credited, by name, with a link?
_auto — checked for you. Credit generously wherever it is due. A pack of sounds, a font or a public-domain hash in a shipped game without its maker's name on it is a debt, and the home screen's Credits link is where it gets paid. The block lives in relay.config.mjs._



### one-handed [open]
> Can this be played one-handed on a phone, outdoors, while walking?
_answer below. That is how a link from a group chat is opened. If it needs a keyboard it is not a link game; daily-maze had to ship separate boards for mouse and touch._

Yes: one floating thumbstick anywhere on the screen is the whole input; no buttons during a run. The ability is automatic. Desktop gets WASD/arrows and a gamepad stick. Wrong if a tester has to use two hands to restart or to read the counter.

### day-boundary [open]
> Why did you pick this timezone for the day boundary, and who does it disadvantage?
_answer below. One global boundary means the chat always discusses one puzzle and someone can be spoiled. A per-player boundary means nobody is spoiled and the chat is incoherent. Three games here each picked differently, by accident._

America/Los_Angeles, one global boundary, like every Relay daily: the chat talks about one level, and the race for the best time only makes sense if everyone has the same day. Europe gets the new level mid-morning and can be spoiled by shape, but the share card carries only the route silhouette, never the baby spots.

### first-thirty-seconds [open]
> What does a stranger who has never heard of this see in their first thirty seconds?
_answer below. They arrived from a link, mid-conversation, with no context and no patience._

A forest, a fox, and a line of kits trotting behind her on the title screen; a tap on Play; a tutorial level of two kits with three captions (drag to walk, a rustling log has a kit in it, then the den). By thirty seconds they have a line behind them and have seen the clock. Wrong if the tutorial's first caption is not read before the first touch.

### still-fun-day-30 [open]
> What makes day 30 different from day 3? If nothing does, say so.
_answer below. 'It is randomised' is not an answer. Most dailies die of sameness, not of difficulty._

The week is the loop, not the day: Monday is three kits in a yard, Sunday is twenty across a map that takes three minutes to run well, so day 30 is a different size from day 3 and the same size as day 23. Retries turn search into routing, which is a second game on the same map. What does NOT change yet: the species. Until the roster is in, every day is the fox and its fence gaps; that is the shelf life of this build and the reason build step 3 exists.
