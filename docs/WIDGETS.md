# Interactive widgets: contract

Each widget is a small, dependency-free interactive that lets a reader play with one idea from a free chapter, then points them to the interactive text (Cogniterra) to implement it.

## Files (one widget = exactly these files, nothing else)

- `assets/widgets/<id>.js`: vanilla ES2019 JavaScript, no build step, no external libraries. Wrap everything in an IIFE. Find every mount point with `document.querySelectorAll('[data-widget="<id>"]')` and render into it, so a page can hold several.
- `assets/widgets/<id>.css`: styles scoped under `.w-<id>`. Use the site tokens below; never hard-code fonts.
- `_includes/widgets/<id>.html`: the markup a lesson includes, e.g. `{% include widgets/<id>.html %}`. It must contain the mount `<div class="widget w-<id>" data-widget="<id>">`, a `<noscript>` line, and load its own assets with
  `<link rel="stylesheet" href="{{ '/assets/widgets/<id>.css' | relative_url }}">` and `<script defer src="{{ '/assets/widgets/<id>.js' | relative_url }}"></script>`.
- `tests/widgets/<id>.test.mjs`: a Node test (`node tests/widgets/<id>.test.mjs`, exit code 0 = pass) of the algorithm core against the book's own sample datasets and brute force on small cases. Put the algorithm core in the JS file as pure functions and expose them for the test with `if (typeof module !== 'undefined') module.exports = {...}` (the browser ignores it).

Do not edit any other file in the repo. Do not commit.

## Look and feel

The widget sits inside a lesson column about 720px wide and must work at 360px wide (phones) with no horizontal page scroll; wide content (grids, graphs) scrolls inside its own box.

Wrap it in the shared frame (already styled by the site CSS):

```html
<figure class="widget w-<id>" data-widget="<id>">
  <figcaption class="widget-head"><span class="widget-kicker">Try it</span> Title of the widget</figcaption>
  ... your UI ...
  <p class="widget-foot">One sentence that sends them to implement it: <a href="COGNITERRA_LESSON_URL">Implement ... in the interactive text</a>.</p>
</figure>
```

(`COGNITERRA_LESSON_URL` is given in your task.)

Site CSS custom properties you must use:

- Fonts: `var(--read)` (Palatino, body text), `var(--ui)` (Optima, labels and buttons), `var(--mono)` (code and DNA strings).
- Colors: `var(--navy)`, `var(--teal)`, `var(--orange)`, `var(--red)`, `var(--ink)`, `var(--muted)`, `var(--line)`, `var(--wash)`, `var(--paper)`.
- Nucleotides, always these (the book's colors): A `var(--nt-a)` #a03881, C `var(--nt-c)` #64b0f4, G `var(--nt-g)` #ff4363, T `var(--nt-t)` #66cc66.
- Buttons: use the site's `<button class="btn btn-small">` for actions.
- Dark mode exists: never assume a white background; draw on `var(--paper)` and stroke with `var(--ink)` or `var(--muted)`. For canvas, read the computed values of these properties at draw time and redraw on `matchMedia('(prefers-color-scheme: dark)')` change and when `document.documentElement` gets or loses `data-theme="dark"`.

## Behavior rules

- Show the working, not just the answer: step through the computation with Step / Play / Reset where it helps, with the current numbers on screen.
- Start with the book's own example already loaded, so it does something useful before any input.
- Validate input and say what is wrong in plain words; never throw.
- Keep inputs small enough to run instantly (cap lengths and say so).
- Respect `prefers-reduced-motion` (no autoplay animation; stepping still works).
- Accessible: real buttons and labels, keyboard usable, text alternatives for anything drawn (an `aria-live` status line describing the current step is ideal).
- Correctness is the bar. If a number on screen could be wrong, it is not done.
