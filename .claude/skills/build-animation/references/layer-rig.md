# The layer rig — author by growth, solve depth

From `src/utils/DiveTransition.ts` and `src/styles/site/_dive.scss`. Read this when
building any CSS-3D parallax / dolly effect; the pattern is reusable and the reason it
works is not obvious from the code.

## The problem it solves

You want several layers to separate at visibly different rates, so the viewer feels
they are moving *through* a composition rather than watching it zoom. Two ways to do
that:

- **Four tweens.** Animate each layer's own scale/translate on its own curve. Four
  animated transforms per frame, four curves to keep in register, and the layers drift
  apart at frame zero unless you tune every one of them to agree.
- **One camera.** Put the layers at different depths inside one perspective context
  and animate a *single* transform on their shared parent. Perspective math produces
  the different rates for free. One animated transform per frame, and the rates are
  physically consistent by construction.

Use the camera. But then depth (`translateZ`) becomes the tuning parameter, and depth
is not the thing you care about — "how hard does this layer rush at me" is. So author
the growth and solve for depth.

## The math

With perspective `P` on the stage and a layer at depth `d` behind the z-origin, the
layer renders at scale `P / (P + d)`. Dolly the camera `Z` toward it and the distance
becomes `P + d − Z`, so:

```
apparent growth   g = (P + d) / (P + d − Z)
```

Invert for depth, and take the compensation that cancels the resting foreshortening:

```
depth             d = g·Z / (g − 1) − P
compensation      k = (P + d) / P
```

Apply `k` as a **static** scale on the layer, baked in at open time and never
animated. At camera `z = 0` every layer's `scale(k) · P/(P+d)` collapses to exactly
1 — **all layers coincide, frame zero is the source element and nothing else.** That
is the property worth protecting: it is what makes a FLIP entry an exact match rather
than a lookalike.

Note `d` goes **negative** for large `g` (a layer in front of the z-origin, rushing
past the viewer) and `k` correspondingly drops below 1. That is fine and expected.

```ts
const PERSPECTIVE = 900;   // stage perspective, px. Smaller = stronger separation.
const DOLLY = 560;         // how far the camera travels over one dive.

const depthOf = (g: number) => (g * DOLLY) / (g - 1) - PERSPECTIVE;
const compensationOf = (g: number) => (PERSPECTIVE + depthOf(g)) / PERSPECTIVE;
```

## The dive's numbers, and why they changed

Authored (first build, `436f949`):

| layer | growth | depth | compensation |
|---|---|---|---|
| far — image plane | 1.15× | 3393 | 4.77 |
| mid — dot grid | 1.6× | 593 | 1.66 |
| near — title | 2.2× | 127 | 1.14 |
| fore — index / cta / frame | 4.0× | −153 | 0.83 |

Shipped (after the raster fix, `5a54cd1`): far **1.12×**, mid **2.6×**, near **4.5×**,
fore **8.0×**, with the near-layer fades held longer (fore 0.28 → 0.42, near
0.45 → 0.58).

The revision is the interesting part. **The photo is deliberately the slowest layer**:
Step 0 measured `cover.jpg` (1950×1160) as already upscaled 1.55× at full bleed on a
DPR-2 desktop and 2.2× on a DPR-3 phone, so magnification cannot carry the travel
without going to mush. Keeping the photo slow was right for sharpness but left nothing
for it to separate *against* — so the resolution-independent layers (type, grid, frame)
had to travel much harder to restore the sense of motion, and had to stay on screen
longer or the sweep past the viewer faded out before it read.

**The rule that generalises: the layer with the least resolution headroom gets the
smallest growth, and the resolution-independent layers do the rushing.**

## Raster sizing — the part that is invisible in review

CLAUDE.md 7 states the prohibition. The implementation:

```ts
layoutFarPlane(boxWidth, boxHeight) {
  const growth = LAYERS[0].growth;
  const e = this.endScale(boxWidth, boxHeight);   // card → resting size
  const w = boxWidth * e * growth;                 // lay out at the END size
  const h = boxHeight * e * growth;
  const s = compensationOf(growth) / (e * growth); // scale DOWN to meet the card
  // ...width/height/left/top written from the box, transform = translateZ(-d) scale(s)
}
```

`layout × static-scale` is unchanged, so the composition and the frame-zero match are
byte-identical; only the split between them moves. Accumulated scale now runs
`(cardScale / endScale) → 1.0` and never exceeds 1, so the raster is always at least as
dense as the screen needs and only ever downsamples.

Centre the enlarged plane with `left`/`top` computed from the boxes, **not** a
percentage translate — a percentage translate resolves against the unscaled border box
and drifts once the static scale is applied.

**Symptom this fixes, so you can recognise it:** the image is mush for the whole
animation while text in sibling layers stays crisp, and it snaps sharp the instant the
timeline ends and `will-change` comes off. If it snaps sharp at the end, it is raster
scale, not source resolution.

## Resting size — fit vs cover

```ts
endScale(boxWidth, boxHeight) {
  const byWidth = window.innerWidth / boxWidth;
  return window.innerHeight > window.innerWidth
    ? byWidth                                                    // portrait: fit width
    : Math.max(byWidth, window.innerHeight / boxHeight);         // landscape: cover
}
```

Cover-filling 390×844 with a 16:10 composition scales the card 6.5×, and at 0.46 source
pixels per device pixel the photo goes to mush. Fitting to width lands it at
208 → 390 CSS px — no upscale at all — and the letterbox band above the teaser reads as
a deliberate layout. **A portrait viewport is not a small landscape one; give it its own
resting size rather than the same rule with worse numbers.**

## What must not be animated

Only the camera's Z and the FLIP wrapper's transform, plus a handful of layer
opacities. The layers never move on their own. If you find yourself adding a second
animated transform to a layer, you have left the rig and gone back to four tweens —
re-solve the growth instead.

Layer box sizes (`camera.style.width/height`, the far plane's box) are written **once
per dive, at open time**, never during one.

## Arriving somewhere

The plan's four layers all *left* during the dive, which for the cards with no photo
meant arriving at a flat colour field. Whatever you add to fix that must **fade up from
zero** so frame zero still matches the source exactly: the dive's accent glow (cards
without a photo only) and viewport vignette both do, and the dot grid rests at 0.18
instead of 0 so texture is still drifting at the far plane.
