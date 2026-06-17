# CAS BIS v2 — Readability, Fluidity & Visual Polish Plan

Comprehensive review of `src/App.tsx`, `src/App.css`, `src/geo.ts`, `src/data.ts`, `src/types.ts`.
Target: mobile Safari at cas-bis-v2.vercel.app. Priorities are ranked by visual impact.

---

## 🔴 P0 — Critical bugs (ship first)

### 1. Class-name collision: `.ml` is used for TWO unrelated things
- **`App.tsx:152`** — map marker label span: `<span class="ml">`
- **`App.tsx:322`** — right-panel marker list container: `<div className="ml">`
- **`App.css:120`** — `.ml { display: grid; gap: 7px; }` is applied to BOTH.

**Impact**: Every map marker label renders as a stretched grid column (looks broken); the "hide labels" toggle targets `.ml-mk` which never exists, so `showLabels=false` does nothing.

**Fix** — rename the map label class to `mk-lbl` and fix the selector:
```css
/* App.css — replace .ml-mk rules (lines 141-142) */
.mk-lbl {
  max-width: 120px; padding: 3px 6px;
  border: 1px solid rgba(143,255,172,0.25); border-radius: 6px;
  background: rgba(1,6,4,0.82); font-size: 10.5px; font-weight: 700;
  color: var(--txt); white-space: nowrap;
}
.mk.nl .mk-lbl { display: none; }
```
```ts
// App.tsx:152 — rename the span class
el.innerHTML = `<span class="ms" style="border-color:${col};color:${col}">${typeIcons[x.type]}</span><span class="mk-lbl">${x.name}</span>`
```

### 2. Marker DOM rebuilt on every selection change
- **`App.tsx:142-157`** — effect deps `[ready, sel, showLabels, markers, vis]` tear down & recreate ALL markers whenever `sel` changes. With 6 markers this is fine, but it flashes and breaks the hover state. It also re-attaches listeners each time.

**Fix** — split into two effects: one rebuilds markers on `[ready, markers, vis, showLabels]`, a second one just toggles the `on` class on the existing element when `sel` changes:
```ts
// Keep marker elements in a ref keyed by id
const mkElRef = useRef<Map<string, HTMLButtonElement>>(new Map())

useEffect(() => {
  const m = mapRef.current; if (!m || !ready) return
  mkRef.current.forEach(x => x.remove()); mkRef.current = []; mkElRef.current.clear()
  markers.filter(x => vis[x.side]).forEach(x => {
    const col = sideColors[x.side]
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `mk ${x.side}${sel === x.id ? ' on' : ''}${showLabels ? '' : ' nl'}`
    el.innerHTML = `<span class="ms" style="border-color:${col};color:${col}">${typeIcons[x.type]}</span><span class="mk-lbl">${x.name}</span>`
    el.setAttribute('aria-label', `${sideNames[x.side]} ${x.name} ${typeNames[x.type]}`)
    el.addEventListener('click', ev => { ev.stopPropagation(); setSel(x.id); setClick({ lat: x.lat, lng: x.lng }) })
    mkElRef.current.set(x.id, el)
    mkRef.current.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([x.lng, x.lat]).addTo(m))
  })
}, [ready, markers, vis, showLabels])   // ← sel removed

// Lightweight: just toggle the `on` class
useEffect(() => {
  mkElRef.current.forEach((el, id) => el.classList.toggle('on', id === sel))
}, [sel])
```

---

## 🟠 P1 — Readability & contrast (biggest visual win)

### 3. Type scale is erratic and too small on mobile
Current sizes: 0.62, 0.68, 0.7, 0.72, 0.76, 0.78, 0.8, 0.82, 0.85, 0.86, 0.88, 1.05, 1.3…rem. Many below 11px on a phone. Define a 6-step scale at `:root` and reference it:

```css
:root {
  /* type scale (rem) — min 0.75rem (12px) for body, 0.7rem for meta only */
  --fs-xxs: 0.7rem;   /* meta, status bar */
  --fs-xs:  0.78rem;  /* labels, captions */
  --fs-sm:  0.875rem; /* body text, chips */
  --fs-md:  1rem;     /* default */
  --fs-lg:  1.15rem;  /* card titles */
  --fs-xl:  clamp(1.35rem, 4vw, 1.85rem); /* h1/h2 */

  /* spacing scale */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px;

  /* radius scale */
  --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 22px; --r-pill: 999px;
}
```
Then bump every too-small size:
- `.tag` 0.62rem → `var(--fs-xxs)` and add `font-size: 0.7rem` minimum
- `.lab`, `.cl`, `.rc span`, `.cg span` → `var(--fs-xs)`
- `.sbar` 0.7rem → keep but ensure `min-width` chips don't shrink text
- `.mif small` 0.68rem → `var(--fs-xs)`
- body default → `var(--fs-sm)` so selects/buttons inherit 14px

