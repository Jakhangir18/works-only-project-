/**
 * The walking lane on the Zombie Walk Home case page: a three.js scene the
 * scroll walks through. The numbers are strideLane.ts's; this file only
 * turns them into meshes and keeps them in step with the page.
 *
 * Markup (zombie-walk-home.astro): `.js-zw-hero` is the runway, tall under
 * the motion query in CSS from the first paint; inside it a sticky stage
 * with the text (`.js-zw-copy`, `.js-zw-hud`) and the lane's box
 * (`.js-zw-box`) holding the poster, over which this file puts a canvas.
 *
 * The three questions of .claude/skills/build-animation, answered:
 * - Which loop: gsap.ticker (CLAUDE.md 6), and only while something is
 *   moving. A scroll sets a target; the callback is added then, eases the
 *   walk toward it, and takes itself off when the walk has arrived and no
 *   step is still landing, the way player.ts does. There is no standing loop.
 * - What pauses it: the scroll listener exists only while the runway
 *   intersects the viewport (IntersectionObserver), a hidden tab drops the
 *   callback, and with no scroll there is no target to chase (invariant 1).
 * - What kills it: `stop()`, returned by `start()` and called when the
 *   motion query turns to "reduce" and on a real unload (pagehide that is
 *   not a freeze). It removes every listener and observer, disposes every
 *   geometry, material and the renderer, takes the canvas out and clears
 *   every style it wrote (invariant 4).
 *
 * On a frame where the walk has not moved the callback is not on the ticker
 * at all (invariant 5). Geometry is read in the ResizeObserver callback and
 * nowhere else; a resize sets the size, the camera and draws in that one
 * callback, because setting a canvas's size clears it and a settled walk
 * would never repaint it (invariants 3 and 8).
 *
 * Per-frame writes: one group position for the lawn, one for the flowers,
 * one for the house; an instance matrix and colour for a flower only on the
 * frame it is stepped on; two material colours for the prints; and in the
 * DOM, through writeIfChanged, the title block's and the HUD's opacity
 * (hundredths), the rail's scaleX (thousandths), and text only when a
 * number or a phase changes (twelve steps, five phases a walk).
 *
 * Where it does not run: reduced motion (CSS has no runway there and this
 * file does nothing), Save-Data, no WebGL or only a software one
 * (failIfMajorPerformanceCaveat), and a device that cannot draw the scene
 * in SLOW_MS a frame even at one device pixel per CSS pixel. Those keep the
 * poster, and the runway is folded away (`is-still`); a reader already
 * below the top gets the folded height back in the scroll, so what they
 * are reading does not move. The hero says which it is in `data-scene`
 * ("live" or "still").
 */

import type * as THREEType from "three";
import { writeIfChanged, forgetLeaf } from "./leafWrite";
import {
  CAMERA,
  COLORS,
  DAWN_GAIN,
  FLOWERS,
  FLOWER_RADIUS,
  FOG_FAR,
  FOG_NEAR,
  GOLD_SCALE,
  HEART_RADIUS,
  HOUSE_AT,
  LANE_WIDTH,
  LANE_X,
  NIGHT,
  PETAL_RING,
  PHASES,
  PORCH_RADIUS,
  PORCH_Y,
  PRESSED_FADE,
  PRESSED_SCALE,
  PRINT_LENGTH,
  PRINT_PARTS,
  PRINT_Z,
  ROWS_AHEAD,
  ROWS_BEHIND,
  TAPE_DEPTH,
  TAPE_HALF,
  TILE,
  COPY_END,
  HUD_END,
  HUD_FROM,
  WALK_END,
  clamp01,
  dawnAt,
  distanceAt,
  lawnShift,
  phaseAt,
  printGlow,
  smooth,
  stepsLanded,
} from "./strideLane";

/** The stylesheet draws the runway under the same query. */
const MOTION = "(prefers-reduced-motion: no-preference)";
/** The drawing buffer's ceiling, in pixels: a 2x buffer of a large box is
 *  tens of megabytes for a picture of flat colour. */
const MAX_PIXELS = 2_400_000;
/** The walk follows the scroll with this time constant. Longer floats. */
const FOLLOW_MS = 90;
/** How long a step takes to land, and the camera's dip inside it. */
const IMPACT_MS = 420;
const DIP_MS = 250;
/** A device that needs longer than this for one frame keeps the poster. */
const SLOW_MS = 30;

