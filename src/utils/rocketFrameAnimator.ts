/**
 * rocketFrameAnimator.ts
 * Fixed background rocket motion controller.
 * Works with RocketBackground positioned fixed.
 * Exposes window.updateRocketMotion(progress) called by RocketStorySection.
 */

import gsap from "gsap";

gsap.registerPlugin();

export function initRocketMotionController(): void {
  const rocketContainer = document.querySelector(
    ".js-rocket-container",
  ) as HTMLElement;

  if (!rocketContainer) return;

  // Respect reduced-motion preferences and keep the rocket static.
  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (prefersReduced) {
    window.updateRocketMotion = () => {
      rocketContainer.style.transform = `translate3d(0, 0, 0) rotateZ(0deg)`;
    };
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

  // Start from a neutral pose.
  window.updateRocketMotion(0);
}
