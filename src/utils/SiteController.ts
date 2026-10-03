import Emitter from "./Emitter";
import Ticker from "./Ticker";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

declare global {
  interface Window {
    safeWidth: number;
    safeHeight: number;
    maxScrollTop: number;
    scrollProgress: number;
  }
}

class Site {
  timeouts: any = { resizeThrottle: null };

  hasSiteLoaded = false;
  worksWaitTimer = 0;
  hasWorksReady = false;
  introStarted = false;
  isReturning = false;

  windowWidth: number;
  windowHeight: number;
  clientWidth: number;
  clientHeight: number;

  constructor() {
    // Add OS class so components can branch on platform quirks.
    let os = "unknown";
    if (navigator.userAgent.indexOf("Win") !== -1) os = "windows";
    else if (navigator.userAgent.indexOf("Android") !== -1) os = "android";
    else if (navigator.userAgent.indexOf("Mac") !== -1) os = "mac";
    else if (navigator.userAgent.indexOf("Linux") !== -1) os = "linux";
    document.documentElement.classList.add(`is-${os}`);

    let browser = "unknown";
    if (navigator.userAgent.indexOf("Firefox") !== -1) browser = "firefox";
    else if (navigator.userAgent.indexOf("Chrome") !== -1) browser = "chrome";
    else if (navigator.userAgent.indexOf("Safari") !== -1) browser = "safari";
    document.documentElement.classList.add(`is-${browser}`);

    // Returning from a project page skips the loader and restores scroll.
    if (
      sessionStorage.getItem("returnScrollY") !== null ||
      sessionStorage.getItem("returnToWorks") !== null
    ) {
      this.isReturning = true;
    } else {
      this.animateLoader();
    }

    this.bindEvents();
  }

  init() {
    Ticker.init();
    this.onResize();

    if (document.documentElement.classList.contains("is-works-ready")) {
      this.hasWorksReady = true;
    }

    this.tryStartIntro();
  }

  animateLoader() {
    const progressBar = document.querySelector(
      ".js-loader-progress",
    ) as HTMLElement;
    if (!progressBar) return;

    const duration = 4000;
    const startTime = Date.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const raw = Math.min(elapsed / duration, 1);
      progressBar.style.width = `${easeOutCubic(raw) * 100}%`;
      if (raw < 1) requestAnimationFrame(animate);
    };

