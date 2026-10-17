# Mama Gather — lessons

Things this game found out that the template did not already know. Write them
while they still smart. When one generalises beyond this game, run
`node tools/assume.mjs promote` to send it up.

Leave this file empty if nothing was learned. An empty file is an honest result;
inventing lessons to fill it makes the next person trust the list less.

## note

Raised ground in an iso 3D level needs its own top colour. A platform whose top is the same teal as the floor reads as a brown wall standing on flat grass, and an afternoon went into the renderer before anyone looked at the shape: tint the top (mint over teal), then check readability, not materials.


## note

A solver that treats a pickup disc as one node teleports inside it. A baby's disc straddling a cliff let the route arrive below and leave above; the tour has to be searched over the disc's cells, and a bot that walks the route through the real sim is the only proof the stars are reachable.


## note

Followers that track the leader's path exactly read as a snake. Mack: 'they gotta follow way less accurately, they are sloppy followers'. Each follower wants its own lag, sideways wobble, capped velocity so it cuts corners and overshoots, and a reason to stop now and then.


## note

A 30 Hz sim drawn straight onto a 60 Hz screen moves the player every other frame; Mack: 'the walking is so jittery'. Keep last-tick and this-tick positions in the sim and draw between them by the clock's fraction of a tick.


## note

The Relay scaffold's index.html does not load gameaday.js and its client has no shelf; hideseek added both by hand and so did this game. ship-check's gameaday:shelf is the only thing that notices. Worth moving into the template.


## note

A pickup disc's diagonal cell centre sits 9 cm inside a 1.5 m radius. A route through it is one loose step from a miss (the practice level's second kit). Keep a margin in the solver's disc so every routed cell is safely inside, and make the test driver hold at a baby's cell until it has joined.


## note

The template's art-only unfurl (share.textCard false) returned the plate for every link and never consulted share.cardArt; a run's route only reached the card after server.js was taught to ask cardArt when a token is present, and the token had to carry the route (26 points, two base64url chars each, ~52 chars). Worth moving into the template with the shelf tag and the portal build's gameaday filter.


## note

A sleeper (stay 1.5 s) and a wanderer (a kit running between two spots on a timer) are the two wrinkles that survive the solver: both cost a known wait the star thresholds can carry, both are visible on the ground, and a route bot can prove them walkable. Mud and ponds change the map; those two change the verb.


## note

A module the rules file imports is loaded by the browser too. card.mjs (node:fs for the plate) imported from game.rules.mjs blanked the game on the live site for a few minutes; the purity grep did not see it because it checks the rules file alone. Keep anything node-only behind the server's dynamic import, and walk the browser's import graph in the test (test/game.test.mjs does now).


## note

A finish that happens inside the frame loop's advance() is not a move and never reaches the log, so the server's replay ended with the run still in progress and every daily came back NOT SCORED: BADLOG. The view now writes the finishing tick into the log as the stick in force at that tick. Any resim game whose end comes from the clock rather than from an input needs the same line, and a client-style replay test (advance by the loop, log the finish, replay) to prove it.