type Three = typeof THREEType;

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const attrs = { failIfMajorPerformanceCaveat: true };
    const gl = (canvas.getContext("webgl2", attrs) || canvas.getContext("webgl", attrs)) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Flat ellipses on the floor as one indexed geometry: [x, z, rx, rz] each. */
function floorDiscs(THREE: Three, discs: readonly (readonly [number, number, number, number])[], segments: number): THREEType.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  for (const [cx, cz, rx, rz] of discs) {
    const base = positions.length / 3;
    positions.push(cx, 0, cz);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(cx + Math.cos(a) * rx, 0, cz + Math.sin(a) * rz);
    }
    // Wound so the face looks up, toward the camera.
    for (let i = 0; i < segments; i++) index.push(base, base + 1 + ((i + 1) % segments), base + 1 + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

export function initStrideScene(): void {
  if (typeof window === "undefined") return;
  const hero = document.querySelector<HTMLElement>(".js-zw-hero");
  const stage = hero?.querySelector<HTMLElement>(".js-zw-stage");
  const box = hero?.querySelector<HTMLElement>(".js-zw-box");
  if (!hero || !stage || !box) return;

  // The runway is sized in svh. Where the unit is unknown (Safari before
  // 15.4) the stylesheet draws no runway, and there is nothing to walk.
  if (!window.CSS?.supports?.("height", "100svh")) return;

  const motion = window.matchMedia(MOTION);
  let stop: ((flip: boolean) => void) | null = null;
  const sync = () => {
    if (motion.matches && !stop) stop = start(hero, stage, box);
    else if (!motion.matches && stop) {
      stop(true);
      stop = null;
    }
  };
  const begin = () => {
    motion.addEventListener("change", sync);
    // A real unload takes the scene down; a freeze into the back/forward
    // cache keeps it, and the scene's own pageshow handler redraws it.
    window.addEventListener("pagehide", (event) => {
      if (event.persisted || !stop) return;
      stop(false);
      stop = null;
    });
    sync();
  };
  // The scene is decoration over a hero that is already complete: it waits
  // for the page to load and the browser to be idle before fetching three.
  const idle = () => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(begin, { timeout: 2000 });
    else setTimeout(begin, 300);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

function start(hero: HTMLElement, stage: HTMLElement, box: HTMLElement): (flip: boolean) => void {
  // A hero already folded (an earlier start found the scene could not run)
  // has no runway to walk.
  if (hero.classList.contains("is-still")) return () => {};

  let dead = false;
  let teardown: ((flip: boolean) => void) | null = null;

  /* The poster stays, and the runway folds away. */
  const still = () => {
    hero.dataset.scene = "still";
    if (hero.classList.contains("is-still")) return;
    // Folding the runway takes height from above a reader who is already
    // past it; the scroll gives the same amount back, so what they are
    // reading stays where it is.
    const before = hero.offsetHeight;
    const y = window.scrollY;
    hero.classList.add("is-still");
    if (y >= 8) window.scrollTo(0, Math.max(0, y - (before - hero.offsetHeight)));
  };

  (async () => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (saveData || !hasWebGL()) return still();

    const [THREE, { gsap }] = await Promise.all([import("three"), import("gsap")]);
    if (dead) return;

    /* ---- the renderer, on the existing path (DottedSurface.astro) ---- */
    const canvas = document.createElement("canvas");
    canvas.className = "zw-hero__canvas";
    canvas.setAttribute("aria-hidden", "true");
    let renderer: THREEType.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: window.devicePixelRatio < 2,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      return still();
    }
    renderer.setClearColor(NIGHT, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(NIGHT, FOG_NEAR, FOG_FAR);
    const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    camera.position.set(...CAMERA.position);
    camera.lookAt(...CAMERA.target);

    /* Everything lies in one plane or stands behind it, so nothing tests
       depth: the order is the painter's, by renderOrder, as in the poster. */
    const disposables: { dispose(): void }[] = [];
    const flat = (colour: string, fog = true) => {
      const material = new THREE.MeshBasicMaterial({ color: colour, fog, depthTest: false, depthWrite: false });
      disposables.push(material);
      return material;
    };
    const keep = <T extends { dispose(): void }>(thing: T): T => {
      disposables.push(thing);
      return thing;
    };
    const add = <T extends THREEType.Object3D>(object: T, order: number, parent: THREEType.Object3D = scene): T => {
      object.renderOrder = order;
      object.frustumCulled = false;
      parent.add(object);
      return object;
    };

    /* The lawn: one mesh, vertex colours, two rows longer than it shows, so
       sliding it by less than its two-row period never uncovers an end. */
    const lawnMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false });
    disposables.push(lawnMaterial);
    const lawn = (() => {
      const positions: number[] = [];
      const colours: number[] = [];
      const index: number[] = [];
      const tint = [new THREE.Color(COLORS.lawnA), new THREE.Color(COLORS.lawnB)];
      for (let row = -ROWS_BEHIND; row < ROWS_AHEAD + 2; row++) {
        for (let lane = 0; lane < 2; lane++) {
          const x0 = LANE_X[lane] - LANE_WIDTH / 2;
          const x1 = LANE_X[lane] + LANE_WIDTH / 2;
          const z0 = -row * TILE;
          const z1 = z0 - TILE;
          const base = positions.length / 3;
          positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
          const c = tint[(((row + lane) % 2) + 2) % 2];
          for (let i = 0; i < 4; i++) colours.push(c.r, c.g, c.b);
          index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
      const geometry = keep(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
      geometry.setIndex(index);
      return add(new THREE.Mesh(geometry, lawnMaterial), 1);
    })();

    /* The flowers: twelve instances of one rosette and one heart, standing
       where the walk will meet them, under a group the distance slides. */
    const flowers = new THREE.Group();
    scene.add(flowers);
    const petalGeometry = keep(floorDiscs(THREE, PETAL_RING.map(([x, z, r]) => [x, z, r, r] as const), 14));
    const heartGeometry = keep(floorDiscs(THREE, [[0, 0, HEART_RADIUS, HEART_RADIUS]], 14));
    const petals = add(keep(new THREE.InstancedMesh(petalGeometry, flat("#ffffff"), FLOWERS.length)), 2, flowers);
    const hearts = add(keep(new THREE.InstancedMesh(heartGeometry, flat(COLORS.heart), FLOWERS.length)), 3, flowers);
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    const lawnGreen = new THREE.Color(COLORS.lawnB);
    const pressedNow: boolean[] = FLOWERS.map(() => false);
    /** One flower's instance, whole or pressed, with a pop while it lands. */
    const setFlower = (i: number, pressed: boolean, pop = 0) => {
      const f = FLOWERS[i];
      const r = FLOWER_RADIUS * (f.kind === "gold" ? GOLD_SCALE : 1) * (pressed ? PRESSED_SCALE * (1 + pop * 0.3) : 1);
      matrix.makeScale(r, 1, r).setPosition(LANE_X[f.lane], 0, -f.at);
      petals.setMatrixAt(i, matrix);
      colour.set(COLORS[f.kind]);
      if (pressed) colour.lerp(lawnGreen, PRESSED_FADE);
      petals.setColorAt(i, colour);
      matrix.makeScale(pressed ? 0 : r, 1, pressed ? 0 : r).setPosition(LANE_X[f.lane], 0, -f.at);
      hearts.setMatrixAt(i, matrix);
      pressedNow[i] = pressed;
      petals.instanceMatrix.needsUpdate = true;
      hearts.instanceMatrix.needsUpdate = true;
      if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
    };
    FLOWERS.forEach((_, i) => setFlower(i, false));

    /* The house at the end of the lane, upright, and the dawn behind it. */
    const house = new THREE.Group();
    scene.add(house);
    /* The dawn is a low mound of warm light behind the house: one vertex at
       the middle of the wall's foot takes the colour, the five round it stay
       the night's, so it has no edge and ends inside the lane's box. */
    const glowGeometry = keep(new THREE.PlaneGeometry(7.6, 3.6, 2, 1));
    glowGeometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(18), 3));
    const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthTest: false, depthWrite: false });
    disposables.push(glowMaterial);
    const glow = add(new THREE.Mesh(glowGeometry, glowMaterial), 4, house);
    glow.position.set(0, 1.8, -1.5);
    const wall = add(new THREE.Mesh(keep(new THREE.PlaneGeometry(2.7, 1.7)), flat(COLORS.houseWall)), 5, house);
    wall.position.set(0, 0.85, 0);
    const roofGeometry = keep(new THREE.BufferGeometry());
    roofGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-1.7, 1.7, 0, 1.7, 1.7, 0, 0, 2.9, 0], 3));
    add(new THREE.Mesh(roofGeometry, flat(COLORS.houseRoof)), 5, house);
    const door = add(new THREE.Mesh(keep(new THREE.PlaneGeometry(0.56, 0.95)), flat(COLORS.heart)), 6, house);
    door.position.set(0, 0.475, 0);
    const porch = add(new THREE.Mesh(keep(new THREE.CircleGeometry(PORCH_RADIUS, 20)), flat(COLORS.porch, false)), 7, house);
    porch.position.set(0, PORCH_Y, 0);
    const night = new THREE.Color(NIGHT);
    const dawnGlow = new THREE.Color(COLORS.dawnGlow);

    /* The hit line and the two prints the walker stands on. */
    const tape = add(new THREE.Mesh(keep(new THREE.PlaneGeometry(TAPE_HALF * 2, TAPE_DEPTH * 2)), flat(COLORS.tape)), 8);
    tape.rotation.x = -Math.PI / 2;
    const printGeometry = keep(floorDiscs(THREE, PRINT_PARTS, 18));
    const printRest = new THREE.Color(COLORS.printRest);
    const printLit = new THREE.Color(COLORS.print);
    const prints = LANE_X.map((x) => {
      const mesh = add(new THREE.Mesh(printGeometry, flat(COLORS.printRest)), 9);
      mesh.position.set(x, 0, PRINT_Z);
      mesh.scale.setScalar(PRINT_LENGTH);
      return mesh;
    });

    /* ---- the page's side: the leaves this file writes ---- */
    const copy = hero.querySelector<HTMLElement>(".js-zw-copy");
    const hud = hero.querySelector<HTMLElement>(".js-zw-hud");
    const rail = hero.querySelector<HTMLElement>(".js-zw-rail");
    const countIn = hero.querySelector<HTMLElement>(".js-zw-count-in");
    const countOut = hero.querySelector<HTMLElement>(".js-zw-count-out");
    const phases = [...hero.querySelectorAll<HTMLElement>(".js-zw-phase")];
    const leaves = [copy, hud, rail].filter((el): el is HTMLElement => !!el);
    let shownSteps = -1;
    let shownPhase = -1;

    /* ---- state ---- */
    let target = 0;
    let current = 0;
    let lastLanded = 0;
    let shownDawn = -1;
    let ticking = false;
    let contextLost = false;
    let dirty = false;
    let onScreen = false;
    let width = 0;
    let height = 0;
    let ratio = 1;
    /** The most device pixels per CSS pixel the buffer may have: 2, or 1
     *  once the timing below has found 2 too slow. */
    let cap = 2;
    let live = false;
    let from = 0;
    let range = 1;
    const impacts: { lane: number; flower: number; at: number }[] = [];

    const draw = () => {
      if (contextLost) return;
      renderer.render(scene, camera);
      dirty = false;
    };

    /** Everything the picture and the text show at progress `p`. `landing`
     *  is false for a jump (a resize, a reload half way, a scroll back):
     *  the state changes, but no step is played. */
    const apply = (p: number, now: number, landing: boolean) => {
      const d = distanceAt(p);
      lawn.position.z = lawnShift(d);
      flowers.position.z = d;
      house.position.z = -(HOUSE_AT - d);

      const landed = stepsLanded(d);
      if (landed !== lastLanded) {
        const [lo, hi] = landed > lastLanded ? [lastLanded, landed] : [landed, lastLanded];
        for (let i = lo; i < hi; i++) {
          const pressed = landed > lastLanded;
          setFlower(i, pressed);
          if (pressed && landing) impacts.push({ lane: FLOWERS[i].lane, flower: i, at: now });
        }
        lastLanded = landed;
      }

      // A step that is still landing: the print jumps, the flower spreads
      // and settles, the camera dips toward that foot. Timed, not scrubbed.
      let dipX = 0;
      let dipY = 0;
      const pop = [0, 0];
      for (let k = impacts.length - 1; k >= 0; k--) {
        const hit = impacts[k];
        const u = (now - hit.at) / IMPACT_MS;
        if (u >= 1 || !pressedNow[hit.flower]) {
          if (pressedNow[hit.flower]) setFlower(hit.flower, true);
          impacts.splice(k, 1);
          continue;
        }
        const out = 1 - smooth(u);
        setFlower(hit.flower, true, out);
        pop[hit.lane] = Math.max(pop[hit.lane], out);
        const dip = Math.sin(Math.PI * clamp01((now - hit.at) / DIP_MS));
        dipY = Math.max(dipY, dip * 0.11);
        dipX += dip * 0.06 * (hit.lane ? 1 : -1);
      }
      camera.position.set(CAMERA.position[0] + dipX, CAMERA.position[1] - dipY, CAMERA.position[2]);

      prints.forEach((mesh, lane) => {
        const lit = Math.max(printGlow(lane, d), pop[lane]);
        (mesh.material as THREEType.MeshBasicMaterial).color.copy(printRest).lerp(printLit, lit);
        mesh.scale.setScalar(PRINT_LENGTH * (1 + pop[lane] * 0.22));
      });

      // The dawn: the lawn's one colour gains, the wall behind the house
      // warms from the floor up. Hundredths, so a parked walk writes nothing.
      const dawn = Math.round(dawnAt(d) * 100) / 100;
      if (dawn !== shownDawn) {
        shownDawn = dawn;
        lawnMaterial.color.setRGB(1 + (DAWN_GAIN[0] - 1) * dawn, 1 + (DAWN_GAIN[1] - 1) * dawn, 1 + (DAWN_GAIN[2] - 1) * dawn);
        const low = colour.copy(night).lerp(dawnGlow, dawn * 0.85);
        const attr = glowGeometry.getAttribute("color") as THREEType.BufferAttribute;
        // PlaneGeometry lays its vertices out in rows from the top, left to
        // right: 0-2 are the top edge, 3-5 the foot, 4 the middle of the foot.
        for (let i = 0; i < 6; i++) {
          const c = i === 4 ? low : night;
          attr.setXYZ(i, c.r, c.g, c.b);
        }
        attr.needsUpdate = true;
      }

      // Nothing of the page's text is touched until the scene is revealed:
      // before that the hero is still the title block it loaded as.
      if (!live) return draw();

      // The text. The title block gives way to the HUD over the first part
      // of the runway; both are leaves, written only when a hundredth moves.
      const gone = smooth(p / COPY_END);
      if (copy) {
        writeIfChanged(copy, "opacity", (1 - gone).toFixed(2));
        writeIfChanged(copy, "transform", `translateY(${(-gone * 24).toFixed(0)}px)`);
        writeIfChanged(copy, "visibility", gone >= 1 ? "hidden" : "visible");
      }
      if (hud) writeIfChanged(hud, "opacity", smooth((p - HUD_FROM) / (HUD_END - HUD_FROM)).toFixed(2));
      if (rail) writeIfChanged(rail, "transform", `scaleX(${clamp01(p / WALK_END).toFixed(3)})`);
      if (landed !== shownSteps && countIn && countOut) {
        // After 21st.dev's "Animated Number": the new figure comes in from
        // the side it grew from, the old one leaves the other way.
        const dir = landed > shownSteps ? 1 : -1;
        if (shownSteps >= 0 && landing && typeof countIn.animate === "function") {
          countOut.textContent = String(shownSteps);
          countOut.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(${-60 * dir}%)`, opacity: 0 }], { duration: 260, easing: "ease-out", fill: "both" });
          countIn.animate([{ transform: `translateY(${60 * dir}%)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        }
        countIn.textContent = String(landed);
        shownSteps = landed;
      }
      const phase = phaseAt(d);
      if (phase !== shownPhase) {
        phases.forEach((el, i) => el.classList.toggle("is-on", i === phase));
        hero.dataset.phase = PHASES[phase].key;
        shownPhase = phase;
      }
      draw();
    };

    /* ---- the loop: on the ticker only while something moves ---- */
    const tick = (_time: number, delta: number) => {
      const now = performance.now();
      const gap = target - current;
      if (Math.abs(gap) < 0.0005) current = target;
      else current += gap * (1 - Math.exp(-Math.min(delta, 100) / FOLLOW_MS));
      apply(current, now, true);
      if (current === target && !impacts.length) sleep();
    };
    const wake = () => {
      if (ticking || document.hidden) return;
      ticking = true;
      gsap.ticker.add(tick);
    };
    const sleep = () => {
      if (!ticking) return;
      ticking = false;
      gsap.ticker.remove(tick);
    };
    /** Straight to where the scroll is, with no walk and no steps played. */
    const snap = () => {
      target = current = clamp01((window.scrollY - from) / range);
      // A step caught mid-landing is settled, not left spread.
      for (const hit of impacts) if (pressedNow[hit.flower]) setFlower(hit.flower, true);
      impacts.length = 0;
      apply(current, performance.now(), false);
    };

    const onScroll = () => {
      const next = clamp01((window.scrollY - from) / range);
      if (next === target) return;
      target = next;
      wake();
    };

    /* ---- size: read, set, aim and draw in one place ---- */
    const size = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      // Where the stage starts to stick and how far it travels, in page
      // pixels: the runway's own box against the stage's.
      const top = hero.getBoundingClientRect().top + window.scrollY;
      const stick = parseFloat(getComputedStyle(stage).top) || 0;
      from = top - stick;
      range = Math.max(1, hero.offsetHeight - stage.offsetHeight);
      if (!w || !h) return;
      if (w !== width || h !== height) {
        width = w;
        height = h;
        ratio = Math.min(cap, window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (w * h)));
        renderer.setPixelRatio(ratio);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Setting the size cleared the canvas.
        dirty = true;
      }
      // Drawn now if anyone can see it; otherwise when it comes on screen.
      if (onScreen) snap();
      else dirty = true;
    };

    /* ---- listeners, each one taken back off in teardown ---- */
    const gl = renderer.getContext();
    const onLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      canvas.classList.remove("is-on");
    };
    const onRestored = () => {
      contextLost = false;
      dirty = true;
      canvas.classList.add("is-on");
      // Only if someone can see it: the observer will not fire again for an
      // intersection that has not changed (DottedSurface.astro).
      if (onScreen && !document.hidden) snap();
    };
    const onVisibility = () => {
      if (document.hidden) sleep();
      else if (onScreen) snap();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      contextLost = gl.isContextLost();
      if (onScreen) snap();
    };
    const resize = new ResizeObserver(size);
    const watch = new IntersectionObserver((entries) => {
      // The newest entry: a fast scroll can queue an arrival and a leaving.
      onScreen = entries[entries.length - 1].isIntersecting;
      if (onScreen) {
        window.addEventListener("scroll", onScroll, { passive: true });
        if (dirty) snap();
        else {
          onScroll();
          // A walk that was put to sleep on the way out picks up again.
          if (current !== target || impacts.length) wake();
        }
      } else {
        window.removeEventListener("scroll", onScroll);
        sleep();
      }
    });

    teardown = (flip: boolean) => {
      sleep();
      resize.disconnect();
      watch.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      disposables.forEach((thing) => thing.dispose());
      renderer.dispose();
      // Leaving the scene while the page lives on (the motion setting
      // changed): give the context back now rather than at collection.
      if (flip) renderer.forceContextLoss();
      canvas.remove();
      // The static header must not keep a scrubbed title or a half-run rail.
      for (const el of leaves) {
        for (const prop of ["opacity", "transform", "visibility"]) el.style.removeProperty(prop);
        forgetLeaf(el);
      }
      phases.forEach((el) => el.classList.remove("is-on"));
      hero.classList.remove("is-live");
      hero.dataset.scene = "still";
      delete hero.dataset.phase;
    };

    // From here on a stop() from outside finds `teardown` and uses it, so
    // nothing created above can be left behind by the awaits below.
    box.append(canvas);
    size();
    snap();

    /* The scene is timed before anyone sees it: a few frames, each read
       back so the time is the drawing's and not the queue's. Too slow at
       this size drops to one pixel per CSS pixel; too slow there, or a
       context already lost, and the poster stays. */
    const pixel = new Uint8Array(4);
    const time = () => {
      const samples: number[] = [];
      for (let i = 0; i < 4; i++) {
        const t = performance.now();
        renderer.render(scene, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        samples.push(performance.now() - t);
      }
      // The first frame carries the uploads; the median of the rest counts.
      return samples.slice(1).sort((a, b) => a - b)[1];
    };
    if (time() > SLOW_MS && ratio > 1) {
      cap = 1;
      width = 0;
      size();
      snap();
    }
    if (gl.isContextLost() || time() > SLOW_MS) {
      teardown(true);
      teardown = null;
      return still();
    }

    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    resize.observe(box);
    resize.observe(hero);
    watch.observe(hero);

    // The canvas is opaque and already holds the frame the poster shows:
    // it fades in over it, and the HUD comes with it.
    hero.dataset.scene = "live";
    hero.classList.add("is-live");
    canvas.classList.add("is-on");
    live = true;
    snap();
  })().catch(() => {
    // No scene: the poster is the page.
    teardown?.(true);
    teardown = null;
    still();
  });

  return (flip: boolean) => {
    dead = true;
    teardown?.(flip);
    teardown = null;
  };
}
