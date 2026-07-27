import Emitter from "./Emitter";
import Ticker from "./Ticker";

import { gsap } from "gsap";
import { SlowMo } from "gsap/EasePack";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger, SlowMo);

const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(
  navigator.userAgent,
);

class Section {
  el: HTMLElement;
  container: HTMLElement;
  ruler: HTMLElement;
  scene: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  title: HTMLElement;

  mask: {
    width: number;
    height: number;
    maxScale: number;
    lines: any[];
    el: HTMLElement;
    svg: HTMLElement;
    pathOuter: HTMLElement;
    pathInner: HTMLElement;
    pathLines: HTMLElement;
  };

  bounding: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  elAbsTop: number;
  elHeight: number;
  letters: any[];
  works: any[];
  points: any[];

  tl: gsap.core.Timeline;
  pinTrigger: ScrollTrigger;
  animationProgress: number;
  pointsProgress: number;
  last: {
    animationProgress: number;
    pointsProgress: number;
    state: number;
    scrollProgress: number | null;
  };
  scrollProgress: number;
  smoothScrollProgress: number;
  state: 0;
  speed: number;
  isPaused: boolean;

  constructor() {
    if (isSafariBrowser) {
      document.documentElement.classList.add("is-safari");
    }

    this.el = document.querySelector(".s-work");
    this.container = this.el.querySelector(".js-container");
    this.ruler = this.el.querySelector(".js-ruler");
    this.scene = this.container.querySelector(".js-scene");
    this.canvas = this.container.querySelector(".js-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.title = this.container.querySelector(".js-title");

    this.mask = {
      width: 0,
      height: 0,
      maxScale: 1,
      lines: [],
      el: this.el.querySelector(".js-mask"),
      svg: this.el.querySelector(".js-mask-svg"),
      pathOuter: this.el.querySelector(".js-mask-path-outer"),
      pathInner: this.el.querySelector(".js-mask-path-inner"),
      pathLines: this.el.querySelector(".js-mask-path-lines"),
    };

    this.letters = [];
    this.title.querySelectorAll(".js-letter").forEach((_letter) => {
      this.letters.push({ el: _letter, ghosts: [] });
    });

    this.works = [];
    this.container.querySelectorAll(".js-work").forEach((_work) => {
      this.works.push({ el: _work });
    });

    this.points = [];
    this.scrollProgress = 0;
    this.smoothScrollProgress = 0;
    this.last = {
      animationProgress: 0,
      pointsProgress: 0,
      state: 0,
      scrollProgress: null,
    };
    this.isPaused = true;

    // Defer the heavy DOM work until fonts and the base page are ready.
    const doInit = () => {
      if (document.readyState === "complete") {
        Ticker.nextTick(this.init, this);
      } else {
        Emitter.once("siteLoaded", this.init, this);
      }
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready
        .then(() => {
          // Safari resolves fonts.ready before layout with custom fonts settles.
          if (isSafariBrowser) {
            requestAnimationFrame(() => setTimeout(doInit, 150));
          } else {
            doInit();
          }
        })
        .catch(doInit);
    } else {
      setTimeout(doInit, 500);
    }
  }

  init() {
    this.setCtxStyle();
    this.setSize();
    this.setMask();
    this.el.classList.add("is-mask-ready");
    this.setPoints();
    this.setLetters();
    this.setWorks();
    this.setTimeline();
    this.bindEvents();

    ScrollTrigger.refresh();
    this.tick();

    // Safari can settle layout a frame late, so refresh once more.
    if (isSafariBrowser) {
      setTimeout(() => ScrollTrigger.refresh(), 400);
    }

    document.documentElement.classList.add("is-works-ready");
    Emitter.emit("worksReady");
  }

  bindEvents() {
    Emitter.on("contrastchange", this.setCtxStyle, this);
    Emitter.on("resize", this.onResize, this);

    this.el.addEventListener("intersect", this.onIntersect.bind(this), {
      passive: true,
    });

    this.syncIntersectState();
  }

  syncIntersectState() {
    const rect = this.el.getBoundingClientRect();
    const isIntersecting = rect.bottom > 0 && rect.top < window.innerHeight;
    this.setPausedState(!isIntersecting);
  }

  setPausedState(isPaused: boolean) {
    if (this.isPaused === isPaused) return;

    this.isPaused = isPaused;

    if (this.isPaused) {
      Emitter.off("tick", this.tick, this);
    } else {
      Emitter.on("tick", this.tick, this);
    }
  }

  resizeTimer: ReturnType<typeof setTimeout> | null = null;

  onResize(widthChanged: boolean, heightChanged: boolean) {
    if (widthChanged || heightChanged) {
      // Debounce (200ms) to avoid jank on iOS Safari resize events.
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.setCtxStyle();
        this.setSize();
        this.setMask();
        this.setPoints();
        this.setLetters();
        this.setWorks();
        this.setTimeline();
        ScrollTrigger.refresh();
      }, 200);
    }
  }

  onIntersect(e: any) {
    this.setPausedState(!e.detail.isIntersecting);
  }

  setCtxStyle() {
    const color = getComputedStyle(this.el).getPropertyValue("--color-primary");
    Ticker.nextTick(() => {
      this.ctx.strokeStyle = color;
    });
  }

  setSize() {
    // Use px instead of vh/lvh to avoid iOS address-bar resize jitter.
    const unitHeight = (window as any).safeHeight || window.innerHeight;
    this.el.style.setProperty(
      "--height",
      (this.works.length * 50 * unitHeight) / 100 + "px",
    );

    const bounding = this.container.getBoundingClientRect();
    this.bounding = {
      left: bounding.left,
      top: bounding.top,
      width: (window as any).safeWidth,
      height: (window as any).safeHeight,
    };

    // Cache the section's absolute position so tick() can derive scroll
    // progress from window.scrollY alone, without per-frame rect reads.
    const elRect = this.el.getBoundingClientRect();
    this.elAbsTop = elRect.top + window.scrollY;
    this.elHeight = elRect.height;

    this.canvas.width = this.bounding.width;
    this.canvas.height = this.bounding.height;
    this.speed = Math.hypot(this.bounding.width, this.bounding.height) * 4;

    // Phone keeps the canvas static (iOS jitter); drop any stale inline
    // transform when resizing across the breakpoint.
    if (this.bounding.width < 576) this.canvas.style.transform = "";
    this.last.scrollProgress = null;
  }

  setMask() {
    const { mask } = this;

    const width = (window as any).safeWidth || window.innerWidth;
    const height = (window as any).safeHeight || window.innerHeight;

    mask.width = width;
    mask.height = height;
    mask.svg.style.width = width + "px";
    mask.svg.style.height = height + "px";

    const isMobile = width < 576;
    const isTablet = width < 987;
    const rulerWidthPct = isMobile ? 0.95 : isTablet ? 0.85 : 0.98;
    const rulerMaxPx =
      width >= 987
        ? width * 0.98
        : width >= 576
          ? width * 0.85
          : width * 0.95;
    const rulerWidth = Math.min(width * rulerWidthPct, rulerMaxPx);
    const rulerHeight = height * 0.8;
    const offsetX = (width - rulerWidth) / 2;
    const offsetY = height * 0.1;

    const dOuter = `M -2 -2 L ${width + 2} -2 L ${width + 2} ${height + 2} L -2 ${height + 2} Z`;

    const corners = {
      tl: { x: offsetX, y: offsetY },
      tr: { x: offsetX + rulerWidth, y: offsetY },
      br: { x: offsetX + rulerWidth, y: offsetY + rulerHeight },
      bl: { x: offsetX, y: offsetY + rulerHeight },
    };

    let size = (corners.tr.x - corners.tl.x) / 2;
    mask.maxScale = width / size;

    let dInner = `M ${corners.tl.x} ${corners.tl.y + size} A ${size} ${size} 0 0 1 ${corners.tr.x} ${corners.tr.y + size} L ${corners.br.x} ${corners.br.y - size} A ${size} ${size} 0 0 1 ${corners.bl.x} ${corners.bl.y - size} Z`;
    const linesClip = `${dOuter} ${dInner}`;
    mask.pathOuter.setAttribute("d", `${dOuter} ${dInner}`);

    const thickness = width > 767 ? 16 : 8;
    corners.tl.x += thickness;
    corners.tl.y += thickness;
    corners.tr.x -= thickness;
    corners.tr.y += thickness;
    corners.br.x -= thickness;
    corners.br.y -= thickness;
    corners.bl.x += thickness;
    corners.bl.y -= thickness;

    size = (corners.tr.x - corners.tl.x) / 2;
    dInner = `M ${corners.tl.x} ${corners.tl.y + size} A ${size} ${size} 0 0 1 ${corners.tr.x} ${corners.tr.y + size} L ${corners.br.x} ${corners.br.y - size} A ${size} ${size} 0 0 1 ${corners.bl.x} ${corners.bl.y - size} Z`;
    mask.pathInner.setAttribute("d", `${dOuter} ${dInner}`);

    mask.lines = [];
    const vLines = width > 767 ? 12 : 8;
    const gapX = width / vLines;
    const gapY = height * 0.1;
    const hLines = Math.ceil(height / gapY);

    for (let i = 1; i < vLines; i++) {
      const x = gapX * i;
      mask.lines.push({ p1: { x, y: 0 }, p2: { x, y: height } });
    }

    for (let i = 0; i < hLines; i++) {
      const y = gapY * i;
      mask.lines.push({ p1: { x: 0, y }, p2: { x: width, y } });
    }

    let dLines = "";
    mask.lines.forEach((line) => {
      dLines += `M ${line.p1.x} ${line.p1.y} L ${line.p2.x} ${line.p2.y} `;
    });

    mask.pathLines.setAttribute("d", dLines);

    const linesClipShape = this.el.querySelector(".js-lines-clip-shape");
    if (linesClipShape) {
      linesClipShape.setAttribute("d", linesClip);
    }
  }

  setLetters() {
    const { letters, scene } = this;

    letters.forEach((letter: any, j: number) => {
      letter.ghosts.forEach((ghost: any) => ghost.el.remove());
      letter.ghosts = [];

      // Measure the visible title glyph before cloning it into the tunnel.
      const bounding = letter.el.getBoundingClientRect();
      letter.width = bounding.width;
      letter.height = bounding.height;
      letter.top = bounding.top - this.bounding.top;
      letter.left = bounding.left;
      letter.freq = 1 + Math.random();
      letter.iy = ((j + 1) / (letters.length + 1) - 0.5) * 2;

      const multiplier = (window as any).safeWidth > 767 ? 0.75 : 0.5;
      letter.total =
        Math.round((this.bounding.width / letter.width) * multiplier) + 2;

      for (let i = 0; i < letter.total; i++) {
        const el = document.createElement("span");
        el.classList.add("s__scene__letter", "js-letter");
        el.innerText = letter.el.innerText;
        el.dataset.letter = letter.el.innerText;

        const shadow = document.createElement("span");
        shadow.classList.add("s__scene__letter__shadow");
        shadow.setAttribute("aria-hidden", "true");
        shadow.innerText = letter.el.innerText;
        el.appendChild(shadow);

        scene.appendChild(el);

        const ghost = {
          el,
          shadow,
          x: letter.left,
          y: letter.top,
          z: Math.random() * 100,
          i: i - letter.total * 0.5,
          p: (i / letter.total - 0.5) * 2,
          ap: Math.abs(i / letter.total - 0.5) * 2,
          mx: 0,
          my: 0,
          lastProgress: null as number | null,
        };

        el.style.top = ghost.y + "px";
        el.style.left = ghost.x + "px";
        el.style.zIndex = String(
          j !== 1 && j !== 2 && (j + letters.length + i) % 5 === 0 ? 3 : 1,
        );

        letter.ghosts.push(ghost);
      }
    });
  }

  setWorks() {
    this.works.forEach((work: any, i: number) => {
      work.el.style.setProperty("--size", String(0.5 + Math.random() * 0.5));
      work.el.style.setProperty(
        "--y",
        String((0.5 + Math.random() * 0.5) * (i % 2 ? -1 : 1)),
      );
    });
  }

  setTimeline() {
    const { el, container, works, scene, mask } = this;
    const worksEl = works.map((w: any) => w.el);

    // tl.kill() does not kill the timeline's ScrollTrigger — without the
    // explicit kill every resize leaked a trigger and its listeners.
    if (this.tl) {
      this.tl.scrollTrigger?.kill();
      this.tl.kill();
    }
    if (this.pinTrigger) this.pinTrigger.kill();

    const maskOuter = mask.el.parentElement as HTMLElement;

    this.pinTrigger = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      pin: container,
      pinSpacing: false,
      anticipatePin: 1,
    });

    // --state is mirrored onto the ghost letters in moveLetters(); writing
    // it here on the scene container would invalidate the whole subtree
    // (all cards included) on every scrub update.
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: "top bottom",
        end: "bottom top",
        scrub: 1,
      },
    });

    maskOuter.style.opacity = "1";
    maskOuter.style.transform = "translate3d(0, 0, 0)";

    tl.fromTo(mask.el, { scale: 1 }, { scale: mask.maxScale, duration: 1.5, ease: "power4.in" }, 0);
    tl.fromTo(scene, { scale: 0.75 }, { scale: 1, duration: 1.5, ease: "power3.in" }, 0);
    tl.fromTo(container, { clipPath: "inset(0 1rem)" }, { clipPath: "inset(0 0rem)", duration: 1.5, ease: "power3.in" }, 0);
    tl.fromTo(this, { pointsProgress: 0 }, { pointsProgress: 1, duration: 1, ease: "power4.inOut" }, 0);
    tl.fromTo(this, { state: 0 }, { state: 1, duration: 1.5, ease: "power4.in" }, 0);

    // Delay card animations until mask is fully open (1.5s + 0.3s pause).
    tl.fromTo(worksEl, { attr: { progress: 1 } }, { attr: { progress: -1 }, ease: "slow(0.15, 0.6)", stagger: 0.25 }, 1.8);
    tl.fromTo(this, { animationProgress: 0 }, { animationProgress: 10000, duration: tl.totalDuration(), ease: "power1.out" }, 1.8);

    tl.fromTo(this, { state: 1 }, { state: 0, duration: 0.75, ease: "power4.inOut", immediateRender: false }, "-=1");
    tl.fromTo(mask.el, { scale: mask.maxScale }, { scale: 1, duration: 0.75, ease: "power4.inOut", immediateRender: false }, "-=1");
    tl.fromTo(scene, { scale: 1 }, { scale: 0.75, duration: 0.75, ease: "power3.inOut", immediateRender: false }, "-=1");
    tl.fromTo(container, { clipPath: "inset(0 0rem)" }, { clipPath: "inset(0 1rem)", duration: 0.75, ease: "power3.inOut", immediateRender: false }, "-=1");
    tl.fromTo(this, { pointsProgress: 1 }, { pointsProgress: 0, duration: 1, ease: "power4.inOut" }, "-=1");

    this.tl = tl;
  }

  moveLetters() {
    const { speed, letters, animationProgress } = this;

    const state = Math.round(this.state * 1000) / 1000;
    const stateChanged = state !== this.last.state;

    // With the tunnel closed every letter transform collapses to identity
    // and the shadows are invisible, so there is nothing to write.
    if (!stateChanged && state === 0) return;

    letters.forEach((letter: any) => {
      const letterSpeed = speed * letter.freq;
      letter.ghosts.forEach((ghost: any, index: number) => {
        const progress =
          (((animationProgress % letterSpeed) / letterSpeed +
            index / letter.total) %
            1) /
            0.7 -
          0.15;
        const rounded = Math.round(progress * 10000) / 10000;

        if (!stateChanged && rounded === ghost.lastProgress) return;
        ghost.lastProgress = rounded;

        // Precomputed inline transform/opacity take Blink's cheap recalc
        // path; the old var()/calc() chains re-resolved on the element and
        // its pseudo cost 2-4ms per ghost per frame.
        const head = (rounded - 0.5) * -2;
        const ahead = head * head;

        ghost.el.style.transform =
          `rotateY(${head * -10 * state}deg) ` +
          `translate3d(${head * 50 * state}vw, ${letter.iy * 50 * ahead * state}%, 0)`;

        ghost.shadow.style.opacity = String(Math.min(state * 2, 1));
        ghost.shadow.style.transform =
          `scale(1.05, 1.02) translate3d(${head * 0.1 * state * state}rem, 0, 0)`;
        ghost.shadow.style.transformOrigin = `${50 - head * 50}% -50%`;
      });
    });

    this.last.state = state;
  }

  setPoints() {
    const { bounding } = this;
    this.points = [];

    const gap = 24;
    const cols = Math.ceil((bounding.width * 1.2) / gap);
    const rows = Math.ceil((bounding.height * 1.2) / gap);
    const offsetX = (bounding.width - cols * gap) * 0.5;
    const offsetY = (bounding.height - rows * gap) * 0.5;
    const hWidth = bounding.width * 0.5;
    const hHeight = bounding.height * 0.5;

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * gap + offsetX;
        const y = j * gap + offsetY;
        this.points.push({
          x,
          y,
          dx: hWidth - x,
          dy: hHeight - y,
          m: Math.random(),
          flowX: 0,
        });
      }
    }
  }

  movePoints() {
    const { points, animationProgress } = this;
    points.forEach((p: any) => {
      p.flowX = (animationProgress * -0.05) % 24;
    });
  }

  drawPoints() {
    const { bounding, ctx, points, animationProgress, pointsProgress, last } =
      this;

    const rAnimationProgress = Math.round(animationProgress * 100) / 100;
    const rPointsProgress = Math.round(pointsProgress * 100) / 100;

    if (
      rPointsProgress === last.pointsProgress &&
      rAnimationProgress === last.animationProgress
    )
      return;

    ctx.clearRect(0, 0, bounding.width, bounding.height);
    ctx.beginPath();

    points.forEach((point: any) => {
      const x =
        point.x + point.dx * (1 - pointsProgress) * 0.2 + point.flowX;
      const y = point.y + point.dy * (1 - pointsProgress) * 0.2;
      ctx.rect(x, y, 0.5, 0.5);
    });

    ctx.stroke();

    last.pointsProgress = rPointsProgress;
    last.animationProgress = rAnimationProgress;
  }

  tick() {
    // Same math as ScrollTrigger.positionInViewport(el, "top"/"bottom"),
    // but from cached geometry — the rect reads landed right after GSAP's
    // scrub writes and forced a reflow every frame.
    const vh = this.bounding.height;
    const topInVp = (this.elAbsTop - window.scrollY) / vh;
    const bottomInVp = (this.elAbsTop + this.elHeight - window.scrollY) / vh;
    this.scrollProgress =
      Math.max(Math.min(1, topInVp), 0) * -1 +
      (1 - Math.max(Math.min(1, bottomInVp), 0));

    this.smoothScrollProgress +=
      (this.scrollProgress - this.smoothScrollProgress) * 0.1;

    // Write the two consumers directly instead of publishing an inherited
    // custom property on the section root — that invalidated the entire
    // ~1600-node subtree every frame.
    const sp = Math.round(this.scrollProgress * 10000) / 10000;
    if (sp !== this.last.scrollProgress) {
      this.last.scrollProgress = sp;
      (this.mask.pathInner as HTMLElement).style.transform =
        `translate3d(0, ${sp * 48}px, 0)`;
      if (this.bounding.width >= 576) {
        this.canvas.style.transform =
          `translate3d(0, ${sp * -0.05 * this.bounding.height}px, 0)`;
      }
    }

    this.movePoints();
    this.moveLetters();
    this.drawPoints();
  }
}

export function initWorkSection() {
  return new Section();
}
