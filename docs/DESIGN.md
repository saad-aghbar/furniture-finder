# Design & Motion — Furniture Finder

## Feel
Calm, warm, premium — like a well-made piece of furniture. Not a "techy" app. Soft materials,
generous spacing, big readable type, motion that feels physical (springs, slight weight),
never bouncy-cartoonish. Every animation must have a purpose: show where something came from,
confirm an action, or show progress.

## Tokens (CSS variables on :root, dark mode under [data-theme="dark"])
Colour — warm neutrals with a wood/olive accent:
```
--bg-glass:      rgba(250,248,244,0.82)   dark: rgba(28,26,23,0.80)
--surface:       #FFFDF9                   dark: #24211D
--surface-2:     #F4EFE7                   dark: #2E2A25
--text:          #1F1B16                   dark: #F3EEE6
--text-muted:    #6E655A                   dark: #A89D8F
--accent:        #8A5A2B  (walnut)         dark: #D2A06A
--accent-soft:   rgba(138,90,43,0.12)      dark: rgba(210,160,106,0.16)
--success:       #2F7D4F                   dark: #5CC48A
--danger:        #B3412E                   dark: #F0806C
--highlight:     #FFE3A3 (match highlight) dark: rgba(210,160,106,0.35)
--border:        rgba(31,27,22,0.10)       dark: rgba(243,238,230,0.10)
--shadow-bar:    0 10px 30px rgba(31,27,22,.18), 0 2px 6px rgba(31,27,22,.10)
```
Bar background: glass — `--bg-glass` + `backdrop-filter: blur(20px) saturate(140%)`
(Electron on Windows 11 may also use `setBackgroundMaterial('acrylic')`; fall back gracefully on Win10).
Radius: bar 28px (pill), cards 16px, menus 14px, buttons 12px.
Spacing scale 4/8/12/16/20/24/32.

Typography (bundle fonts locally, no network):
- Latin: **Inter** (variable). Arabic: **IBM Plex Sans Arabic**. Hebrew: **Assistant** or
  **Rubik**. Use `font-family: Inter, "IBM Plex Sans Arabic", Rubik, system-ui` so each script
  falls through to the right face.
- Sizes (Large = default): input 20px, card title 18px, chips 15px, source line 13px.
  Normal = ×0.9, Extra large = ×1.2 (scale via one `--font-scale` variable).

Icons: Lucide (outline, 1.75 stroke). App icon: a simple magnifier over a chair silhouette,
walnut on cream — generate as SVG, export `build/icon.ico` (16–256) and `icon.png`.

## RTL
Use CSS logical properties only (`margin-inline-start`, `inset-inline-end`, `text-align:start`).
`<html dir>` follows UI language. Animations that slide horizontally must flip direction in RTL
(read `dir` in the motion variants). Numbers/codes/paths in `<bdi dir="ltr">`.

## Component specs
**Search bar** — pill, 56px tall, glass. Idle opacity per setting (default 90%), 100% on hover
or focus. Focus: ring `0 0 0 3px var(--accent-soft)` that fades in. Scope button = soft chip with
label + chevron; ⋯ = 36px round icon button. A hairline progress bar along the bottom edge while
indexing (indeterminate shimmer when total unknown).

**Results panel** — detached card 8px below the bar, same width, glass, max-height 60vh, inner
scroll with soft fade masks top/bottom. Sticky file group headers.

**Result card** — title (bold, highlight marks with `--highlight` background, 4px radius),
chips row (wrap), source line muted. Hover: surface lifts (`--surface-2`, y −1px, shadow). Selected
via keyboard: 2px accent inline-start border.

**Menus/dropdowns** (scope picker, ⋯) — 14px radius, glass, 6px item padding, 40px item height
(big targets), keyboard navigable, typeahead.

