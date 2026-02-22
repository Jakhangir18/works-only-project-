/**
 * window-globals.ts
 * Declare global window functions used by rocket story components.
 */

declare global {
  interface Window {
    updateRocketFrame?: (progress: number) => void
    updateRocketMotion?: (progress: number) => void
    updateTextSlides?: (progress: number) => void
  }
}

export {}
