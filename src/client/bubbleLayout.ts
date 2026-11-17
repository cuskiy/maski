export function markMultilineBubbles(root: HTMLElement): void {
  const bubbles = Array.from(root.querySelectorAll<HTMLElement>(".bubble"));
  for (const bubble of bubbles) {
    const text = bubble.querySelector<HTMLElement>(".message-text");
    const multiline = text !== null && text.getClientRects().length > 1;
    if (bubble.classList.contains("is-multiline") !== multiline) {
      bubble.classList.toggle("is-multiline", multiline);
    }
  }
}
