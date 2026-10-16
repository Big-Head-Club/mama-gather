# Themes

A theme is a folder. That is the whole system.

```
themes/<name>/
  theme.json     colours + type, read by the server for the unfurl card
  theme.css      the same values as CSS custom properties, for the browser
  card.png       REQUIRED in a real game (npm test fails without it). 1200x630
                 or larger, real art, no text. Background of the share card.
                 `npm run brand -- "pitch"` generates it, plus brand.md (tone,
                 tagline, art direction) and the `card` colours in theme.json,
                 which override `colors` for the unfurl card only.
```

Switch with one line in `relay.config.mjs`:

```js
theme: "dusk",
```

`public/app.css` carries structure only and never mentions a colour, so nothing
in the layout changes when you swap. Two ship with the template: **paper** (the
house look — printed, not glassy: cream stock, full-ink rules, hard offset
shadows, no gradients or glows) and **dusk**, which exists to prove the seam.

## Adding one

Copy `themes/paper/`, change the values, keep the variable names. The full set:

`--ground --panel --panel-2 --ink --ink-dim --rule --rule-soft --accent
--accent-ink --good --warn --display --ui --mono --radius --rule-w --shadow-hard`

Two rules that are not optional:

1. **Every colour needs a definition on bare `:root`.** Define it only inside a
   media query and it is undefined for somebody. Redefine the dark palette under
   both `@media (prefers-color-scheme: dark)` — guarded with
   `:root:not([data-theme="light"])` — and `:root[data-theme="dark"]`, so an
   explicit choice wins in both directions.
2. **Set `color-scheme`.** Otherwise form controls and scrollbars come from the
   other world.

## Scaling by theme

The reason this is a folder and not a stylesheet: **one ruleset, many games**. A
deduction game is a lock, a safe, a constellation or a recipe depending only on
its theme folder and its three `how` lines — same code, different game to the
person playing it.

That is worth having even if you only ever ship one: a theme is also how you
reskin for a season, an event, or a collaboration without touching the rules.

When a theme needs art, keep it in the theme folder and address it through slot
names your game asks for, never file paths your game hardcodes.
