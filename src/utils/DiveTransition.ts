import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { projects } from "../data/works";

/**
 * Dive-into-image transition for the Work cards.
 *
 * Clicking a card flies the viewer *into* its composition: the card's own
 * layers (image plane, dot grid, title, index/frame) are rebuilt at staggered
 * depths in a single perspective scene, and one camera dolly along Z makes
 * them separate at different apparent rates. The separation is what sells the
 * travel — magnification does not, and deliberately so: Step 0 measured
 * cover.jpg (1950x1160) as already upscaled 1.55x at full bleed on a DPR-2
 * desktop and 2.2x on a DPR-3 phone, so the photo is the deepest, slowest
 * growing layer while the resolution-independent layers do the rushing.
 *
 * Per frame this writes two transforms (.dive__flip, .dive__camera) and a
 * handful of opacities. No width/height/top/left is animated, no per-frame
 * custom property is written on an ancestor, and there is no new rAF loop —
 * the timeline rides gsap.ticker, the master clock for this page.
 */

/* --------------------------------------------------------------- the rig */

/** Stage perspective. Smaller = stronger separation between layers. */
const PERSPECTIVE = 900;

/** How far the camera travels along Z over one dive. */
const DOLLY = 560;

/**
 * Layers are authored by how much each should grow over the dive; depth and
 * the static compensation scale are solved from that, because "how fast does
 * this rush at me" is the thing worth tuning and depth is not.
 *
 *   apparent growth   g = (P + d) / (P + d - Z)
 *   depth             d = g*Z / (g - 1) - P
 *   compensation      k = (P + d) / P
 *
 * k keeps every layer exactly coincident at z = 0, so frame one of the dive
 * is the card and nothing else.
 */
const LAYERS = [
  { name: "far", growth: 1.12 }, // image plane: photo, or the colour panel
  { name: "mid", growth: 2.6 }, // dot grid
  { name: "near", growth: 4.5 }, // title
  { name: "fore", growth: 8.0 }, // index, cta and the card frame
] as const;

type LayerName = (typeof LAYERS)[number]["name"];

const depthOf = (growth: number) =>
  (growth * DOLLY) / (growth - 1) - PERSPECTIVE;

const compensationOf = (growth: number) =>
  (PERSPECTIVE + depthOf(growth)) / PERSPECTIVE;

const DURATION_IN = 1.15;
const DURATION_OUT = 0.7;

/* prefers-reduced-motion: no Z animation, no layer separation, opacity only.
   Shorter than the full durations on purpose — a cross-fade dragged out to
   the dive's own timing reads as slow, not as reduced. */
const DURATION_REDUCED_IN = 0.4;
const DURATION_REDUCED_OUT = 0.3;

/**
 * Read live, every time — never cached at build() or at the start of a dive.
 * That is what lets a change to the setting mid-dive be honoured by the time
 * the *next* phase runs: dive in with motion, then have the OS setting
 * change, and the exit that follows already cross-fades instead of flying
 * back to the card.
 */
function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type PausableSection = {
  isPaused: boolean;
  setPausedState(isPaused: boolean): void;
};

/**
 * 'closed' rejects new opens (blocks rapid repeat clicks — one dive at a
 * time, no interleaved geometry reads on two cards). 'opening'/'open' both
 * accept a close, which is what makes closing mid-flight an interrupt rather
 * than a dead click. 'closing' rejects everything until its own onComplete
 * lands on 'closed'.
 */
type DiveState = "closed" | "opening" | "open" | "closing";

/**
 * Screen scale and Y rotation of a card, taken from its own computed matrix.
 *
 * For `rotateY(t) translate3d(...) scale(s)` the matrix carries s in m22
 * (rotateY leaves y alone) and maps the x-axis to (cos t, 0, -sin t), so
 * t = atan2(-m13, m11). Reading it beats re-deriving from CSS: the phone and
 * tablet variants of .s__scene__work drop scale(var(--size)) entirely, and a
 * CSS-derived guess would have to duplicate the breakpoints to know that.
 *
 * `transform: none` is not a parseable matrix, and a card whose custom
 * properties have not been written yet computes to exactly that.
 */
function projectionOf(el: HTMLElement) {
  const value = getComputedStyle(el).transform;
  if (!value || value === "none") return { scale: 1, rotationY: 0 };

  const m = new DOMMatrix(value);
  return {
    scale: m.m22 || 1,
    rotationY: (Math.atan2(-m.m13, m.m11) * 180) / Math.PI,
  };
}

/** Everything the dive needs from a card, read in one batch before any write. */
type CardReading = {
  centerX: number;
  centerY: number;
  scale: number;
  rotationY: number;
  boxWidth: number;
  boxHeight: number;
  background: string;
  /** The same colour as bare "r, g, b", for the text plate's rgba(). */
  backgroundChannels: string;
  accent: string;
  coverSrc: string;
  coverPosition: string;
  posterMark: string;
  posterMotif: string;
  indexText: string;
  titleText: string;
  ctaText: string;
  href: string;
};

/**
 * Whether this engine implements <link rel="prefetch">. WebKit does not, and
 * the answer cannot change during a session, so it is worked out once rather
 * than allocating a throwaway element per dive.
 */
let prefetchLinkSupported: boolean | null = null;
function supportsPrefetchLink(): boolean {
  if (prefetchLinkSupported === null) {
    prefetchLinkSupported = !!document
      .createElement("link")
      .relList?.supports?.("prefetch");
  }
  return prefetchLinkSupported;
}

