/**
 * The offset a visitor left the work at, parked in sessionStorage for the
 * trip back from a case page, with the time it was parked. A key read more
 * than MAX_AGE later is ignored: before this (PERF-NOTES, "stale
 * returnScrollY") a visitor who opened a case page, left by any other route
 * and came back to the home later in the session landed on the old offset
 * with no intro. Storage may be blocked: every call is guarded.
 */
const MAX_AGE = 30 * 60 * 1000;

export function parkReturn(key: string, y: number): void {
  try {
    sessionStorage.setItem(key, `${Math.round(y)}|${Date.now()}`);
  } catch {
    /* Storage blocked: the home plays its intro instead. */
  }
}

/** The parked offset if it is fresh, else null; never removes it. */
export function peekReturn(key: string): number | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const [y, t] = raw.split("|").map((n) => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(t) || Date.now() - t > MAX_AGE) return null;
  return y;
}

/** The parked offset if it is fresh, else null; the key is removed either way. */
export function takeReturn(key: string): number | null {
  const y = peekReturn(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* nothing to remove */
  }
  return y;
}