### 4. `--mut` grey fails WCAG AA at small sizes
`#8aa595` on `rgba(9,22,16,0.93)` is ~4.3:1 — borderline at 12px. Bump to a lighter sage:

```css
:root {
  --mut: #a8c2b3;   /* was #8aa595 — now ~5.4:1 on bg2 */
  --mut-2: #c3d4c9; /* lighter still for tiny meta text */
}
```
Apply `--mut-2` to `.cl`, `.mif small`, `.tag` when on dark chips.

### 5. Touch targets under 44px (WCAG 2.5.5)
Almost every interactive element is ~32–36px tall. Add a global minimum and bump paddings:

```css
button, .dd, .mc, .b, .go, .gh, .del, .count, .tg label {
  min-height: 44px;
}
.b, .gh { padding: 10px 8px; }
.go, .del { padding: 12px; }
.dd { padding: 11px 12px; }
.tg input { width: 20px; height: 20px; }   /* was 14×14 */
.tg label { padding: 4px 0; }              /* grow hit area */
.mk { padding: 6px; }                       /* map marker tap target */
.mk .ms { width: 26px; height: 26px; }      /* was 22×22 */
```

### 6. No focus-visible outlines (keyboard users get nothing)
```css
:focus-visible {
  outline: 2px solid var(--grn);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}
.b:focus-visible, .go:focus-visible, .gh:focus-visible,
.del:focus-visible, .mc:focus-visible, .count:focus-visible {
  outline-offset: 1px;
}
```

---

## 🟡 P2 — Mobile layout & fluidity

### 7. Two panels eat the whole viewport on phones
At ≤720px, panel.L = 40svh + panel.R = 30svh + status bar = ~75% of screen covered. Map is barely visible. Convert to a single bottom sheet:

**Option A (quick win)** — stack into ONE scrollable sheet on mobile, toggle between "Controls" / "SITAC" tabs:
```css
@media (max-width: 720px) {
  .panel.L, .panel.R {
    left: 0; right: 0; bottom: 0; top: auto;
    width: 100%; max-height: 50svh;
    border-radius: 22px 22px 0 0;
    border-left: 0; border-right: 0; border-bottom: 0;
    padding-bottom: calc(20px + env(safe-area-inset-bottom));
  }
  .panel.L { display: none; }       /* hide by default */
  .panel.L.open { display: block; } /* toggle via state */
  .panel.R { display: none; }
  .panel.R.open { display: block; }
  /* tab switcher */
  .sheet-tabs { display: flex; ... }
  .sbar { bottom: calc(50svh + 8px); } /* lift above sheet */
}
```
Add a small JSX tab bar with two buttons bound to a `sheet` state (`'controls' | 'sitac'`).

**Option B (minimal)** — at least add safe-area insets and shrink:
```css
.panel.L { top: calc(8px + env(safe-area-inset-top)); }
.sbar { bottom: calc(12px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); }
```

### 8. No iOS momentum scrolling on panels
```css
.panel {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
}
```

### 9. Status bar horizontally scrolls — info gets lost
`.sbar { overflow-x: auto; flex-wrap: nowrap; }` means on mobile only ~3 chips are visible. Replace with a 2-line wrap or truncate:
```css
.sbar {
  flex-wrap: wrap;            /* was nowrap on mobile */
  justify-content: center;
  max-width: 100%;
  font-size: var(--fs-xxs);
}
.sbar span { white-space: nowrap; flex-shrink: 0; }
```
Also: the `Rings 200m/500m/...` chip gets very long — split into a shorter label or move to a tooltip.

### 10. Map move/mousemove re-renders entire app every frame
- `m.on('move', sync)` calls `setView` on every animation frame → triggers grid effect (depends on `view.zoom/lat/lng`) → `setData` on grid source every frame.
- `m.on('mousemove', ...)` calls `setCur` every pixel → full re-render.

**Fix** — RAF-throttle both:
```ts
let raf = 0
const scheduleSync = () => {
  if (raf) return
  raf = requestAnimationFrame(() => { raf = 0; sync() })
}
m.on('move', scheduleSync)

let curRaf = 0; let lastCur: LatLng | null = null
m.on('mousemove', e => {
  lastCur = { lat: e.lngLat.lat, lng: e.lngLat.lng }
  if (curRaf) return
  curRaf = requestAnimationFrame(() => { curRaf = 0; setCur(lastCur) })
})
```
Also debounce the grid effect — only regenerate when zoom bucket changes, not every lat/lng tick.

---

## 🟢 P3 — UX clarity & state communication

### 11. Active list item (`.mc.act`) only changes border color — invisible
```css
.mc.act {
  border-color: var(--ln2);
  background: rgba(143,255,172,0.12);
  box-shadow: inset 3px 0 0 var(--grn);   /* left accent bar */
}
```