## Motion spec (Motion / framer-motion)
Shared springs in `src/renderer/motion/tokens.ts`:
```ts
export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },  // menus, chips
  smooth: { type: 'spring', stiffness: 300, damping: 32 },             // panels, layout
  gentle: { type: 'spring', stiffness: 180, damping: 26 },             // onboarding, big moves
};
export const ease = { out: [0.22, 1, 0.36, 1], inOut: [0.65, 0, 0.35, 1] };
export const dur = { xs: .12, sm: .18, md: .28, lg: .45 };
```
| Moment | Animation |
|---|---|
| App launch / bar appears | Bar scales 0.92→1, y −12→0, opacity 0→1, blur 8px→0 (`gentle`). Search icon rotates −20°→0 slightly after (stagger 60ms). |
| Focus input | Bar width grows +16px (layout spring `smooth`), ring fades in 120ms. Placeholder slides 4px toward reading direction and fades. |
| Typing | Search icon does a subtle 1-cycle pulse when a query fires (scale 1→1.08→1, 220ms). While searching >150ms, icon morphs into a small spinner. |
| Results open | Panel: clipPath reveal from top (inset(0 0 100% 0) → inset(0)) + opacity, `smooth`. Cards stagger in: y 8→0, opacity 0→1, 25ms apart, max 10 staggered (rest appear together). |
| Results update | `AnimatePresence` + `layout` on cards: kept cards glide to new positions, removed fade/scale 0.98 out (sm), new fade in. No full re-mount flicker. Height of panel animates with `layout`. |
| Highlight | Match highlight background wipes in left→right (right→left in RTL), 180ms. |
| Results close | Reverse reveal, faster (dur.sm), cards don't stagger out. |
| Copy | Card does a quick press (scale .98→1, snappy); a "Copied ✓" pill pops from the click point (scale .6→1, opacity) and floats up 6px then fades after 1.1s; check-mark path draws (pathLength 0→1). Chip copy: chip flashes accent-soft. |
| Scope dropdown | Origin at the button; scale .96→1, opacity, y −4→0 (snappy). Tree expand: height auto via layout, chevron rotates 90°. Selected count badge pops (scale). |
| ⋯ menu | Same as dropdown, origin at ⋯. Items stagger 20ms. |
| Move mode | Bar gets animated dashed outline (stroke-dashoffset loop), slight lift (scale 1.02, stronger shadow). While dragging: follows cursor 1:1 (no lag), tilt ±2° based on horizontal velocity, settles to 0 on drop with `smooth`. Snap targets show as ghost pills; dropping near one magnetises (spring). |
| Hide/show bar | Hide: scale .96 + fade + y −8 (sm). Show: launch animation. |
| Onboarding steps | Shared-axis horizontal slide (x ±24px + fade), direction flips in RTL. Drop zone: dashed border animates when dragging over, icon bounces once; dropped items fly into the list (layout + scale from .8). |
| Indexing | Progress ring/line with spring-smoothed value; current file name crossfades; rows counter counts up (animated number). |
| Done | Check mark draws, a few wood-tone confetti particles (≤ 24, 900ms, canvas, disabled with reduced motion). |
| Toasts / update pill | Slide from bar bottom edge, y 6→0 + fade. |
| Errors | Gentle horizontal shake (x: 0,−6,6,−3,3,0 over 320ms) — once, never loops. |

Rules:
- 60 fps: animate only transform, opacity, clip-path, filter (small). Never width/height of the
  window per frame; resize the native window in one step (see ARCHITECTURE).
- Interruptible: every animation can be interrupted by the next state (springs, no setTimeout chains).
- **Reduced motion** (Windows "Animation effects" off, or setting): replace movement with ≤120ms
  opacity fades, no confetti, no tilt, no stagger.
- Nothing loops forever except the indexing shimmer and move-mode outline.

## Accessibility
Full keyboard use, visible focus, ARIA roles (combobox + listbox for search, menu for menus),
contrast ≥ 4.5:1, screen-reader labels in all 3 languages, hit targets ≥ 36px.
