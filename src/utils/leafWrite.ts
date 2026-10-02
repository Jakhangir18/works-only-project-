/**
 * Writes a style property on a leaf only when the value has changed.
 *
 * ScrollTrigger drivers call their apply() on every scroll frame across a
 * whole section, and for most of it a leaf holds a constant; writing the
 * same value again is the rewrite this repository already paid for once on
 * the rocket driver. The rocket and the star field both need the skip, so
 * it lives here once.
 */

const last = new WeakMap<HTMLElement, Map<string, string>>();

export function writeIfChanged(el: HTMLElement, prop: string, value: string): void {
  let props = last.get(el);
  if (!props) {
    props = new Map();
    last.set(el, props);
  }
  if (props.get(prop) === value) return;
  props.set(prop, value);
  el.style.setProperty(prop, value);
}

/* On destroy, so a later init on the same element writes its first value. */
export function forgetLeaf(el: HTMLElement): void {
  last.delete(el);
}