    animate();
  }

  bindEvents() {
    window.addEventListener("resize", this.resizeThrottle.bind(this));
    window.addEventListener("scroll", this.onScroll.bind(this), {
      passive: true,
    });

    Emitter.on("updateViewport", this.onResize, this, true);
    Emitter.on("siteLoaded", this.onSiteLoaded, this, true);
    Emitter.on("worksReady", this.onWorksReady, this, true);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.dispatchEvent(
            new CustomEvent("intersect", {
              detail: { isIntersecting: entry.isIntersecting },
            }),
          );

          if (entry.isIntersecting) {
            entry.target.classList.add("is-in-view");
            entry.target.classList.remove(
              "is-out-of-view",
              "is-out-of-view-top",
              "is-out-of-view-bottom",
            );
          } else {
            entry.target.classList.remove("is-in-view");
            entry.target.classList.add("is-out-of-view");
            entry.target.classList.toggle(
              "is-out-of-view-top",
              entry.boundingClientRect.top < 0,
            );
            entry.target.classList.toggle(
              "is-out-of-view-bottom",
              entry.boundingClientRect.top > 0,
            );
          }
        });
      },
      { threshold: 0 },
    );

    document.querySelectorAll("[data-intersect]").forEach((el) => {
      observer.observe(el);
    });

    if (document.readyState === "complete") {
      this.siteLoaded();
    } else {
      window.addEventListener("load", this.siteLoaded.bind(this), {
        once: true,
      });
    }

    this.onScroll();

    // Save scroll position before jumping to a project page. Covers both
    // route shapes: /work/* and /projects/* (the AMS card uses the latter).
    document
      .querySelectorAll('a[href^="/work/"], a[href^="/projects/"]')
      .forEach((link) => {
        link.addEventListener("click", () => {
          sessionStorage.setItem("returnScrollY", String(window.scrollY));
        });
      });
  }

  siteLoaded() {
    // Small delay so custom fonts are applied before measurements happen.
    setTimeout(() => {
      document.documentElement.classList.add("is-loaded");
      Emitter.emit("siteLoaded");
    }, 150);
  }

  onSiteLoaded() {
    this.hasSiteLoaded = true;
    this.capWorksWait();
    this.tryStartIntro();
  }

  onWorksReady() {
    this.hasWorksReady = true;
    this.tryStartIntro();
  }

  /**
   * The intro waits for the Work section so the tunnel never flashes in
   * half-built. Under a slow CPU that wait ran into double-digit seconds and
   * the whole page — hero included — stayed at opacity 0 behind the loader,
   * which put the largest contentful paint 11.5 s after navigation. The wait
   * is now capped: past the cap the page reveals and the tunnel finishes
   * building underneath it.
   */
  capWorksWait() {
    if (this.worksWaitTimer) return;
    this.worksWaitTimer = window.setTimeout(() => {
      if (this.hasWorksReady) return;
      this.hasWorksReady = true;
      this.tryStartIntro();
    }, 1200);
  }

  tryStartIntro() {
    if (this.introStarted || !this.hasSiteLoaded || !this.hasWorksReady) return;

    this.introStarted = true;
    Ticker.nextTick(this.intro, this);
  }

  resizeThrottle() {
    clearTimeout(this.timeouts.resizeThrottle);
    this.timeouts.resizeThrottle = setTimeout(() => {
      Ticker.nextTick(this.onResize, this);
    }, 200);
  }

  onResize() {
    const newWidth = window.innerWidth;
    let widthChanged = false;
    if (this.windowWidth !== newWidth) {
      if (this.windowWidth !== undefined) widthChanged = true;
      this.windowWidth = newWidth;
      this.clientWidth = document.body.clientWidth;
    }

    const newHeight = window.innerHeight;
    let heightChanged = false;
    if (this.windowHeight !== newHeight) {
      if (this.windowHeight !== undefined) heightChanged = true;
      this.windowHeight = newHeight;
      this.clientHeight = document.body.clientHeight;
    }

    window.safeWidth = newWidth;
    window.safeHeight = newHeight;

    // Stable viewport height var — iOS Safari changes innerHeight on scroll.
    document.documentElement.style.setProperty(
      "--real-vh",
      `${newHeight * 0.01}px`,
    );

    window.maxScrollTop = document.body.scrollHeight - window.safeHeight;
    this.setScrollProgress();

    Emitter.emit("resize", widthChanged, heightChanged);
  }

  onScroll() {
    this.setScrollProgress();
    Ticker.nextTick(() => {
      Emitter.emit("scroll", window.scrollY);
    });
  }

  setScrollProgress() {
    window.scrollProgress = window.scrollY / window.maxScrollTop;
  }

  intro() {
    const wrapper = document.querySelector(".js-site-wrapper") as HTMLElement;
    const loader = document.querySelector(".js-site-loader") as HTMLElement;

    const returnScrollY = sessionStorage.getItem("returnScrollY");
    const returnToWorks = sessionStorage.getItem("returnToWorks");

    // Returning from a project page — skip loader and restore scroll position.
    if (returnScrollY !== null || returnToWorks !== null) {
      sessionStorage.removeItem("returnScrollY");
      sessionStorage.removeItem("returnToWorks");
      if (loader) loader.remove();
      wrapper.style.opacity = "1";
      document.documentElement.classList.remove("is-scroll-blocked");

      if (returnScrollY !== null) {
        window.scrollTo({ top: parseInt(returnScrollY, 10), behavior: "instant" });
      } else {
        const worksEl = document.getElementById("work");
        if (worksEl) {
          // offsetTop is relative to the offsetParent, and .works-layer is
          // positioned — it returned 0 and dropped the visitor at the top.
          const top = worksEl.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top, behavior: "instant" });
        }
      }
      return;
    }

    if (loader) {
      gsap.to(loader, {
        opacity: 0,
        duration: 0.25,
        onComplete: () => loader.remove(),
      });
    }

    gsap.to(wrapper, {
      opacity: 1,
      duration: 0.3,
      onComplete: () => {
        document.documentElement.classList.remove("is-scroll-blocked");
      },
    });
  }
}

export function initSite() {
  const site = new Site();
  site.init();
}