/**
 * A same-origin test that is actually a same-origin test. `startsWith("/")`
 * lets a protocol-relative //host/path through, and `!startsWith("http")`
 * lets it through too.
 */
function isSameOrigin(href: string): boolean {
  if (!href) return false;
  try {
    return new URL(href, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

class DiveTransition {
  scene: HTMLElement | null = null;
  section: PausableSection | null = null;

  root!: HTMLElement;
  backdrop!: HTMLElement;
  flip!: HTMLElement;
  stage!: HTMLElement;
  camera!: HTMLElement;
  layers: Record<string, HTMLElement> = {};
  plate!: HTMLElement;
  cover!: HTMLImageElement;
  poster!: HTMLElement;
  posterMark!: HTMLElement;
  glow!: HTMLElement;
  vignette!: HTMLElement;
  indexEl!: HTMLElement;
  indexText!: HTMLElement;
  titleText!: HTMLElement;
  ctaText!: HTMLElement;
  titleEl!: HTMLElement;
  ctaEl!: HTMLElement;
  frameEl!: HTMLElement;
  teaser!: HTMLElement;
  teaserEyebrow!: HTMLElement;
  teaserTitle!: HTMLElement;
  teaserBlurb!: HTMLElement;
  teaserLink!: HTMLAnchorElement;
  closeButton!: HTMLButtonElement;

  tl: gsap.core.Timeline | null = null;
  state: DiveState = "closed";
  sourceCard: HTMLElement | null = null;
  prefetchLink: HTMLLinkElement | null = null;
  prefetchAbort: AbortController | null = null;
  sectionWasPaused = false;
  lockedScrollY = 0;

  /* Set once per dive in fill(), read back by the resize handler so a live
     viewport change can re-settle the end scale without re-reading the
     (now hidden) card. */
  cardBoxWidth = 0;
  cardBoxHeight = 0;
  resizedWhileOpen = false;

  init(section?: PausableSection) {
    this.scene = document.querySelector(".s-work .js-scene");
    if (!this.scene) return;

    this.section = section ?? null;

    this.build();

    // One delegated listener on the scene rather than one per card: the pin
    // re-parents the container on every resize, which re-fires each card's
    // connectedCallback, and per-card binding is exactly how this project
    // leaked +160 listeners per resize once already.
    this.scene.addEventListener("click", this.onSceneClick);
  }

  /* ------------------------------------------------------------- building */

  build() {
    const root = document.createElement("div");
    root.className = "dive";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="dive__backdrop"></div>
      <div class="dive__flip">
        <div class="dive__stage">
          <div class="dive__camera">
            <div class="dive__layer dive__layer--far">
              <div class="dive__plate"></div>
              <img class="dive__cover" alt="" decoding="async" />
              <div class="dive__glow"></div>
            </div>
            <div class="dive__layer dive__layer--mid">
              <div class="dive__poster">
                <span class="dive__poster-mark"></span>
              </div>
              <div class="dive__grid"></div>
            </div>
            <div class="dive__layer dive__layer--near">
              <div class="dive__title"><span></span></div>
            </div>
            <div class="dive__layer dive__layer--fore">
              <div class="dive__index"><span></span></div>
              <div class="dive__cta"><span></span></div>
              <div class="dive__frame"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="dive__vignette"></div>
      <button class="dive__close" type="button" aria-label="Close">&#10005;</button>
      <div class="dive__teaser">
        <div class="dive__teaser__inner">
          <p class="dive__teaser__eyebrow"></p>
          <h2 class="dive__teaser__title"></h2>
          <p class="dive__teaser__blurb"></p>
          <a class="dive__teaser__link" href="/">View full project &#8594;</a>
        </div>
      </div>
    `;

    const q = <T extends HTMLElement>(sel: string) =>
      root.querySelector(sel) as T;

    this.root = root;
    this.backdrop = q(".dive__backdrop");
    this.flip = q(".dive__flip");
    this.stage = q(".dive__stage");
    this.camera = q(".dive__camera");
    this.plate = q(".dive__plate");
    this.cover = q<HTMLImageElement>(".dive__cover");
    this.poster = q(".dive__poster");
    this.posterMark = q(".dive__poster-mark");
    this.glow = q(".dive__glow");
    this.vignette = q(".dive__vignette");
    this.indexEl = q(".dive__index");
    this.titleEl = q(".dive__title");
    this.ctaEl = q(".dive__cta");
    // The text lives in a span so it can carry the same plate the card's text
    // carries. The colour stays on the block, as it does on the card.
    this.indexText = q(".dive__index span");
    this.titleText = q(".dive__title span");
    this.ctaText = q(".dive__cta span");
    this.frameEl = q(".dive__frame");
    this.teaser = q(".dive__teaser");
    this.teaserEyebrow = q(".dive__teaser__eyebrow");
    this.teaserTitle = q(".dive__teaser__title");
    this.teaserBlurb = q(".dive__teaser__blurb");
    this.teaserLink = q<HTMLAnchorElement>(".dive__teaser__link");
    this.closeButton = q<HTMLButtonElement>(".dive__close");

    this.stage.style.setProperty("--dive-perspective", `${PERSPECTIVE}px`);

    // Layer transforms are written once and never touched again: all apparent
    // motion is the camera's dolly seen through the perspective projection,
    // which is real parallax rather than four tweens pretending to be one.
    for (const layer of LAYERS) {
      const el = root.querySelector(
        `.dive__layer--${layer.name}`,
      ) as HTMLElement;
      this.layers[layer.name] = el;

      // The image plane is laid out per dive instead — see layoutPlane().
      //
      // The other three are deliberately NOT laid out that way. Applying the
      // same end-size layout to them was measured and rejected: their growth
      // factors (2.6, 4.5, 8.0) turn the layout box into 3744, 6480 and 11520
      // px wide, and rastering layers that size stalls the dive outright —
      // the timeline had not reached onComplete 2.6 s after the click, so the
      // teaser and the close button never faded in. Their contents are
      // magnified (mid 8.5x, near 14.7x, fore 26.2x accumulated at dive end)
      // and that softness is the accepted cost.
      if (layer.name === "far") continue;

      // A layer sits at -depth: positive depth is behind the camera plane,
      // negative depth (the foreground) is in front of it.
      const z = (-depthOf(layer.growth)).toFixed(2);
      const k = compensationOf(layer.growth).toFixed(4);
      el.style.transform = `translateZ(${z}px) scale(${k})`;
    }

    document.body.appendChild(root);

    this.closeButton.addEventListener("click", this.onCloseClick);
    this.teaserLink.addEventListener("click", this.onTeaserLinkClick);
  }

  /* ---------------------------------------------------------------- entry */

  onSceneClick = (event: MouseEvent) => {
    // Let the browser keep doing the browser's job: modified clicks and
    // anything that is not a plain primary click open the real link.
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Not just 'is one open' — 'opening' and 'closing' are rejected too, so a
    // second click during the decode await or either animation can't start a
    // concurrent dive on a different card.
    if (this.state !== "closed") return;

    const target = event.target as HTMLElement | null;
    const link = target?.closest("a") as HTMLAnchorElement | null;
    if (!link) return;

    const work = link.closest("a-work") as HTMLElement | null;
    const card = work?.querySelector(".a__card") as HTMLElement | null;
    if (!work || !card) return;

    const href = link.getAttribute("href") || "";
    if (!href.startsWith("/")) return;

    event.preventDefault();
    this.open(work, card, href);
  };

  onCloseClick = () => {
    this.close();
  };

  /**
   * The teaser link is the one way out of a dive that actually navigates, and
   * it is the dive's own node — appended to document.body long after
   * SiteController ran its one-shot querySelectorAll over
   * a[href^="/work/"], a[href^="/projects/"], so it never got that listener.
   * open() also clears returnScrollY, since the hijacked card click sets it
   * for a navigation that no longer happens.
   *
   * So nothing was recording where the visitor actually was. The project
   * page's own "Back to Works" then set returnToWorks, and SiteController's
   * fallback dropped them at the top of the section with the carousel reset
   * to progress 0. Save the pre-lock offset here, which is where they were
   * standing when they dived.
   */
  onTeaserLinkClick = () => {
    sessionStorage.setItem("returnScrollY", String(this.lockedScrollY));
  };

  onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.close();
  };

  /** Non-passive so preventDefault actually cancels the scroll. */
  onLockedScroll = (event: Event) => {
    event.preventDefault();
  };

  /**
   * A resize is the one thing that can happen mid-dive without any user
   * action on the overlay itself. It never touches the timeline: the entry
   * animation's own end value (flip's scale, set once in play()) is what
   * would otherwise go stale, so this only re-settles it, instantly, once
   * the entry has actually finished landing on the new viewport.
   */
  onWindowResize = () => {
    this.resizedWhileOpen = true;
    if (this.state === "open") this.settleToViewport();
    // Mid-exit there is nothing to re-target: the destination was read from
    // the card before the viewport moved. Finishing the timeline immediately
    // puts the overlay away and hands the page back at the size it now is,
    // which is the only correct end state available.
    else if (this.state === "closing" && this.tl) this.tl.progress(1);
  };

  /**
   * Re-derive the two things a viewport change invalidates while the dive is
   * up: the flip plane's resting scale, and the depth planes' layout. Called
   * from the resize handler when the dive is already open, and from each
   * entry timeline's onComplete when the resize arrived mid-entry and the
   * handler had to refuse it.
   */
  settleToViewport() {
    gsap.set(this.flip, {
      scale: this.endScale(this.cardBoxWidth, this.cardBoxHeight),
    });
    // endScale moved, so the image plane's layout/static-scale split has to
    // move with it or the plane stops resolving to 1.0 at rest.
    this.layoutPlanes(this.cardBoxWidth, this.cardBoxHeight);
  }

  /* ----------------------------------------------------------------- read */

  /**
   * One batch of geometry reads, taken before anything is written. Scale and
   * rotation come out of the card's own computed matrix rather than being
   * re-derived from CSS: for `rotateY(t) translate3d(...) scale(s)` the
   * matrix carries s in m22 (rotateY leaves y alone) and the x-axis maps to
   * (cos t, 0, -sin t), so t = atan2(-m13, m11). Reading it beats duplicating
   * the breakpoint rules — the phone and tablet variants of .s__scene__work
   * drop scale(var(--size)) entirely, which a CSS-derived guess would miss.
   */
  readCard(work: HTMLElement, card: HTMLElement, href: string): CardReading {
    const rect = card.getBoundingClientRect();
    const { scale, rotationY } = projectionOf(work);

    const coverEl = card.querySelector(".a__card__cover") as HTMLImageElement | null;
    const indexEl = card.querySelector(".a__card__index") as HTMLElement | null;
    const titleEl = card.querySelector(".a__card__title") as HTMLElement | null;
    const ctaEl = card.querySelector(".a__card__cta") as HTMLElement | null;

    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      scale,
      rotationY,
      boxWidth: card.offsetWidth,
      boxHeight: card.offsetHeight,
      // The card writes its palette inline, so this needs no getComputedStyle
      // and no second copy of the colour map.
      background: card.style.background || "#111111",
      backgroundChannels:
        card.style.getPropertyValue("--card-bg-rgb").trim() || "17, 17, 17",
      accent: indexEl?.style.color || "#ffffff",
      coverSrc:
        work.dataset.coverState === "ready"
          ? coverEl?.currentSrc || coverEl?.src || ""
          : "",
      coverPosition: coverEl?.style.objectPosition || "50% 50%",
      posterMark: work.dataset.posterMark || "",
      posterMotif: work.dataset.posterMotif || "crosshair",
      indexText: indexEl?.textContent?.trim() || "",
      titleText: titleEl?.textContent?.trim() || "",
      ctaText: ctaEl?.textContent?.trim() || "View project →",
      href,
    };
  }

  /* ---------------------------------------------------------------- write */

  async open(work: HTMLElement, card: HTMLElement, href: string) {
    this.state = "opening";
    this.resizedWhileOpen = false;

    const reading = this.readCard(work, card, href);

    // Lock before awaiting the decode so the card cannot scroll out from
    // under the rect that was just read. Step 0 measured this lock as 1
    // layout + 1 recalc, holding scrollY, the pin and the WorkSection
    // geometry cache — unlike .is-scroll-blocked, which sets height: 100vh
    // on html and body and destroys the scroll position outright.
    this.lockScroll();
    window.addEventListener("resize", this.onWindowResize, { passive: true });

    // The hijacked click still bubbled through SiteController's per-link
    // handler, which parks scrollY in sessionStorage for the return trip.
    // Nothing is navigating, so leaving the key set would make the next real
    // load skip the loader and jump.
    sessionStorage.removeItem("returnScrollY");

    this.fill(reading);

    // Both of these belong to the click's own task: priming keeps the eight
    // gsap.set writes out of a second task after the decode await, and the
    // prefetch turns the dive's 1.15 s of animation into network time for the
    // page it is about to open. Without it nothing was requested during the
    // dive at all, and the destination load only began on the second click.
    if (!prefersReducedMotion()) this.primeFull(reading);
    this.prefetchDestination(reading.href);

    if (reading.coverSrc) {
      // Free in practice — Step 0 measured 0.1-0.2 ms once the card has been
      // painted, which is the only state a visitor can click from. It is the
      // cold path (keyboard or deep-link entry, ~20-31 ms, no long task)
      // this guard actually exists for.
      try {
        await this.cover.decode();
      } catch {
        /* a failed decode should still open the dive, just without the photo */
      }
    }
    this.sourceCard = card;
    card.style.visibility = "hidden";

    if (this.section) {
      this.sectionWasPaused = this.section.isPaused;
      // tick() runs off the GSAP ticker gated only by the section's
      // IntersectionObserver, which still reports it visible behind the
      // overlay. Nothing it draws can be seen during a dive.
      this.section.setPausedState(true);
    }

    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", this.onKeyDown);

    // Stays 'opening' — not 'open' — until the entry timeline actually
    // lands: that's what makes a close() during the flight itself a real
    // interrupt (guarded below) rather than a state neither open() nor
    // close() recognises.
    this.play(reading);
  }

  fill(reading: CardReading) {
    this.plate.style.background = reading.background;

    // src and display are settled before decode() is awaited: Chrome rejects
    // decode() on an image that is display:none, and the previous dive may
    // have left it that way.
    this.cover.style.display = reading.coverSrc ? "" : "none";
    if (reading.coverSrc && this.cover.getAttribute("src") !== reading.coverSrc) {
      this.cover.src = reading.coverSrc;
    }
    this.cover.style.objectPosition = reading.coverPosition;

    this.poster.className = `dive__poster dive__poster--${reading.posterMotif}`;
    this.poster.style.display = reading.coverSrc ? "none" : "";
    this.poster.style.color = reading.accent;
    this.posterMark.textContent = reading.posterMark;

    // The far plane is what the viewer arrives at. AMS arrives at its photo;
    // a composition card would otherwise arrive at flat paint, so it gets a
    // light source in its own accent instead. Both fade up from nothing, so
    // frame one still matches the card exactly.
    this.glow.style.display = reading.coverSrc ? "none" : "";
    this.glow.style.setProperty("--dive-accent", reading.accent);

    this.indexText.textContent = reading.indexText;
    this.indexEl.style.color = reading.accent;
    this.titleText.textContent = reading.titleText;
    this.ctaText.textContent = reading.ctaText;
    this.ctaEl.style.color = reading.accent;

    // The overlay is the card at full bleed, so it needs the card's own plate
    // colour and, when a cover is showing, the card's edge scrim. Without them
    // the white-on-white the card was just fixed for comes straight back the
    // moment the visitor clicks: measured 1.06:1 on the clinic cover.
    this.root.style.setProperty("--card-bg-rgb", reading.backgroundChannels);
    this.root.classList.toggle("is-cover-ready", !!reading.coverSrc);

    const project = projects.find((p) => p.site === reading.href);
    this.teaserEyebrow.textContent = reading.indexText;
    this.teaserEyebrow.style.color = reading.accent;
    this.teaserTitle.textContent = project?.title || reading.titleText;
    this.teaserBlurb.textContent = project?.blurb || "";
    this.teaserLink.href = reading.href;
    this.teaserLink.style.color = reading.accent;

    // The camera box *is* the card box, which is what makes frame one an
    // exact match rather than a lookalike. Written once per dive, never
    // during one.
    this.camera.style.width = `${reading.boxWidth}px`;
    this.camera.style.height = `${reading.boxHeight}px`;
    this.cardBoxWidth = reading.boxWidth;
    this.cardBoxHeight = reading.boxHeight;

    this.layoutPlanes(reading.boxWidth, reading.boxHeight);
  }

  /**
   * Where the composition settles once the dive is over. A portrait viewport
   * fits the card's 16:10 composition to the width instead of cover-filling
   * it: cover-filling 390x844 would blow the photo up 6.5x and, at 0.46
   * source pixels per device pixel, straight into mush.
   */
  endScale(boxWidth: number, boxHeight: number) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const byWidth = vw / boxWidth;
    return vh > vw ? byWidth : Math.max(byWidth, vh / boxHeight);
  }

  /**
   * Lays the image plane out at the size it occupies at the END of the dive
   * and statically scales it DOWN to meet the card, instead of laying it out
   * card-sized and scaling up.
   *
   * Why: a layer carrying will-change/an animating transform is rastered at
   * one scale and then GPU-transformed, so scaling up 5-7x showed a stretched
   * card-sized bitmap of the photo. Measured directly — mid-dive the photo was
   * mush while text in sibling layers stayed crisp, and it snapped sharp the
   * moment the timeline finished and will-change came off. Sized this way the
   * plane's accumulated scale runs (cardScale / endScale) -> 1.0 and never
   * exceeds 1, so the raster is always at least as dense as the screen needs
   * and only ever downsamples.
   *
   * Same composition either way: layout x static-scale is unchanged, only the
   * split between them moves. On-screen size at z=0 still lands exactly on
   * the card, which is what keeps frame one a match.
   */
  layoutPlane(name: LayerName, growth: number, boxWidth: number, boxHeight: number) {
    const e = this.endScale(boxWidth, boxHeight);
    const w = boxWidth * e * growth;
    const h = boxHeight * e * growth;

    // k / (e * growth): cancels the enlarged layout box back to the card at
    // z = 0, and resolves to an accumulated scale of exactly 1 at z = DOLLY.
    const s = compensationOf(growth) / (e * growth);

    const el = this.layers[name];
    el.style.width = `${w.toFixed(1)}px`;
    el.style.height = `${h.toFixed(1)}px`;
    // Centred by box geometry rather than a percentage translate, because a
    // percentage translate resolves against the unscaled border box and would
    // drift once the static scale is applied.
    el.style.left = `${((boxWidth - w) / 2).toFixed(1)}px`;
    el.style.top = `${((boxHeight - h) / 2).toFixed(1)}px`;
    el.style.transform = `translateZ(${(-depthOf(growth)).toFixed(2)}px) scale(${s.toFixed(5)})`;
  }

  /** Only the image plane; see the note in build() for why. */
  layoutPlanes(boxWidth: number, boxHeight: number) {
    this.layoutPlane(LAYERS[0].name, LAYERS[0].growth, boxWidth, boxHeight);
  }

  play(reading: CardReading) {
    if (this.tl) this.tl.kill();
    this.tl = prefersReducedMotion()
      ? this.playReduced(reading)
      : this.playFull(reading);
  }

  /**
   * The whole composition is set to its resting position instantly — full
   * screen, camera.z at 0 so the layers' baked-in translateZ/scale pairs
   * still cancel out to a flat, undivided image exactly as they do at rest
   * in playFull() — and the only thing that runs is an opacity cross-fade.
   */
  playReduced(reading: CardReading) {
    const { flip, camera, backdrop, teaser, closeButton, layers, cover } = this;

    flip.style.willChange = "opacity";
    backdrop.style.willChange = "opacity";

    gsap.set(flip, {
      x: 0,
      y: 0,
      scale: this.endScale(reading.boxWidth, reading.boxHeight),
      rotationY: 0,
      opacity: 0,
    });
    gsap.set(camera, { xPercent: -50, yPercent: -50, z: 0 });
    gsap.set([layers.far, layers.mid, layers.near, layers.fore], { opacity: 1 });
    gsap.set(cover, { opacity: 1 });
    gsap.set([this.glow, this.vignette], { opacity: 1 });
    gsap.set(backdrop, { opacity: 0 });
    gsap.set(teaser, { opacity: 0, y: 0 });
    gsap.set(closeButton, { opacity: 0 });

    const tl = gsap.timeline({
      onComplete: () => {
        flip.style.willChange = "";
        backdrop.style.willChange = "";
        this.glow.style.willChange = "";
        this.vignette.style.willChange = "";
        this.state = "open";
        // onWindowResize only re-settles while state === "open", so a resize
        // that lands during the 1.15 s entry sets the flag and returns. The
        // entry's own end value was computed for the old viewport: measured
        // 1440x900 -> 900x700 mid-entry left flip at scale 3.2727 against a
        // correct 2.0455, and a landscape-to-portrait rotation left 3.2727
        // against 0.8864 with the far plane painting 1613x1008 px inside a
        // 390 px viewport. Settling once here is the same work the handler
        // would have done, at the first moment it is allowed to run.
        if (this.resizedWhileOpen) this.settleToViewport();
      },
    });

    tl.to([flip, backdrop], { opacity: 1, duration: DURATION_REDUCED_IN, ease: "power1.out" }, 0);
    tl.to(
      [teaser, closeButton],
      { opacity: 1, duration: DURATION_REDUCED_IN * 0.7, ease: "power1.out" },
      DURATION_REDUCED_IN * 0.4,
    );

    return tl;
  }

  /**
   * Every starting value the dive needs, written in one go. Split out of
   * playFull so open() can run it in the same task as the geometry reads:
   * left after `await cover.decode()` these eight gsap.set calls landed in a
   * second main-thread task (measured 67 ms, 26.4 ms of it style recalc)
   * between the click and the first dive frame.
   */
  primeFull(reading: CardReading) {
    const { flip, camera, backdrop, teaser, closeButton, layers, cover } = this;

    gsap.set(flip, {
      x: reading.centerX - window.innerWidth / 2,
      y: reading.centerY - window.innerHeight / 2,
      scale: reading.scale,
      rotationY: reading.rotationY,
      // closeReduced() tweens this plane to opacity 0 and nothing else ever
      // puts it back. Without this line, one dive taken with reduced motion on
      // leaves every later full-motion dive invisible for the rest of the
      // session: backdrop, teaser and close button appear over a black
      // rectangle where the photo, plate, grid and title should be. Measured
      // over three consecutive dives after the switch — inline opacity "0"
      // every time. primeFull is the full path's rest state, so it has to
      // write every property the reduced path writes.
      opacity: 1,
    });
    gsap.set(camera, { xPercent: -50, yPercent: -50, z: 0 });
    gsap.set([layers.far, layers.mid, layers.near, layers.fore], { opacity: 1 });
    gsap.set(cover, { opacity: 1 });
    gsap.set([this.glow, this.vignette], { opacity: 0 });
    gsap.set(backdrop, { opacity: 0 });
    gsap.set(teaser, { opacity: 0, y: 24 });
    gsap.set(closeButton, { opacity: 0 });
  }

  playFull(reading: CardReading) {
    const { flip, camera, backdrop, teaser, closeButton, layers } = this;

    // will-change goes on only while the dive runs; the layers that stay at
    // constant opacity never get it.
    flip.style.willChange = "transform";
    camera.style.willChange = "transform";
    backdrop.style.willChange = "opacity";
    layers.fore.style.willChange = "opacity";
    layers.near.style.willChange = "opacity";
    layers.mid.style.willChange = "opacity";
    // The glow and the vignette are full-viewport gradients tweened on
    // opacity, and they were the only tweened layers without a hint: raster
    // measured 1242 ms with them unhinted and 836 ms with them hinted at
    // 1440x900 (-33%), 415 ms -> 118 ms at 390x844 (-72%).
    this.glow.style.willChange = "opacity";
    this.vignette.style.willChange = "opacity";

    // open() already primed in the click's task; this covers every other
    // caller (resize replay, keyboard entry) and is idempotent.
    this.primeFull(reading);

    const tl = gsap.timeline({
      onComplete: () => {
        camera.style.willChange = "";
        layers.fore.style.willChange = "";
        layers.near.style.willChange = "";
        layers.mid.style.willChange = "";
        flip.style.willChange = "";
        backdrop.style.willChange = "";
        this.glow.style.willChange = "";
        this.vignette.style.willChange = "";
        this.state = "open";
        // See playReduced's onComplete: a resize during the entry is recorded
        // and, until the state flips to "open", refused. This is that moment.
        if (this.resizedWhileOpen) this.settleToViewport();
      },
    });

    // The card opening out to full bleed, and the camera dolly. Two eases on
    // purpose: the frame settles while the camera is still accelerating, so
    // the last third of the dive is pure depth rather than pure growth.
    tl.to(
      flip,
      {
        x: 0,
        y: 0,
        scale: this.endScale(reading.boxWidth, reading.boxHeight),
        rotationY: 0,
        duration: DURATION_IN,
        ease: "power2.inOut",
      },
      0,
    );
    tl.to(
      camera,
      { z: DOLLY, duration: DURATION_IN, ease: "power2.in" },
      0,
    );

    tl.to(backdrop, { opacity: 1, duration: DURATION_IN * 0.45, ease: "power1.out" }, 0);
    // The near layers have to leave before they reach the eye, or they end
    // the dive as a full-screen blur — but they are held on screen well past
    // the point where they start rushing, because watching them sweep past
    // and out is the whole depth cue. Fading them early (as this did at 0.28
    // / 0.45) hid the separation the rig exists to produce.
    tl.to(
      layers.fore,
      { opacity: 0, duration: DURATION_IN * 0.34, ease: "power1.in" },
      DURATION_IN * 0.42,
    );
    tl.to(
      layers.near,
      { opacity: 0, duration: DURATION_IN * 0.3, ease: "power1.in" },
      DURATION_IN * 0.58,
    );
    // The grid thins out but never leaves: a dot field still drifting past at
    // rest is what keeps the far plane feeling like a place rather than paint.
    tl.to(
      layers.mid,
      { opacity: 0.18, duration: DURATION_IN * 0.35, ease: "power1.in" },
      DURATION_IN * 0.6,
    );

    tl.to(
      [this.glow, this.vignette],
      { opacity: 1, duration: DURATION_IN * 0.55, ease: "power1.out" },
      DURATION_IN * 0.35,
    );

    tl.to(
      teaser,
      { opacity: 1, y: 0, duration: DURATION_IN * 0.35, ease: "power2.out" },
      DURATION_IN * 0.68,
    );
    tl.to(
      closeButton,
      { opacity: 1, duration: DURATION_IN * 0.3, ease: "none" },
      DURATION_IN * 0.68,
    );

    return tl;
  }

  /* ----------------------------------------------------------------- exit */

  close() {
    // Rejects 'closed' (nothing to close) and 'closing' (already on the way
    // out — a second Escape or a stray click on the now-fading close button
    // must not restart the exit timeline mid-flight). Accepts 'opening' and
    // 'open' alike, which is what makes closing mid-flight an interrupt.
    if (this.state === "closed" || this.state === "closing") return;
    this.state = "closing";

    if (this.tl) this.tl.kill();

    document.removeEventListener("keydown", this.onKeyDown);
    // The resize listener stays until teardown. The exit bakes the card's
    // rect, scale and rotation at the moment Escape is pressed and then flies
    // to them for 700 ms; a resize inside that window moves the card and
    // leaves the composition flying to a position the card no longer
    // occupies, snapping visibly when the card is made visible again. It also
    // used to leave resizedWhileOpen false, so the ScrollTrigger refresh that
    // exists for exactly this case was skipped too. buildOnClosed() removes
    // the listener.

    const onDone = this.buildOnClosed();

    this.tl = prefersReducedMotion() ? this.closeReduced(onDone) : this.closeFull(onDone);
  }

  /**
   * Warm the destination while the dive plays. One request per dive, replaced
   * rather than accumulated, and dropped when the dive closes without
   * navigating so a browsed-and-backed-out card leaves nothing behind.
   *
   * Two mechanisms because <link rel="prefetch"> has never shipped in WebKit:
   * measured on click, Chromium and Firefox each issue a document request for
   * /work/touchpoint/ while the dive runs and Safari issues none — so on the
   * one platform where the dive is slowest, the 1.15 s of animation bought no
   * head start at all. relList.supports is the honest test (Safari answers
   * false), and the fallback is a same-origin fetch at low priority, aborted
   * on close exactly like the link element is removed.
   */
  prefetchDestination(href: string) {
    if (!isSameOrigin(href)) return;
    this.dropPrefetch();

    if (supportsPrefetchLink()) {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = href;
      document.head.appendChild(link);
      this.prefetchLink = link;
      return;
    }

    const controller = new AbortController();
    this.prefetchAbort = controller;
    // Best effort, and honestly so. The Accept header is the string a document
    // navigation actually sends, so an edge that varies on Accept stores the
    // entry under the key the navigation will look for — an abbreviated one
    // guarantees the miss it was added to prevent. Sec-Fetch-Dest cannot be
    // set from script, so a Vary on that defeats this and the dive is simply
    // back where it started. The body is read to completion — these pages are
    // about 10 KB — because an unread stream can stall on backpressure and a
    // partial body is not guaranteed to reach the cache. priority is a hint
    // no engine on this path implements yet; it costs nothing and says what
    // is meant.
    fetch(href, {
      credentials: "same-origin",
      signal: controller.signal,
      priority: "low",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    } as RequestInit)
      .then((response) => response.arrayBuffer())
      .catch(() => {
        /* aborted, offline, or 404 — the navigation will handle it */
      });
  }

  dropPrefetch() {
    this.prefetchLink?.remove();
    this.prefetchLink = null;
    this.prefetchAbort?.abort();
    this.prefetchAbort = null;
  }

  /**
   * Shared teardown, identical regardless of which exit animation ran: the
   * whole point of routing both paths through one closure is that Step 3's
   * teardown guarantees (will-change cleared, card restored, scroll
   * unlocked, section resumed, state back to 'closed') can't drift apart
   * between the two.
   */
  buildOnClosed() {
    const { flip, camera, backdrop, layers } = this;
    const card = this.sourceCard;

    return () => {
      this.root.classList.remove("is-open");
      this.root.setAttribute("aria-hidden", "true");

      // closeReduced() never touches the camera — it only fades flip/backdrop
      // — so a dive that entered with full motion and then had the OS
      // setting change mid-flight (see prefersReducedMotion()'s doc comment)
      // can complete a reduced exit with the camera still at DOLLY. Harmless
      // while hidden and self-healing on the next open() either way, but
      // resetting it here means 'closed' is a single canonical rest state
      // regardless of which exit path ran.
      gsap.set(camera, { z: 0 });

      camera.style.willChange = "";
      flip.style.willChange = "";
      backdrop.style.willChange = "";
      layers.fore.style.willChange = "";
      layers.near.style.willChange = "";
      layers.mid.style.willChange = "";
      this.glow.style.willChange = "";
      this.vignette.style.willChange = "";

      this.dropPrefetch();
      // Removed here rather than in close(), so a resize that lands during the
      // 700 ms exit is still seen: it finishes the timeline and it sets the
      // flag the ScrollTrigger refresh below reads.
      window.removeEventListener("resize", this.onWindowResize);

      if (card) card.style.visibility = "";
      this.sourceCard = null;

      this.unlockScroll();
      if (this.section) this.section.setPausedState(this.sectionWasPaused);

      // A resize mid-dive already made WorkSection re-measure and refresh
      // itself (it listens for the same window resize independently of the
      // dive), but that ran with the source card still visibility:hidden
      // and the overlay covering the viewport. Refresh once more now that
      // both are gone, so ScrollTrigger's start/end math is against the
      // page the visitor actually sees.
      if (this.resizedWhileOpen) ScrollTrigger.refresh();

      this.state = "closed";
    };
  }

  /** No transform animation at all — the overlay is already sitting at its
   *  resting full-screen position, so closing is only ever a fade to 0. */
  closeReduced(onComplete: () => void) {
    const { flip, backdrop, teaser, closeButton } = this;

    flip.style.willChange = "opacity";
    backdrop.style.willChange = "opacity";

    const tl = gsap.timeline({ onComplete });
    tl.to([teaser, closeButton], { opacity: 0, duration: DURATION_REDUCED_OUT * 0.5, ease: "none" }, 0);
    tl.to(
      [flip, backdrop],
      { opacity: 0, duration: DURATION_REDUCED_OUT, ease: "power1.in" },
      DURATION_REDUCED_OUT * 0.15,
    );

    return tl;
  }

  closeFull(onComplete: () => void) {
    const { flip, camera, backdrop, teaser, closeButton, layers } = this;
    const card = this.sourceCard;

    // All reads first, in one batch, before a single write. The card has not
    // moved while the dive was open — scroll was locked and the pin held —
    // but it is still cheaper to read it than to have cached a stale rect.
    const work = card?.closest("a-work") as HTMLElement | null;
    const rect = card?.getBoundingClientRect() ?? null;
    const projection = work ? projectionOf(work) : { scale: 1, rotationY: 0 };
    const toX = rect ? rect.left + rect.width / 2 - window.innerWidth / 2 : 0;
    const toY = rect ? rect.top + rect.height / 2 - window.innerHeight / 2 : 0;

    flip.style.willChange = "transform";
    camera.style.willChange = "transform";
    backdrop.style.willChange = "opacity";
    layers.fore.style.willChange = "opacity";
    layers.near.style.willChange = "opacity";
    layers.mid.style.willChange = "opacity";
    // The exit tweens the same two full-viewport gradients the entry does, so
    // it pays the same raster cost without the same hint: measured at 390x844
    // DPR 2, 97.5 ms of RasterTask per close unhinted against 31.6 ms hinted,
    // 7 of 7 pairs, ranges non-overlapping. buildOnClosed() already clears
    // both, so this adds no new teardown path.
    this.glow.style.willChange = "opacity";
    this.vignette.style.willChange = "opacity";

    const tl = gsap.timeline({ onComplete });

    tl.to([teaser, closeButton], { opacity: 0, duration: DURATION_OUT * 0.3, ease: "none" }, 0);
    tl.to(
      [this.glow, this.vignette],
      { opacity: 0, duration: DURATION_OUT * 0.4, ease: "none" },
      0,
    );
    tl.to(
      [layers.mid, layers.near, layers.fore],
      { opacity: 1, duration: DURATION_OUT * 0.5, ease: "none" },
      DURATION_OUT * 0.2,
    );
    tl.to(camera, { z: 0, duration: DURATION_OUT, ease: "power2.out" }, 0);
    tl.to(
      flip,
      {
        x: toX,
        y: toY,
        scale: projection.scale,
        rotationY: projection.rotationY,
        duration: DURATION_OUT,
        ease: "power2.inOut",
      },
      0,
    );
    tl.to(backdrop, { opacity: 0, duration: DURATION_OUT * 0.45, ease: "power1.in" }, DURATION_OUT * 0.4);

    return tl;
  }

  /* ----------------------------------------------------------------- lock */

  lockScroll() {
    this.lockedScrollY = window.scrollY;
    document.documentElement.style.overflow = "hidden";

    // overflow: hidden on <html> is enough on desktop Chrome and Firefox, and
    // Step 0 measured it holding scrollY, the pin and the geometry cache.
    // iOS Safari has historically ignored it for touch scrolling and there is
    // no real iOS device in this project's harness, so that specific claim is
    // NOT verified — these non-passive cancels are what actually covers it.
    window.addEventListener("wheel", this.onLockedScroll, { passive: false });
    window.addEventListener("touchmove", this.onLockedScroll, { passive: false });
  }

  unlockScroll() {
    document.documentElement.style.overflow = "";
    window.removeEventListener("wheel", this.onLockedScroll);
    window.removeEventListener("touchmove", this.onLockedScroll);

    // Belt and braces: nothing measured moved the offset, but the exit is
    // cheap insurance against a browser that clamps it anyway.
    if (window.scrollY !== this.lockedScrollY) {
      window.scrollTo({ top: this.lockedScrollY, behavior: "instant" as ScrollBehavior });
    }
  }
}

export function initDiveTransition(section?: PausableSection) {
  const dive = new DiveTransition();
  dive.init(section);
  return dive;
}
