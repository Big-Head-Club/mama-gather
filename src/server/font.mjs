// A 5x7 bitmap face, written out as pixels so it can be read and corrected by
// eye. It only covers what the share card actually prints.

const G = {
  "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
  "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
  "2": ".###.|#...#|....#|...#.|..#..|.#...|#####",
  "3": "#####|...#.|..#..|...#.|....#|#...#|.###.",
  "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
  "5": "#####|#....|####.|....#|....#|#...#|.###.",
  "6": "..##.|.#...|#....|####.|#...#|#...#|.###.",
  "7": "#####|....#|...#.|..#..|.#...|.#...|.#...",
  "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
  "9": ".###.|#...#|#...#|.####|....#|...#.|.##..",
  A: ".###.|#...#|#...#|#####|#...#|#...#|#...#",
  B: "####.|#...#|#...#|####.|#...#|#...#|####.",
  C: ".###.|#...#|#....|#....|#....|#...#|.###.",
  D: "###..|#..#.|#...#|#...#|#...#|#..#.|###..",
  E: "#####|#....|#....|####.|#....|#....|#####",
  F: "#####|#....|#....|####.|#....|#....|#....",
  G: ".###.|#...#|#....|#.###|#...#|#...#|.####",
  H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
  I: ".###.|..#..|..#..|..#..|..#..|..#..|.###.",
  J: "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
  K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
  L: "#....|#....|#....|#....|#....|#....|#####",
  M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
  N: "#...#|##..#|#.#.#|#..##|#...#|#...#|#...#",
  O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
  P: "####.|#...#|#...#|####.|#....|#....|#....",
  Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
  R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
  S: ".####|#....|#....|.###.|....#|....#|####.",
  T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
  U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
  V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
  W: "#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#",
  X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
  Z: "#####|....#|...#.|..#..|.#...|#....|#####",
  " ": ".....|.....|.....|.....|.....|.....|.....",
  ":": ".....|..#..|..#..|.....|..#..|..#..|.....",
  ".": ".....|.....|.....|.....|.....|.##..|.##..",
  "?": ".###.|#...#|....#|...#.|..#..|.....|..#..",
  ",": ".....|.....|.....|.....|..##.|..#..|.#...",
  "!": "..#..|..#..|..#..|..#..|..#..|.....|..#..",
  "%": "##..#|##.#.|...#.|..#..|.#...|.#.##|#..##",
  "#": ".#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.",
  "-": ".....|.....|.....|#####|.....|.....|.....",
  "/": "....#|...#.|...#.|..#..|.#...|.#...|#....",
  // A MIDDOT, because every stat line in this collection is written "4/6 · 41s"
  // and the face did not have one. Four games have now hit a missing glyph on
  // this card; see the tofu fallback in drawText for the half that catches the
  // next one.
  "\u00b7": ".....|.....|..#..|.###.|..#..|.....|.....",
  "'": "..#..|..#..|.....|.....|.....|.....|.....",
}

export const GLYPH_W = 5
export const GLYPH_H = 7

export function glyph(ch) {
  return G[ch] || G[ch.toUpperCase()] || null
}

export function textWidth(str, scale, tracking = 1) {
  return str.length * (GLYPH_W + tracking) * scale - tracking * scale
}

// Draws into an RGBA buffer. No antialiasing on purpose — at the sizes the OG
// card uses, a hard pixel face looks deliberate and a blurry one looks broken.
export function drawText(buf, w, h, str, x0, y0, scale, color, tracking = 1) {
  const [r, g, b, a = 255] = color
  let x = x0
  for (const ch of str) {
    const gl = glyph(ch)
    // A CHARACTER THE FACE DOES NOT HAVE DRAWS A HOLLOW BOX, not nothing.
    // Drawing nothing while still advancing the cursor is a silent hole in the
    // middle of a number, and it has bitten this card in four separate games.
    // An assertion catches it in the game that remembers to write one; tofu
    // catches it in every game forever.
    const draw = gl || (ch === " " ? null : "#####|#...#|#...#|#...#|#...#|#...#|#####")
    if (draw) {
      const gl = draw
      const rows = gl.split("|")
      for (let ry = 0; ry < rows.length; ry++) {
        for (let rx = 0; rx < rows[ry].length; rx++) {
          if (rows[ry][rx] !== "#") continue
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = x + rx * scale + sx
              const py = y0 + ry * scale + sy
              if (px < 0 || py < 0 || px >= w || py >= h) continue
              const i = (py * w + px) * 4
              const al = a / 255
              buf[i] = buf[i] * (1 - al) + r * al
              buf[i + 1] = buf[i + 1] * (1 - al) + g * al
              buf[i + 2] = buf[i + 2] * (1 - al) + b * al
              buf[i + 3] = 255
            }
          }
        }
      }
    }
    x += (GLYPH_W + tracking) * scale
  }
  return x
}
