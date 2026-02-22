/**
 * rocketFrameAnimator.ts
 * Fixed background rocket motion controller.
 * Works with RocketBackground positioned fixed.
 * Exposes window.updateRocketMotion(progress) called by RocketStorySection.
 */

import gsap from 'gsap'

gsap.registerPlugin()

export function initRocketMotionController(): void {
  const rocketContainer = document.querySelector('.js-rocket-container') as HTMLElement

  if (!rocketContainer) return

  // Check for prefers-reduced-motion
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) {
    window.updateRocketMotion = () => {
      rocketContainer.style.transform = `translate3d(0, 0, 0) rotateZ(0deg)`
    }
    return
  }

  // Responsive parameters
  const isMobile = window.innerWidth < 768
  const TX_MAX = isMobile ? 100 : 280   // max left/right movement
  const TY_MAX = isMobile ? 80 : 120    // max up/down movement

  /**
   * Update rocket rotation and position based on scroll progress (0..1).
   * Called every scroll frame from RocketStorySection.
   */
  window.updateRocketMotion = function(progress: number) {
    let x = 0, y = 0, rotation = 0

    const START_X = isMobile ? 80 : 180  // Starting position (right side)

    // Slide 1 (0–0.25): Hold position on the right
    if (progress <= 0.25) {
      x = START_X
      y = 0
      rotation = 0
    }
    // Slide 2 (0.25–0.50): Rotate and move left + down
    else if (progress <= 0.50) {
      const p = (progress - 0.25) / 0.25
      const ease = gsap.parseEase('power2.inOut')(p)
      x = gsap.utils.interpolate(START_X, -TX_MAX, ease)
      y = gsap.utils.interpolate(0, TY_MAX * 0.5, ease)
      rotation = gsap.utils.interpolate(0, 60, ease)
    }
    // Slide 3 (0.50–0.75): Settle back toward horizontal
    else if (progress <= 0.75) {
      const p = (progress - 0.50) / 0.25
      const ease = gsap.parseEase('power2.inOut')(p)
      x = gsap.utils.interpolate(-TX_MAX, -TX_MAX * 0.3, ease)
      y = gsap.utils.interpolate(TY_MAX * 0.5, -TY_MAX * 0.3, ease)
      rotation = gsap.utils.interpolate(60, 30, ease)
    }
    // Slide 4 (0.75–1.00): Final rise and tilt
    else {
      const p = (progress - 0.75) / 0.25
      const ease = gsap.parseEase('power2.inOut')(p)
      x = gsap.utils.interpolate(-TX_MAX * 0.3, -TX_MAX * 0.1, ease)
      y = gsap.utils.interpolate(-TY_MAX * 0.3, -TY_MAX, ease)
      rotation = gsap.utils.interpolate(30, 20, ease)
    }

    // Apply transform
    rocketContainer.style.transform = `translate3d(${x}px, ${y}px, 0) rotateZ(${rotation}deg)`
  }

  // Initial update
  window.updateRocketMotion(0)

  // Cleanup on resize
  window.addEventListener('resize', () => {
    initRocketMotionController()
  }, { passive: true })
}
