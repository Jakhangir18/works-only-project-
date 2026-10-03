import { initSmoothScroll, getSmoothScroll } from "./SmoothScroll";
import { HOME_RETURN_KEY } from "./DiveTransition";
import { initReveal } from "./Reveal";
import { initMagnetic } from "./Magnetic";

/**
 * The light home page's controller.
 *
 * It does three things and no more: hold the page still while the opening
 * plays, take the cover away once the hero has something to show, and start
 * the smooth scroll. Everything else on this page is its own component.
 *
 * The old home page held a four-second screen with a progress bar counting
 * something it was not measuring. This waits for two real signals — the fonts
 * being ready, so the headline does not swap mid-animation, and the first
 * cover having decoded, so the wheel is not empty — with a ceiling so a slow
 * network cannot hold the page hostage.
 */

const MIN_MS = 900; // the opening is worth seeing; do not flash it
const MAX_MS = 2600; // and it never becomes a wall

const BLOCKED = "is-scroll-blocked";

function firstCoverDecoded(): Promise<void> {
  const img = document.querySelector<HTMLImageElement>(".anime-hero__screen img");
  if (!img) return Promise.resolve();
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

function ready(): Promise<void> {
  const fonts = document.fonts?.ready ?? Promise.resolve();
  return Promise.all([fonts, firstCoverDecoded()]).then(() => undefined);
}

function returnToWork(): void {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(HOME_RETURN_KEY);
    sessionStorage.removeItem(HOME_RETURN_KEY);
  } catch {
    return;
  }
  const top = saved === null ? NaN : parseInt(saved, 10);
  if (!Number.isFinite(top)) return;
  window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
  getSmoothScroll()?.scrollTo(top, { immediate: true });
}

function after(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function initAnimeSite(): void {
  if (typeof window === "undefined") return;

  // Headings arrive word by word as they scroll in. Started before the cover
  // leaves, so the hidden state is in place before anything can be seen.
  initReveal();
  // Explore and the work links lean toward a hovering pointer. Listeners
  // only; nothing runs until a pointer is over one of them.
  initMagnetic();

  // Back from a case page through the history, the page comes out of the
  // back-forward cache as it was, and the offset the dive parked is stale.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    try {
      sessionStorage.removeItem(HOME_RETURN_KEY);
    } catch {
      /* Storage blocked: nothing was parked either. */
    }
  });

  const intro = document.querySelector<HTMLElement>(".js-anime-intro");
  const root = document.documentElement;

  const reveal = () => {
    root.classList.remove(BLOCKED);
    intro?.classList.add("is-gone");
    // Smooth scroll starts only once the page can be scrolled at all, so its
    // first frame is not spent fighting a locked document.
    initSmoothScroll();
    // Back from a project opened with WORK's dive: the dive's teaser link
    // parked the offset it was opened at (DiveTransition.ts).
    returnToWork();
    // The cover is inert the moment it is transparent, but leaving it in the
    // tree keeps a full-viewport layer alive for nothing.
    window.setTimeout(() => intro?.remove(), 700);
  };

  // Whichever comes first: everything the hero needs, or the ceiling. The
  // minimum runs alongside rather than after it, so a warm cache waits 900 ms
  // and a cold one waits 2600 — not 900 plus whatever the network took.
  Promise.all([Promise.race([ready(), after(MAX_MS)]), after(MIN_MS)])
    .then(reveal)
    .catch(reveal);
}
