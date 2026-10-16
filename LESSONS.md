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

