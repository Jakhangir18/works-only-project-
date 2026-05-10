import Emitter from "./Emitter";

import { gsap } from "gsap/gsap-core";

class Ticker {
  /**
  * Constructor: collect one-shot callbacks and keep the last delta.
   */
  constructor() {
    this.callbacks = [];

    this.delta = 0;
  }

  /**
  * Init the shared GSAP ticker.
   */
  init() {
    gsap.ticker.add(this.tick.bind(this));
  }

  /**
  * Tick the queued callbacks and emit the shared tick event.
   */
  tick(time, delta) {
    const self = this;

    this.delta = delta;

    this.callbacks.forEach((object, index) => {
      object.callback.apply(object.context);

      delete self.callbacks[index];
    });

    Emitter.emit("tick", time * 1000);
  }

  /**
  * Schedule a callback for the next animation frame.
   */
  nextTick(callback, context) {
    this.callbacks.push({
      callback,
      context,
    });
  }
}

export default new Ticker();