### 12. Selected marker on map (`.mk.on`) — outline is subtle
```css
.mk.on .ms {
  outline: 2px solid var(--grn);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px rgba(143,255,172,0.18);
}
.mk.on { z-index: 5; }   /* bring above siblings */
```

### 13. Placing mode doesn't change the map cursor
```css
.app.placing .map { cursor: crosshair; }
.app.placing .mapwrap::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  border: 2px dashed rgba(255,209,102,0.4);
}
```
```tsx
<div className={`app${placing ? ' placing' : ''}`}>
```

### 14. Count buttons (`.count.dim`) — opacity 0.35 is the only "hidden" signal
Add a strikethrough or eye-off icon:
```css
.count.dim { opacity: 0.4; }
.count.dim::after {
  content: '∅'; position: absolute; top: 4px; right: 6px;
  font-size: 0.7rem; color: var(--mut);
}
.count { position: relative; }
```

### 15. No aria-* attributes anywhere
- Marker buttons: add `aria-label` (done in P0 fix above).
- Side selectors + toggles: add `aria-pressed`:
```tsx
<button aria-pressed={cSide === s} ...>
<label><input type="checkbox" aria-label="Range rings" ... />
```
- Banner: `role="status" aria-live="polite"`.
- Coord readouts: wrap in `<output>` or add `aria-live="polite"` so screen readers announce changes.

### 16. Delete button is one tap, no confirmation, no undo
Either add `window.confirm` or a 3-second undo toast. Quick version:
```tsx
const del = (id: string) => {
  if (!window.confirm('Supprimer ce marqueur ?')) return
  setMarkers(c => c.filter(m => m.id !== id))
  setSel(cur => cur === id ? (markers[0]?.id ?? '') : cur)
}
```

---

## 🔵 P4 — Visual consistency

### 17. Too many border-radius values (20, 14, 12, 10, 8, 7, 6, 4, 999)
Adopt the scale from #3 and replace:
- panel → `var(--r-xl)` (22px)
- blocks/cards → `var(--r-lg)` (16px)
- buttons/inputs → `var(--r-md)` (12px)
- chips → `var(--r-sm)` (8px)
- pills → `var(--r-pill)`

### 18. Scattered `rgba(143,255,172,…)` — use CSS color-mix or variables
```css
:root {
  --grn-12: rgba(143,255,172,0.12);
  --grn-18: rgba(143,255,172,0.18);
  --grn-38: rgba(143,255,172,0.38);
  --grn-line: var(--grn-18);
  --grn-line2: var(--grn-38);
}
```

### 19. Select dropdown options unreadable on iOS
iOS ignores most select styling, but the trigger should be clearly tappable. Ensure:
```css
.dd {
  appearance: none;
  background-image: url("data:image/svg+xml,...chevron..."); /* custom arrow */
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
```

### 20. Inconsistent shadow usage
Only `.panel` and `.banner` have shadows. Add subtle elevation to cards:
```css
.cas, .sd-card, .blk, .tg { box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
```

---

## 📋 Summary table — biggest visual impact, ranked

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | Fix `.ml`/`.ml-mk` class collision | 🔴 Huge — labels currently broken | XS |
| 3 | Type scale + min font sizes | 🔴 Huge readability | S |
| 5 | 44px min touch targets | 🟠 Big mobile UX | S |
| 7 | Mobile bottom-sheet layout | 🟠 Huge fluidity | M |
| 4 | Lighten `--mut` for contrast | 🟠 Readability | XS |
| 11/12 | Stronger selected/active states | 🟡 Clarity | XS |
| 6 | Focus-visible outlines | 🟡 A11y | XS |
| 10 | RAF-throttle move/mousemove | 🟡 Smoothness | S |
| 8 | iOS momentum scroll | 🟡 Smoothness | XS |
| 2 | Don't rebuild markers on sel | 🟢 Perf | S |
| 13 | Crosshair cursor in placing mode | 🟢 UX | XS |
| 15 | ARIA labels / aria-pressed | 🟢 A11y | S |

---

## Notes on geo.ts / data.ts / types.ts
- **geo.ts**: math is correct; no changes needed for readability. One nit: `decl()` is a toy approximation — already commented as such. Consider memoizing `gridFC` output when zoom bucket hasn't changed (perf win for #10).
- **data.ts**: `typeIcons` uses Unicode symbols (⚔ ⚙ ✈) — render inconsistently across fonts; consider SVG or MIL-STD-2525 glyphs for visual consistency. `sideShort` is declared but never used (dead code).
- **types.ts**: clean, no changes.
- **mapStyle.ts**: satellite brightness `0.72 max` is quite dark — panel readability is fine on top, but consider `0.78` for better context visibility.
