export function markMultilineBubbles(root: HTMLElement): void {
  const bubbles = Array.from(root.querySelectorAll<HTMLElement>(".bubble"));
  for (const bubble of bubbles) {
    const text = bubble.querySelector<HTMLElement>(".message-text");
    if (text === null) {
      bubble.classList.remove("is-multiline");
      continue;
    }
    bubble.classList.remove("is-multiline");
    const lineHeight = Number.parseFloat(getComputedStyle(text).lineHeight);
    const multiline = Number.isFinite(lineHeight) && text.getBoundingClientRect().height > lineHeight * 1.5;
    bubble.classList.toggle("is-multiline", multiline);
  }
}
