/**
 * rocketFrameAnimator.ts
 * Fixed background rocket motion controller.
 * Works with RocketBackground positioned fixed.
 * Exposes window.updateRocketMotion(progress) called by RocketStorySection.
 */

import gsap from "gsap";

gsap.registerPlugin();

/**
 * The last progress the controller was driven to, kept across re-inits.
 * TransitionVideo re-initialises this controller on a 200 ms resize debounce,
 * and the story section's own resize handler runs immediately — 200 ms before
 * it — so it can never repair what the re-init does. Ending the re-init at
 * progress 0 snapped the rocket from its scrolled pose to its start pose
 * (measured at 45% of the story: canvas left 30 px -> 540 px, rotation 50 deg
 * -> 0 deg) and, when the resize produced no follow-on scroll event, it stayed
 * there. Replaying the last progress makes the re-init a no-op on screen.
 */
let lastProgress = 0;

let motionQueryBound = false;

export function initRocketMotionController(): void {
  // Reduce Motion can be turned on with the page already open, and nothing
  // else re-runs this: the only other caller is a 200 ms resize debounce, and
  // changing the OS setting fires no resize. Bound once, because this function
  // runs again on every resize.
  if (!motionQueryBound && typeof window !== "undefined") {
    motionQueryBound = true;
    window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .addEventListener("change", () => initRocketMotionController());
  }

  const rocketContainer = document.querySelector(
    ".js-rocket-container",
  ) as HTMLElement;

  if (!rocketContainer) return;

  // Respect reduced-motion preferences and keep the rocket static.
  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (prefersReduced) {
    window.updateRocketMotion = (progress: number) => {
      lastProgress = progress;
      rocketContainer.style.transform = `translate3d(0, 0, 0) rotateZ(0deg)`;
    };
    // Apply it once, exactly as the full-motion path does at the end of this
    // function. Without this, turning Reduce Motion on mid-session leaves the
    // container holding whatever full-motion transform it had until the next
    // scroll frame.
    window.updateRocketMotion(lastProgress);
    return;
  }

  // Responsive movement limits keep the rocket visible on smaller screens.
  const isMobile = window.innerWidth < 768;
  const TX_MAX = isMobile ? 30 : 280; // mobile: minimal side movement so rocket stays visible
  const TY_MAX = isMobile ? 40 : 120; // mobile: minimal vertical movement

  /**
   * Update rocket rotation and position based on scroll progress (0..1).
   * Called every scroll frame from RocketStorySection.
   */
  window.updateRocketMotion = function (progress: number) {
    lastProgress = progress;
    let x = 0,
      y = 0,
      rotation = 0;

    const START_X = isMobile ? 0 : 180; // mobile: start centered

    // Slide 1 holds the rocket in place.
    if (progress <= 0.25) {
      x = START_X;
      y = 0;
      rotation = isMobile ? 10 : 0;
    }
    // Slide 2 rotates and drifts the rocket off-center.
    else if (progress <= 0.5) {
      const p = (progress - 0.25) / 0.25;
      const ease = gsap.parseEase("power2.inOut")(p);
      x = gsap.utils.interpolate(START_X, isMobile ? -TX_MAX : -TX_MAX, ease);
      y = gsap.utils.interpolate(0, TY_MAX * 0.5, ease);
      rotation = gsap.utils.interpolate(
        isMobile ? 10 : 0,
        isMobile ? 40 : 60,
        ease,
      );
    }
    // Slide 3 settles the motion before the final rise.
    else if (progress <= 0.75) {
      const p = (progress - 0.5) / 0.25;
      const ease = gsap.parseEase("power2.inOut")(p);
      x = gsap.utils.interpolate(-TX_MAX, -TX_MAX * 0.3, ease);
      y = gsap.utils.interpolate(TY_MAX * 0.5, -TY_MAX * 0.3, ease);
      rotation = gsap.utils.interpolate(
        isMobile ? 40 : 60,
        isMobile ? 20 : 30,
        ease,
      );
    }
    // Slide 4 finishes with the upward exit motion.
    else {
      const p = (progress - 0.75) / 0.25;
      const ease = gsap.parseEase("power2.inOut")(p);
      x = gsap.utils.interpolate(-TX_MAX * 0.3, -TX_MAX * 0.1, ease);
      y = gsap.utils.interpolate(-TY_MAX * 0.3, -TY_MAX, ease);
      rotation = gsap.utils.interpolate(
        isMobile ? 20 : 30,
        isMobile ? 10 : 20,
        ease,
      );
    }

    // Apply the computed transform in one write.
    rocketContainer.style.transform = `translate3d(${x}px, ${y}px, 0) rotateZ(${rotation}deg)`;
  };

  // Restore the pose the visitor is actually scrolled to. On the first init
  // lastProgress is 0, so this is the neutral pose it always was.
  window.updateRocketMotion(lastProgress);
}
