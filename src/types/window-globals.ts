/**
 * window-globals.ts
 * Declare global window functions used by rocket story components.
 */

declare global {
  interface Window {
    updateRocketFrame?: (progress: number) => void;
    updateRocketMotion?: (progress: number) => void;
    updateTextSlides?: (progress: number) => void;
    /** Which rocket frame source won the capability probe. */
    __rocketFrameSource?: "video" | "jpg";
    /** Set if the decoder failed mid-session and the JPG sequence took over. */
    __rocketVideoFellBack?: string;
    /** Warm-up seek result, read by perf/harness.mjs. */
    __rocketVideoProbe?: {
      ok: boolean;
      reason: string;
      warmupMs: number;
      secondSeekMs: number;
    };
  }
}

export {};
