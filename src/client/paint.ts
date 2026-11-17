/**
 * Runs a render on the next frame, and on a short timeout when frames are throttled: a tab in the
 * background still receives events, and its DOM has to be current when the reader comes back to it.
 */
const PAINT_FALLBACK_MS = 120;

export interface Painted {
  schedule(): void;
  cancel(): void;
}

export function schedulePaint(callback: () => void): Painted {
  let frame = 0;
  let timer = 0;
  const run = (): void => {
    if (frame === 0 && timer === 0) return;
    if (frame !== 0) cancelAnimationFrame(frame);
    if (timer !== 0) window.clearTimeout(timer);
    frame = 0;
    timer = 0;
    callback();
  };
  return {
    schedule: () => {
      if (frame !== 0 || timer !== 0) return;
      frame = requestAnimationFrame(run);
      timer = window.setTimeout(run, PAINT_FALLBACK_MS);
    },
    cancel: () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      if (timer !== 0) window.clearTimeout(timer);
      frame = 0;
      timer = 0;
    },
  };
}
