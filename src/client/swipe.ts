interface SwipeOptions {
  readonly target: string;
  readonly onSwipe: (element: HTMLElement, direction: "left" | "right") => void;
  readonly canStart?: (element: HTMLElement, event: PointerEvent) => boolean;
}

const THRESHOLD = 48;
const MAX_OFFSET = 72;

/** One delegated horizontal swipe handler. Vertical movement stays with the page. */
export function bindSwipe(root: HTMLElement, options: SwipeOptions): () => void {
  let source: HTMLElement | null = null;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let offset = 0;
  let horizontal = false;
  let suppressClickUntil = 0;

  const parent = (): HTMLElement | null => source?.parentElement ?? null;

  const reset = (): void => {
    if (source !== null) {
      source.style.removeProperty("transform");
      source.classList.remove("is-swiping-left", "is-swiping-right");
    }
    parent()?.classList.remove("is-swiping-left", "is-swiping-right");
    source = null;
    pointerId = null;
    startX = 0;
    startY = 0;
    offset = 0;
    horizontal = false;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const element = target.closest<HTMLElement>(options.target);
    if (element === null || (options.canStart !== undefined && !options.canStart(element, event))) return;
    source = element;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    offset = 0;
    horizontal = false;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (source === null || pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!horizontal) {
      if (Math.abs(dx) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        reset();
        return;
      }
      horizontal = true;
      source.classList.add("is-swiping");
      source.parentElement?.classList.add(dx > 0 ? "is-swiping-right" : "is-swiping-left");
      source.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx));
    source.style.transform = `translateX(${String(offset)}px)`;
    source.classList.toggle("is-swiping-right", offset > 0);
    source.classList.toggle("is-swiping-left", offset < 0);
    source.parentElement?.classList.toggle("is-swiping-right", offset > 0);
    source.parentElement?.classList.toggle("is-swiping-left", offset < 0);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (source === null || pointerId !== event.pointerId) return;
    const element = source;
    const direction = offset > THRESHOLD ? "right" : offset < -THRESHOLD ? "left" : null;
    reset();
    if (direction === null) return;
    suppressClickUntil = performance.now() + 400;
    options.onSwipe(element, direction);
  };

  const onPointerCancel = (): void => reset();

  const onClick = (event: MouseEvent): void => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClickUntil = 0;
  };

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  root.addEventListener("click", onClick, true);

  return () => {
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    root.removeEventListener("click", onClick, true);
    reset();
  };
}
