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
  { name: "far", growth: 1.15 }, // image plane: photo, or the colour panel
  { name: "mid", growth: 1.6 }, // dot grid
  { name: "near", growth: 2.2 }, // title
  { name: "fore", growth: 4.0 }, // index, cta and the card frame
] as const;

const depthOf = (growth: number) =>
  (growth * DOLLY) / (growth - 1) - PERSPECTIVE;

const compensationOf = (growth: number) =>
  (PERSPECTIVE + depthOf(growth)) / PERSPECTIVE;

const DURATION_IN = 1.15;
const DURATION_OUT = 0.7;

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
  accent: string;
  coverSrc: string;
  indexText: string;
  titleText: string;
  ctaText: string;
  href: string;
};

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
  glow!: HTMLElement;
  vignette!: HTMLElement;
  indexEl!: HTMLElement;
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
              <div class="dive__grid"></div>
            </div>
            <div class="dive__layer dive__layer--near">
              <div class="dive__title"></div>
            </div>
            <div class="dive__layer dive__layer--fore">
              <div class="dive__index"></div>
              <div class="dive__cta"></div>
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
    this.glow = q(".dive__glow");
    this.vignette = q(".dive__vignette");
    this.indexEl = q(".dive__index");
    this.titleEl = q(".dive__title");
    this.ctaEl = q(".dive__cta");
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

      // A layer sits at -depth: positive depth is behind the camera plane,
      // negative depth (the foreground) is in front of it.
      const z = (-depthOf(layer.growth)).toFixed(2);
      const k = compensationOf(layer.growth).toFixed(4);
      el.style.transform = `translateZ(${z}px) scale(${k})`;
    }

    document.body.appendChild(root);

    this.closeButton.addEventListener("click", this.onCloseClick);
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
    if (this.state === "open") {
      gsap.set(this.flip, {
        scale: this.endScale(this.cardBoxWidth, this.cardBoxHeight),
      });
    }
  };

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
      accent: indexEl?.style.color || "#ffffff",
      coverSrc: coverEl?.currentSrc || coverEl?.src || "",
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

    // The far plane is what the viewer arrives at. AMS arrives at its photo;
    // a composition card would otherwise arrive at flat paint, so it gets a
    // light source in its own accent instead. Both fade up from nothing, so
    // frame one still matches the card exactly.
    this.glow.style.display = reading.coverSrc ? "none" : "";
    this.glow.style.setProperty("--dive-accent", reading.accent);

    this.indexEl.textContent = reading.indexText;
    this.indexEl.style.color = reading.accent;
    this.titleEl.textContent = reading.titleText;
    this.ctaEl.textContent = reading.ctaText;
    this.ctaEl.style.color = reading.accent;

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

  play(reading: CardReading) {
    const { flip, camera, backdrop, teaser, closeButton, layers, cover } = this;

    if (this.tl) this.tl.kill();

    // will-change goes on only while the dive runs; the layers that stay at
    // constant opacity never get it.
    flip.style.willChange = "transform";
    camera.style.willChange = "transform";
    backdrop.style.willChange = "opacity";
    layers.fore.style.willChange = "opacity";
    layers.near.style.willChange = "opacity";
    layers.mid.style.willChange = "opacity";

    gsap.set(flip, {
      x: reading.centerX - window.innerWidth / 2,
      y: reading.centerY - window.innerHeight / 2,
      scale: reading.scale,
      rotationY: reading.rotationY,
    });
    gsap.set(camera, { xPercent: -50, yPercent: -50, z: 0 });
    gsap.set([layers.far, layers.mid, layers.near, layers.fore], { opacity: 1 });
    gsap.set(cover, { opacity: 0.85 });
    gsap.set([this.glow, this.vignette], { opacity: 0 });
    gsap.set(backdrop, { opacity: 0 });
    gsap.set(teaser, { opacity: 0, y: 24 });
    gsap.set(closeButton, { opacity: 0 });

    const tl = gsap.timeline({
      onComplete: () => {
        camera.style.willChange = "";
        layers.fore.style.willChange = "";
        layers.near.style.willChange = "";
        layers.mid.style.willChange = "";
        flip.style.willChange = "";
        backdrop.style.willChange = "";
        this.state = "open";
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
    tl.to(cover, { opacity: 1, duration: DURATION_IN * 0.5, ease: "none" }, 0);

    // The near layers have to leave before they reach the eye, or they end
    // the dive as a full-screen blur.
    tl.to(
      layers.fore,
      { opacity: 0, duration: DURATION_IN * 0.4, ease: "power1.in" },
      DURATION_IN * 0.28,
    );
    tl.to(
      layers.near,
      { opacity: 0, duration: DURATION_IN * 0.35, ease: "power1.in" },
      DURATION_IN * 0.45,
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

    this.tl = tl;
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

    document.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onWindowResize);

    const tl = gsap.timeline({
      onComplete: () => {
        this.root.classList.remove("is-open");
        this.root.setAttribute("aria-hidden", "true");

        camera.style.willChange = "";
        flip.style.willChange = "";
        backdrop.style.willChange = "";
        layers.fore.style.willChange = "";
        layers.near.style.willChange = "";
        layers.mid.style.willChange = "";

        if (card) card.style.visibility = "";
        this.sourceCard = null;

        this.unlockScroll();
        if (this.section) this.section.setPausedState(this.sectionWasPaused);

        // A resize mid-dive already made WorkSection re-measure and refresh
        // itself (it listens for the same window resize independently of
        // the dive), but that ran with the source card still
        // visibility:hidden and the overlay covering the viewport. Refresh
        // once more now that both are gone, so ScrollTrigger's start/end
        // math is against the page the visitor actually sees.
        if (this.resizedWhileOpen) ScrollTrigger.refresh();

        this.state = "closed";
      },
    });

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

    this.tl = tl;
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
