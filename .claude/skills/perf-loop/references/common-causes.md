# Common causes of jank in 3D + scroll-animation front-ends

Read this during Phase 3 (hypotheses). It is a checklist to generate candidates, not a list of things to change blindly — each item still has to be confirmed by a profile and proven by a re-measurement.

## Contents
1. Competing render loops
2. Image-sequence (WebP/PNG) scroll animations
3. Scroll handling
4. Layout thrash and compositing
5. WebGL / Three.js / React Three Fiber
6. React re-render storms
7. Leaks and teardown
8. Load-time weight

---

## 1. Competing render loops

The single most common cause when two animation systems were built separately and then combined.

- Two or more independent `requestAnimationFrame` loops (e.g. a Three.js `renderer.setAnimationLoop` **plus** a scroll-sequence loop **plus** GSAP's ticker). Each one schedules work in the same 16.7 ms window and they interleave badly.
- **Fix pattern:** one master rAF loop. Drive everything from it — GSAP via `gsap.ticker`, the 3D scene via a manual `renderer.render()` call, the scroll sequence via a draw call. Order the work: read all state first, then write/render.
- Animations driven by scroll *events* instead of the rAF loop. Scroll events can fire more often than frames, doing work that is thrown away.

## 2. Image-sequence (WebP/PNG) scroll animations

- **Decoding on the main thread.** `<img src>` swapping or `drawImage` with an undecoded bitmap blocks the frame. Preload every frame and `await img.decode()`, or better, decode to `ImageBitmap` via `createImageBitmap()` (off-thread) and cache those.
- **Too many frames or frames too large.** 300 frames × 1920 px is hundreds of MB decoded in memory even if the WebP files are small on disk. Decoded size ≈ width × height × 4 bytes, regardless of compression. Cut frame count (every 2nd/3rd frame), cap width to the largest CSS size actually rendered, and serve a smaller set to mobile.
- **Loading during the scroll** instead of before it. Preload the sequence behind a loader or during idle time; a network round-trip mid-scroll is a guaranteed stall.
- **`<img>` instead of `<canvas>`.** A canvas with a cached `ImageBitmap` and one `drawImage` per frame is usually far cheaper than swapping DOM images.
- **Consider replacing the sequence with a video** (WebM/HEVC) driven by `currentTime`, or with a CSS/WebGL effect. A 200-frame sequence is often a several-MB video instead — but seeking video per frame has its own cost, so measure both.

## 3. Scroll handling

- Scroll listener without `{ passive: true }` — blocks the compositor.
- Work done directly in the scroll handler instead of storing the value and reading it once per frame.
- Smooth-scroll library (Lenis, Locomotive) running its own rAF loop alongside everything else — hook it into the master loop.
- `ScrollTrigger` instances created inside a component that remounts, so they stack up. Kill them in cleanup and call `ScrollTrigger.refresh()` after layout changes.
- Heavy `scrub` values, or `scrub: true` on a timeline that does layout-affecting work each tick.

## 4. Layout thrash and compositing

- Animating `width`, `height`, `top`, `left`, `margin` — these trigger layout on every frame. Animate `transform` and `opacity` instead. An expanding panel is usually `scaleX` + a counter-scale on the content, not an animated `width`.
- Read-then-write interleaving: reading `offsetWidth` / `getBoundingClientRect()` after a style write forces a synchronous reflow. Batch all reads, then all writes.
- `will-change` missing on the element that animates — or present on dozens of elements, which wastes GPU memory. Use it narrowly and remove it after the animation.
- Large `filter: blur()`, `backdrop-filter`, or big `box-shadow` on an animating element — expensive per frame.
- Too many composited layers, or an animating element that keeps being promoted and demoted.

## 5. WebGL / Three.js / React Three Fiber

- **Pixel ratio uncapped.** `setPixelRatio(window.devicePixelRatio)` on a 3× phone renders 9× the pixels. Cap: `Math.min(devicePixelRatio, 2)`, and lower on mobile.
- **Rendering every frame when nothing moves.** R3F: `frameloop="demand"` + `invalidate()`. Vanilla: only call `render()` when state changed or an animation is active. A static hero scene should render 0 frames while idle.
- **Rendering while off-screen.** Pause the loop with an `IntersectionObserver` when the canvas is out of view, and on `visibilitychange`.
- **Draw call count.** Many separate meshes — merge geometries or use `InstancedMesh`. Check `renderer.info.render.calls` and `triangles`.
- **Textures.** Uncompressed PNG/JPG textures decode to full RGBA in GPU memory; prefer KTX2/Basis, power-of-two sizes, and mipmaps. Dispose on unmount.
- **Shadows and post-processing.** Shadow maps and effect passes are often the entire frame budget. Try disabling each in turn to see what the profile says.
- **Object allocation inside the frame loop** — `new THREE.Vector3()` per frame per object causes GC pauses. Hoist and reuse.
- **Renderer recreated on re-render** (React) — the canvas should mount once; check with a `console.count` in the init path or React DevTools.

## 6. React re-render storms

- State updated on every scroll/pointer/frame event. Keep per-frame values in a `useRef` and write to the DOM/scene directly; only use state when React actually needs to re-render.
- Missing memoization on props passed into the 3D scene — new object/array/function identities each render force children to update.
- Context providers whose value changes every frame, re-rendering the whole subtree.
- Expensive work inside the render body instead of `useMemo`.
- Verify with the React DevTools profiler or `<Profiler>` — don't assume.

## 7. Leaks and teardown

Symptoms: fine on first visit, janky after navigating around, heap grows monotonically.

- `removeEventListener` missing for scroll/resize/pointer/visibility listeners.
- `cancelAnimationFrame` not called on unmount.
- `ScrollTrigger.kill()` / `timeline.kill()` / observer `disconnect()` missing.
- Three.js: `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, `renderer.dispose()` on unmount.
- Cached `ImageBitmap`s never released — call `.close()` when the sequence is discarded.

## 8. Load-time weight

Separate problem from frame jank, but the user usually feels them as one thing.

- Everything imported eagerly. Dynamic-import the 3D scene and animation libraries; render a lightweight placeholder until visible.
- Fonts blocking render — `font-display: swap`, subset, preload only what's above the fold.
- No image `sizes`/`srcset`, so mobile downloads desktop assets.
- Bundle analyzer will show which dependency dominates — run it before guessing.
